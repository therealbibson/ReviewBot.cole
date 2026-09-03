import { fetchText } from './http.js';

export interface GitHubRepoRef {
  owner: string;
  repo: string;
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

export async function fetchGitHubJson<T>(path: string): Promise<T> {
  const url = `https://api.github.com${path}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'reviewbot-celo/0.1'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

export async function fetchRawGitHubFile(owner: string, repo: string, path: string): Promise<string | undefined> {
  const branches = ['main', 'master'];

  for (const branch of branches) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    const result = await fetchText(rawUrl);
    if (result.status === 200) {
      return result.body;
    }
  }

  return undefined;
}
