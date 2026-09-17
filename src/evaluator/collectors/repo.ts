import { parseGitHubRepoUrl, fetchGitHubJson, fetchRawGitHubFile, fetchGitHubReadme, type GitHubRepoDetails } from '../../lib/github.js';
import type { EvidenceItem, RepoSnapshot, ReviewRequest } from '../types.js';

interface GitHubTreeResponse {
  tree: Array<{ path: string; type: string }>;
}

export async function collectRepoSnapshot(request: ReviewRequest, evidence: EvidenceItem[]): Promise<RepoSnapshot> {
  const { owner, repo, branch: requestedBranch } = parseGitHubRepoUrl(request.repoUrl);

  let defaultBranch: string | undefined = requestedBranch;
  if (!defaultBranch) {
    try {
      const repoDetails = await fetchGitHubJson<GitHubRepoDetails>(`/repos/${owner}/${repo}`);
      defaultBranch = repoDetails.default_branch;
    } catch {
      // If fetching repo details fails (e.g. rate limits), fall back silently to branch search
    }
  }

  let files: string[] = [];
  let treeApiFailed = false;

  try {
    const tree = await fetchGitHubJson<GitHubTreeResponse>(`/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`);
    files = tree.tree.filter((entry) => entry.type === 'blob').map((entry) => entry.path);
  } catch (err) {
    treeApiFailed = true;
    const isRateLimit = err instanceof Error && err.message.toLowerCase().includes('rate limit');
    evidence.push({
      type: 'http',
      label: isRateLimit ? 'GitHub API rate limited' : 'Tree inspection fallback',
      detail: isRateLimit
        ? 'GitHub API rate limit reached (60/hr unauthenticated). ReviewBot fell back to direct raw file inspection for README and package files.'
        : `Could not fetch full repository tree (${err instanceof Error ? err.message : 'failed'}). Proceeding with direct file inspection.`,
      status: 'warn'
    });
  }

  // 1. Try official GitHub README endpoint (works for any default branch, develop, main, etc.)
  let readme = await fetchGitHubReadme(owner, repo);

  // 2. Fall back to finding exact README filename in tree files if API endpoint didn't return it
  const readmeFilePath = files.find((file) => /^readme(\.(md|markdown|txt|rst))?$/i.test(file)) ?? 'README.md';
  if (!readme) {
    readme =
      (await fetchRawGitHubFile(owner, repo, readmeFilePath, defaultBranch)) ??
      (readmeFilePath !== 'README.md' ? await fetchRawGitHubFile(owner, repo, 'README.md', defaultBranch) : undefined) ??
      (await fetchRawGitHubFile(owner, repo, 'readme.md', defaultBranch)) ??
      (await fetchRawGitHubFile(owner, repo, 'README', defaultBranch));
  }

  const packageFilePath = files.find((file) => /^package\.json$/i.test(file)) ?? 'package.json';
  const packageText = await fetchRawGitHubFile(owner, repo, packageFilePath, defaultBranch);
  const packageJson = packageText ? safeJsonParse(packageText) : undefined;

  if (treeApiFailed) {
    if (readme) files.push(readmeFilePath);
    if (packageText) files.push(packageFilePath);
  }

  const hasTests =
    files.some((file) => /(^|\/)(test|tests|__tests__)\//i.test(file)) ||
    files.some((file) => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file)) ||
    Boolean(packageJson?.scripts?.test && !packageJson.scripts.test.includes('no test specified')) ||
    Boolean(
      packageJson?.devDependencies &&
        Object.keys(packageJson.devDependencies).some((k) => /jest|vitest|mocha|playwright|cypress|supertest/i.test(k))
    );

  const signals = {
    hasTests,
    hasCI: files.some((file) => file.startsWith('.github/workflows/')),
    hasDocker: files.includes('Dockerfile') || files.includes('docker-compose.yml') || files.includes('docker-compose.yaml'),
    mentionsCelo: containsAny([readme, packageText], ['celo', 'alfajores', 'forno', '42220', '44787', 'sepolia']),
    mentionsAskBot: containsAny([readme, packageText], ['askbot', 'hypothesis']),
    likelyStack: inferLikelyStack(files, packageJson)
  };

  evidence.push({
    type: 'file',
    label: 'Repository inventory',
    detail: treeApiFailed
      ? `Inspected repository via raw file fallback from ${owner}/${repo}${defaultBranch ? ` (branch: ${defaultBranch})` : ''}.`
      : `Indexed ${files.length} files from ${owner}/${repo}${defaultBranch ? ` (default branch: ${defaultBranch})` : ''}.`,
    source: request.repoUrl,
    status: 'pass'
  });

  if (readme) {
    evidence.push({
      type: 'file',
      label: 'README discovered',
      detail: `README file (${readmeFilePath}) is present and available for claim verification.`,
      source: readmeFilePath,
      status: 'pass'
    });
  } else {
    evidence.push({
      type: 'file',
      label: 'README missing',
      detail: `No README was found on ${defaultBranch ? `default branch (${defaultBranch}) or ` : ''}common fallback branches (main, master, develop, dev, trunk, staging, release).`,
      status: 'warn'
    });
  }

  return {
    owner,
    repo,
    files,
    readme,
    packageJson,
    signals
  };
}

function containsAny(values: Array<string | undefined>, needles: string[]): boolean {
  const haystack = values.filter(Boolean).join('\n').toLowerCase();
  return needles.some((needle) => haystack.includes(needle.toLowerCase()));
}

function inferLikelyStack(files: string[], packageJson?: unknown): string[] {
  const stack = new Set<string>();
  if (files.some((file) => file.endsWith('.ts') || file.endsWith('.tsx'))) stack.add('TypeScript');
  if (files.some((file) => file.endsWith('.sol'))) stack.add('Solidity');
  if (files.some((file) => file.includes('next.config'))) stack.add('Next.js');
  if (files.some((file) => file.includes('hardhat.config'))) stack.add('Hardhat');
  if (files.some((file) => file.includes('foundry.toml'))) stack.add('Foundry');
  if (files.some((file) => file.includes('docker-compose'))) stack.add('Docker');

  const pkg = packageJson as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | undefined;
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  if ('express' in deps) stack.add('Express');
  if ('viem' in deps || 'ethers' in deps) stack.add('EVM client');
  if ('react' in deps) stack.add('React');

  return Array.from(stack);
}

function safeJsonParse(text: string): { name?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | undefined {
  try {
    return JSON.parse(text) as { name?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  } catch {
    return undefined;
  }
}
