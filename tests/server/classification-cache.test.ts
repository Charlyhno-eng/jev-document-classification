import assert from 'node:assert/strict';
import test from 'node:test';
import { ClassificationCache } from '../../server/classification-cache.js';
import type { ClassificationInput, ClassificationResult } from '../../server/classification.js';
import { TEST_GATEWAY_API_KEY } from '../helpers/fixtures.js';

const input: ClassificationInput = {
  apiKey: TEST_GATEWAY_API_KEY,
  fileName: 'paper.txt',
  text: 'Secure wallet recovery procedures.',
  categories: ['Research'],
};

const result: ClassificationResult = {
  category: 'Research', categoryConfidence: 0.92, destinationCategory: 'Research', needsReview: false,
  confidentiality: 'Confidential', promptInjectionScore: 0, promptInjectionRisk: false, subject: 'Secure wallet recovery', usage: { inputTokens: 42 }, cost: 0.00000168,
};

test('reuses successful decisions without charging tokens a second time', async () => {
  const cache = new ClassificationCache();
  let calls = 0;
  const classify = async () => { calls += 1; return result; };
  const first = await cache.resolve(input, classify);
  const second = await cache.resolve(input, classify);
  assert.equal(calls, 1);
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.deepEqual(second.usage, { inputTokens: 0 });
  assert.equal(second.cost, 0);
});

test('invalidates cached decisions when source text or categories change', async () => {
  const cache = new ClassificationCache();
  let calls = 0;
  const classify = async () => { calls += 1; return result; };
  await cache.resolve(input, classify);
  await cache.resolve({ ...input, text: `${input.text} Updated.` }, classify);
  await cache.resolve({ ...input, categories: ['Research', 'Legal'] }, classify);
  assert.equal(calls, 3);
});
