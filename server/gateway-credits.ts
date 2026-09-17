const GATEWAY_CREDITS_URL = 'https://ai-gateway.vercel.sh/v1/credits';

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function fetchGatewayCredits(apiKey: string, fetcher: Fetcher = fetch) {
  const response = await fetcher(GATEWAY_CREDITS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Vercel credits are temporarily unavailable (${response.status}).`);

  const payload = await response.json() as { balance?: unknown };
  const balance = typeof payload.balance === 'number' || typeof payload.balance === 'string'
    ? Number(payload.balance)
    : Number.NaN;
  if (!Number.isFinite(balance) || balance < 0) throw new Error('Vercel returned an invalid credit balance.');
  return balance;
}
