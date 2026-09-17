import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyExtractedDocument, classifyServerDocument, loadConfig, loadGatewayCredits, revealApiKey, selectServerFolder, updateApiKey, updateCategories } from '../../src/lib/api.js';
import { TEST_GATEWAY_API_KEY } from '../helpers/fixtures.js';

test('client API sends the local mutation marker and never expects the saved key back', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get('X-JEV-Client'), 'browser');
    assert.equal(JSON.parse(String(init?.body)).apiKey, TEST_GATEWAY_API_KEY);
    return Response.json({ configured: true });
  };
  assert.deepEqual(await updateApiKey(TEST_GATEWAY_API_KEY), { configured: true });
});

test('reveals a saved key only through an explicit local POST request', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input, init) => {
    assert.equal(input, '/api/config/api-key/reveal');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('X-JEV-Client'), 'browser');
    return Response.json({ apiKey: TEST_GATEWAY_API_KEY });
  };
  assert.deepEqual(await revealApiKey(), { apiKey: TEST_GATEWAY_API_KEY });
});

test('client API handles category updates, classification routes, and cancelled folder selection', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const requests: Array<{ url: string; body?: string }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), body: init?.body?.toString() });
    if (String(input) === '/api/folders/select') return new Response(null, { status: 204 });
    if (String(input) === '/api/config/categories') return Response.json({ categories: ['Research'] });
    return Response.json({ category: 'Research', categoryConfidence: 1, language: 'English', subject: 'Secure wallets', usage: { inputTokens: 10 }, cost: 0 });
  };
  assert.deepEqual(await updateCategories(['Research']), { categories: ['Research'] });
  assert.equal(await selectServerFolder(), null);
  assert.equal((await classifyExtractedDocument('paper.pdf', 'text')).category, 'Research');
  assert.equal((await classifyServerDocument('folder id', 'paper.pdf')).subject, 'Secure wallets');
  assert.equal(requests.at(-1)?.url, '/api/folders/folder%20id/classify');
  assert.deepEqual(JSON.parse(requests.at(-1)?.body ?? ''), { fileName: 'paper.pdf' });
});

test('client config consumes only key status and reports server errors', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({ categories: ['Finance'], apiKeyConfigured: false });
  assert.deepEqual(await loadConfig(), { categories: ['Finance'], apiKeyConfigured: false });
  globalThis.fetch = async () => Response.json({ balance: 4.25 });
  assert.deepEqual(await loadGatewayCredits(), { balance: 4.25 });
  globalThis.fetch = async () => Response.json({ error: 'Rejected safely' }, { status: 400 });
  await assert.rejects(() => loadConfig(), /Rejected safely/);
});
