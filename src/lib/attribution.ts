const TAG_PREFIX = 'celo_';

export function assertAttributionTag(tag: string): string {
  if (!tag.startsWith(TAG_PREFIX)) {
    throw new Error(`CELO_ATTRIBUTION_TAG must start with ${TAG_PREFIX}.`);
  }

  return tag;
}

export function attachAttributionMetadata<T extends Record<string, unknown>>(
  payload: T,
  attributionTag: string
): T & { attributionTag: string } {
  return {
    ...payload,
    attributionTag: assertAttributionTag(attributionTag)
  };
}

export function buildAttributionHeaders(attributionTag: string): Record<string, string> {
  return {
    'x-celo-attribution-tag': assertAttributionTag(attributionTag)
  };
}

export function buildTransactionGuidance(attributionTag: string): string {
  const tag = assertAttributionTag(attributionTag);
  return [
    'Any ReviewBot.Celo transaction flow must include the assigned attribution tag.',
    `Required attribution tag: ${tag}`,
    "If you append ERC-8021/transaction data suffixes, include this tag in every eligible transaction."
  ].join(' ');
}
