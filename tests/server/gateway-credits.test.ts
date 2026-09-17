import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchGatewayCredits } from '../../server/gateway-credits.js';

test('reads a numeric Vercel AI Gateway credit balance without exposing the key', async () => {
  const secret = 'gateway-key-' + 'x'.repeat(24);
  const balance = await fetchGatewayCredits(secret, async (_input, init) => {
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${secret}`);
    return Response.json({ balance: '4.875' });
  });
  assert.equal(balance, 4.875);
});

test('rejects unavailable or malformed credit responses', async () => {
  await assert.rejects(() => fetchGatewayCredits('secret', async () => new Response(null, { status: 503 })), /temporarily unavailable/);
  await assert.rejects(() => fetchGatewayCredits('secret', async () => Response.json({ balance: 'unknown' })), /invalid credit balance/);
});
