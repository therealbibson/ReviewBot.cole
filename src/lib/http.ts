export async function fetchText(
  url: string,
  headers?: Record<string, string>
): Promise<{ status: number; body: string; contentType: string | null }> {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'reviewbot-celo/0.1',
      ...(headers ?? {})
    }
  });

  return {
    status: response.status,
    body: await response.text(),
    contentType: response.headers.get('content-type')
  };
}
