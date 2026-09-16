import { fetchOnChainWalletSnapshot, verifyWalletSignature } from '../../lib/celoRpc.js';
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
  const network = request.celoNetwork ?? 'celo-mainnet';

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

  let walletOwnershipVerified = false;
  if (request.walletSignature && request.walletSignatureMessage && validWalletFormat && request.walletAddress) {
    const result = await verifyWalletSignature(
      request.walletAddress,
      request.walletSignatureMessage,
      request.walletSignature,
      network
    );
    walletOwnershipVerified = result.verified;
    evidence.push({
      type: 'http',
      label: 'Wallet ownership verification',
      detail: result.verified
        ? `Wallet ownership verified: personal_sign signature matches ${request.walletAddress}.`
        : `Wallet ownership verification failed: ${result.error ?? 'signature mismatch'}`,
      source: result.recoveredAddress,
      status: result.verified ? 'pass' : 'fail'
    });
  } else if (request.walletAddress) {
    evidence.push({
      type: 'heuristic',
      label: 'Wallet ownership not verified',
      detail: 'No wallet signature was provided - ownership could not be verified.',
      status: 'warn'
    });
  }

  let onChain: CeloSnapshot['onChain'] = { checked: false, network };

  if (validWalletFormat && request.walletAddress && network !== 'not-applicable') {
    const snapshot = await fetchOnChainWalletSnapshot(request.walletAddress, network);
    onChain = {
      checked: snapshot.checked,
      network: snapshot.network,
      rpcUrl: snapshot.rpcUrl,
      balanceCelo: snapshot.balanceCelo,
      transactionCount: snapshot.transactionCount,
      isContract: snapshot.isContract,
      error: snapshot.error
    };

    if (snapshot.checked) {
      evidence.push({
        type: 'http',
        label: 'On-chain wallet balance',
        detail: `Balance on ${network}: ${snapshot.balanceCelo?.toFixed(4)} CELO.`,
        source: snapshot.rpcUrl,
        status: 'pass'
      });

      evidence.push({
        type: 'http',
        label: 'On-chain transaction history',
        detail: `Wallet has sent ${snapshot.transactionCount} transaction(s) on ${network}.`,
        source: snapshot.rpcUrl,
        status: (snapshot.transactionCount ?? 0) > 0 ? 'pass' : 'warn'
      });

      evidence.push({
        type: 'http',
        label: 'Wallet type check',
        detail: snapshot.isContract
          ? 'The provided address is a smart contract, not a plain wallet.'
          : 'The provided address is a standard externally owned account (EOA).',
        source: snapshot.rpcUrl,
        status: 'info'
      });
    } else {
      evidence.push({
        type: 'http',
        label: 'On-chain lookup failed',
        detail: snapshot.error ?? 'Could not query the Celo RPC endpoint for this wallet.',
        source: snapshot.rpcUrl,
        status: 'fail'
      });
    }
  } else if (network === 'not-applicable') {
    evidence.push({
      type: 'info',
      label: 'On-chain check skipped',
      detail: 'Celo network was marked as not applicable, so no on-chain audit was performed.',
      status: 'info'
    });
  }

  return {
    providedWallet: Boolean(request.walletAddress),
    validWalletFormat,
    repoMentions,
    inferredNetworks,
    notes: buildNotes(request, validWalletFormat, inferredNetworks),
    walletOwnershipVerified,
    onChain
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
  if (!request.walletAddress) notes.push('No wallet address was provided, so this audit could not verify real on-chain activity or economic viability.');
  if (request.walletAddress && !validWalletFormat) notes.push('The supplied wallet address format is invalid.');
  if (inferredNetworks.length === 0) notes.push('No explicit Celo network configuration was found from lightweight repo inspection.');
  return notes;
}
