import { fetchText } from './http.js';

export interface GitHubRepoRef {
  owner: string;
  repo: string;
  branch?: string;
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

  const parts = url.pathname.split('/').filter(Boolean);
  const owner = parts[0];
  const repo = parts[1]?.replace(/\.git$/, '');

  if (!owner || !repo) {
    throw new Error('Repository URL must look like https://github.com/owner/repo.');
  }

  let branch: string | undefined;
  if (parts[2] === 'tree' && parts[3]) {
    branch = parts.slice(3).join('/');
  }

  return { owner, repo, branch };
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
    const resetTime = response.headers.get('x-ratelimit-reset');

    if (isRateLimit && (remaining === '0' || response.status === 429)) {
      let resetMsg = '';
      if (resetTime) {
        const resetDate = new Date(Number(resetTime) * 1000);
        const minutesRemaining = Math.max(1, Math.ceil((resetDate.getTime() - Date.now()) / 60000));
        resetMsg = ` (resets in ~${minutesRemaining} min at ${resetDate.toLocaleTimeString()})`;
      }

      const hasToken = Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
      const helpMsg = hasToken
        ? `GitHub API rate limit reached${resetMsg}. Please wait or try again later.`
        : `GitHub API rate limit exceeded (60 requests/hour unauthenticated)${resetMsg}. Add a GITHUB_TOKEN to your .env file for higher limits (5,000 requests/hour).`;

      throw new Error(helpMsg);
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
  candidateBranches.add('staging');
  candidateBranches.add('release');
  candidateBranches.add('production');

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

export async function fetchGitHubReadme(owner: string, repo: string): Promise<string | undefined> {
  try {
    interface GitHubReadmeData {
      content?: string;
      encoding?: string;
      download_url?: string;
    }
    const data = await fetchGitHubJson<GitHubReadmeData>(`/repos/${owner}/${repo}/readme`);
    if (data.content && data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf8');
    }
    if (data.download_url) {
      const result = await fetchText(data.download_url, getGitHubHeaders());
      if (result.status === 200) {
        return result.body;
      }
    }
  } catch {
    // Fall back to branch candidate checks if readme endpoint fails
  }
  return undefined;
}
