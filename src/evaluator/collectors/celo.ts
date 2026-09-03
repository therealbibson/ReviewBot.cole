import type { CeloSnapshot, EvidenceItem, RepoSnapshot, ReviewRequest } from '../types.js';

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export async function collectCeloSnapshot(
  request: ReviewRequest,
  repo: RepoSnapshot,
  evidence: EvidenceItem[]
): Promise<CeloSnapshot> {
  const repoMentions = repo.files.filter((file) => /celo|wallet|contract|viem|ethers/i.test(file)).slice(0, 20);
  const inferredNetworks = inferNetworks([repo.readme, JSON.stringify(repo.packageJson)]);
  const validWalletFormat = request.walletAddress ? ADDRESS_PATTERN.test(request.walletAddress) : false;

  if (request.walletAddress) {
    evidence.push({
      type: 'heuristic',
      label: 'Wallet format check',
      detail: validWalletFormat ? 'Provided wallet address matches EVM address format.' : 'Provided wallet address does not match EVM address format.',
      source: request.walletAddress,
      status: validWalletFormat ? 'pass' : 'warn'
    });
  }

  if (repo.signals.mentionsCelo) {
    evidence.push({
      type: 'heuristic',
      label: 'Celo references detected',
      detail: `Detected Celo-related signals in repo materials. Networks: ${inferredNetworks.join(', ') || 'unspecified'}`,
      status: 'pass'
    });
  } else {
    evidence.push({
      type: 'heuristic',
      label: 'Weak Celo evidence',
      detail: 'The repository does not clearly mention Celo in README or package metadata.',
      status: 'warn'
    });
  }

  return {
    providedWallet: Boolean(request.walletAddress),
    validWalletFormat,
    repoMentions,
    inferredNetworks,
    notes: buildNotes(request, validWalletFormat, inferredNetworks)
  };
}

function inferNetworks(values: Array<string | undefined>): string[] {
  const haystack = values.filter(Boolean).join('\n').toLowerCase();
  const networks = new Set<string>();
  if (haystack.includes('celo-mainnet') || haystack.includes('42220') || haystack.includes('forno.celo.org')) networks.add('celo-mainnet');
  if (haystack.includes('celo-sepolia') || haystack.includes('44787') || haystack.includes('forno.celo-sepolia')) networks.add('celo-sepolia');
  if (haystack.includes('alfajores')) networks.add('alfajores');
  return Array.from(networks);
}

function buildNotes(request: ReviewRequest, validWalletFormat: boolean, inferredNetworks: string[]): string[] {
  const notes: string[] = [];
  if (!request.walletAddress) notes.push('No wallet address was provided, so onchain attribution and activity checks are limited.');
  if (request.walletAddress && !validWalletFormat) notes.push('The supplied wallet address format is invalid.');
  if (inferredNetworks.length === 0) notes.push('No explicit Celo network configuration was found from lightweight repo inspection.');
  return notes;
}
