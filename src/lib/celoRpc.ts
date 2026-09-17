import { verifyMessage, recoverMessageAddress, getAddress, createPublicClient, http } from 'viem';

export type CeloNetworkId = 'celo-mainnet' | 'celo-sepolia' | 'not-applicable';

const RPC_URLS: Record<Exclude<CeloNetworkId, 'not-applicable'>, string> = {
  'celo-mainnet': 'https://forno.celo.org',
  'celo-sepolia': 'https://forno.celo-sepolia.celo-testnet.org'
};

export interface OnChainWalletSnapshot {
  checked: boolean;
  network: CeloNetworkId;
  rpcUrl?: string;
  balanceWei?: string;
  balanceCelo?: number;
  transactionCount?: number;
  isContract?: boolean;
  error?: string;
}

export function rpcUrlForNetwork(network: CeloNetworkId): string | undefined {
  if (network === 'not-applicable') {
    return undefined;
  }

  return RPC_URLS[network];
}

export async function fetchOnChainWalletSnapshot(
  address: string,
  network: CeloNetworkId
): Promise<OnChainWalletSnapshot> {
  const rpcUrl = rpcUrlForNetwork(network);

  if (!rpcUrl) {
    return { checked: false, network };
  }

  try {
    const [balanceHex, txCountHex, codeHex] = await Promise.all([
      callRpc(rpcUrl, 'eth_getBalance', [address, 'latest']),
      callRpc(rpcUrl, 'eth_getTransactionCount', [address, 'latest']),
      callRpc(rpcUrl, 'eth_getCode', [address, 'latest'])
    ]);

    const balanceWei = BigInt(balanceHex).toString();
    const balanceCelo = Number(BigInt(balanceHex)) / 1e18;
    const transactionCount = Number(BigInt(txCountHex));
    const isContract = typeof codeHex === 'string' && codeHex !== '0x' && codeHex.length > 2;

    return {
      checked: true,
      network,
      rpcUrl,
      balanceWei,
      balanceCelo,
      transactionCount,
      isContract
    };
  } catch (error) {
    return {
      checked: false,
      network,
      rpcUrl,
      error: error instanceof Error ? error.message : 'Unknown RPC failure'
    };
  }
}


function validateChallengeMessage(address: string, message: string): { valid: boolean; error?: string } {
  const normalizedMsg = message.toLowerCase();
  const normalizedAddr = address.toLowerCase();

  if (!normalizedMsg.includes(normalizedAddr)) {
    return {
      valid: false,
      error: `Challenge message does not bind target wallet address (${address}).`
    };
  }

  const hasReviewBotProof =
    normalizedMsg.includes('reviewbot') ||
    normalizedMsg.includes('celo wallet ownership') ||
    normalizedMsg.includes('ownership proof');

  if (!hasReviewBotProof) {
    return {
      valid: false,
      error: 'Challenge message is missing ReviewBot ownership proof header.'
    };
  }

  const matchTimestamp = message.match(/timestamp:\s*([^\n\r]+)/i);
  if (matchTimestamp && matchTimestamp[1]) {
    const timestampMs = Date.parse(matchTimestamp[1].trim());
    if (!Number.isNaN(timestampMs)) {
      const now = Date.now();
      const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      const maxFutureMs = 10 * 60 * 1000; // 10 minutes clock skew
      if (now - timestampMs > maxAgeMs) {
        return {
          valid: false,
          error: 'Ownership challenge timestamp has expired (older than 7 days).'
        };
      }
      if (timestampMs - now > maxFutureMs) {
        return {
          valid: false,
          error: 'Ownership challenge timestamp is invalid (in the future).'
        };
      }
    }
  }

  return { valid: true };
}

export async function verifyWalletSignature(
  address: string,
  message: string,
  signature: string,
  network: CeloNetworkId
): Promise<{ verified: boolean; recoveredAddress?: string; error?: string }> {
  try {
    const expectedChecksum = getAddress(address);

    const challengeCheck = validateChallengeMessage(expectedChecksum, message);
    if (!challengeCheck.valid) {
      return {
        verified: false,
        error: challengeCheck.error
      };
    }

    if (!signature.startsWith('0x') || signature.length < 130) {
      return {
        verified: false,
        error: 'Signature format is invalid (expected 0x-prefixed hex string).'
      };
    }

    const rpcUrl = rpcUrlForNetwork(network);

    // 1. If RPC is available, use client.verifyMessage which validates both EOAs and ERC-1271 Smart Contract Wallets
    if (rpcUrl) {
      try {
        const client = createPublicClient({
          transport: http(rpcUrl)
        });
        const isValid = await client.verifyMessage({
          address: expectedChecksum,
          message,
          signature: signature as `0x${string}`
        });

        if (isValid) {
          return { verified: true, recoveredAddress: expectedChecksum };
        }
      } catch {
        // Fall back to offline EOA recovery if RPC check throws
      }
    }

    // 2. Offline fallback: recover ECDSA signer address for EOA wallets
    const recovered = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`
    });

    const recoveredChecksum = getAddress(recovered);
    const verified = expectedChecksum.toLowerCase() === recoveredChecksum.toLowerCase();

    if (!verified) {
      return {
        verified: false,
        recoveredAddress: recoveredChecksum,
        error: `Signature was produced by ${recoveredChecksum}, which does not match target address ${expectedChecksum}.`
      };
    }

    return { verified: true, recoveredAddress: recoveredChecksum };
  } catch (error) {
    return {
      verified: false,
      error: error instanceof Error ? error.message : 'Signature verification failed'
    };
  }
}

async function callRpc(rpcUrl: string, method: string, params: unknown[]): Promise<string> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`RPC ${method} failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { result?: string; error?: { message?: string } };

  if (payload.error) {
    throw new Error(payload.error.message ?? `RPC ${method} returned an error`);
  }

  if (typeof payload.result !== 'string') {
    throw new Error(`RPC ${method} returned an unexpected response`);
  }

  return payload.result;
}
