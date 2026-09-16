import { fetchText } from './http.js';

export interface GitHubRepoRef {
  owner: string;
  repo: string;
}

export interface GitHubRepoDetails {
  default_branch: string;
  description?: string;
  stargazers_count?: number;
}

export function parseGitHubRepoUrl(repoUrl: string): GitHubRepoRef {
  const url = new URL(repoUrl);
  if (url.hostname !== 'github.com') {
    throw new Error('Only public github.com repository URLs are supported in this MVP.');
  }

  const [owner, repo] = url.pathname.split('/').filter(Boolean);
  if (!owner || !repo) {
    throw new Error('Repository URL must look like https://github.com/owner/repo.');
  }

  return { owner, repo: repo.replace(/\.git$/, '') };
}

function getGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'reviewbot-celo/0.1'
  };

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function fetchGitHubJson<T>(path: string): Promise<T> {
  const url = `https://api.github.com${path}`;
  const response = await fetch(url, {
    headers: getGitHubHeaders()
  });

  if (!response.ok) {
    const isRateLimit = response.status === 403 || response.status === 429;
    const remaining = response.headers.get('x-ratelimit-remaining');

    if (isRateLimit && (remaining === '0' || response.status === 429)) {
      throw new Error(
        'GitHub API rate limit exceeded (60 requests/hour unauthenticated). Add a GITHUB_TOKEN to your .env file for higher limits (5,000 requests/hour).'
      );
    }

    throw new Error(
      `GitHub API returned ${response.status} ${response.statusText}${
        response.status === 404 ? '. Make sure the repository URL is correct and the repo is public.' : '.'
      }`
    );
  }

  return (await response.json()) as T;
}

export async function fetchRawGitHubFile(
  owner: string,
  repo: string,
  path: string,
  preferredBranch?: string
): Promise<string | undefined> {
  const candidateBranches = new Set<string>();
  if (preferredBranch) {
    candidateBranches.add(preferredBranch);
  }
  candidateBranches.add('main');
  candidateBranches.add('master');
  candidateBranches.add('develop');
  candidateBranches.add('dev');
  candidateBranches.add('trunk');

  const headers = getGitHubHeaders();

  for (const branch of candidateBranches) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    const result = await fetchText(rawUrl, headers);
    if (result.status === 200) {
      return result.body;
    }
  }

  return undefined;
}
