import assert from 'node:assert/strict';
import test from 'node:test';
import { mapWithConcurrency } from '../../src/lib/concurrency.js';

test('limits concurrent work while preserving input order', async () => {
  let active = 0;
  let peak = 0;
  const results = await mapWithConcurrency(Array.from({ length: 40 }, (_, index) => index), 16, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
    return value * 2;
  });
  assert.ok(peak <= 16);
  assert.deepEqual(results, Array.from({ length: 40 }, (_, index) => index * 2));
});
