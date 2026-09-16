import { parseGitHubRepoUrl, fetchGitHubJson, fetchRawGitHubFile, type GitHubRepoDetails } from '../../lib/github.js';
import type { EvidenceItem, RepoSnapshot, ReviewRequest } from '../types.js';

interface GitHubTreeResponse {
  tree: Array<{ path: string; type: string }>;
}

export async function collectRepoSnapshot(request: ReviewRequest, evidence: EvidenceItem[]): Promise<RepoSnapshot> {
  const { owner, repo } = parseGitHubRepoUrl(request.repoUrl);

  let defaultBranch: string | undefined;
  try {
    const repoDetails = await fetchGitHubJson<GitHubRepoDetails>(`/repos/${owner}/${repo}`);
    defaultBranch = repoDetails.default_branch;
  } catch {
    // If fetching repo details fails (e.g. scope limits), fall back silently to branch search
  }

  const tree = await fetchGitHubJson<GitHubTreeResponse>(`/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`);
  const files = tree.tree.filter((entry) => entry.type === 'blob').map((entry) => entry.path);

  // Find exact README filename in tree files if present
  const readmeFilePath = files.find((file) => /^readme(\.(md|markdown|txt|rst))?$/i.test(file)) ?? 'README.md';

  const readme =
    (await fetchRawGitHubFile(owner, repo, readmeFilePath, defaultBranch)) ??
    (readmeFilePath !== 'README.md' ? await fetchRawGitHubFile(owner, repo, 'README.md', defaultBranch) : undefined) ??
    (await fetchRawGitHubFile(owner, repo, 'readme.md', defaultBranch));

  const packageFilePath = files.find((file) => /^package\.json$/i.test(file)) ?? 'package.json';
  const packageText = await fetchRawGitHubFile(owner, repo, packageFilePath, defaultBranch);
  const packageJson = packageText ? safeJsonParse(packageText) : undefined;

  const signals = {
    hasTests: files.some((file) => /(^|\/)(test|tests|__tests__)\//i.test(file)) || files.some((file) => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file)),
    hasCI: files.some((file) => file.startsWith('.github/workflows/')),
    hasDocker: files.includes('Dockerfile') || files.includes('docker-compose.yml') || files.includes('docker-compose.yaml'),
    mentionsCelo: containsAny([readme, packageText], ['celo', 'alfajores', 'forno', '42220', '44787', 'sepolia']),
    mentionsAskBot: containsAny([readme, packageText], ['askbot', 'hypothesis']),
    likelyStack: inferLikelyStack(files, packageJson)
  };

  evidence.push({
    type: 'file',
    label: 'Repository inventory',
    detail: `Indexed ${files.length} files from ${owner}/${repo}${defaultBranch ? ` (default branch: ${defaultBranch})` : ''}.`,
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
      detail: `No README was found on ${defaultBranch ? `default branch (${defaultBranch}) or ` : ''}common fallback branches (main, master, develop, dev, trunk).`,
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
