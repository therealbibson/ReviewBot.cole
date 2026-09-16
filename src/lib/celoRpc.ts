import { verifyMessage } from 'viem';

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


export async function verifyWalletSignature(
  address: string,
  message: string,
  signature: string,
  _network: CeloNetworkId
): Promise<{ verified: boolean; recoveredAddress?: string; error?: string }> {
  try {
    const verified = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`
    });
    return { verified, recoveredAddress: address };
  } catch (error) {
    return { verified: false, error: error instanceof Error ? error.message : 'Signature verification failed' };
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
