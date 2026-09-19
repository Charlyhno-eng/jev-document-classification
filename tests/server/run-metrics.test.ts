import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRunPerformance } from '../../src/lib/run-metrics.js';
import type { Classification } from '../../src/types.js';

test('calculates cache savings, throughput, and average confidence', () => {
  const results: Classification[] = [
    { id: '1', fileName: 'one.txt', category: 'Research', confidentiality: 'Internal', promptInjectionScore: 0, promptInjectionRisk: false, subject: 'One', confidence: 0.8, inputTokens: 20, cost: 0.000001, moved: true },
    { id: '2', fileName: 'two.txt', category: 'Research', confidentiality: 'Internal', promptInjectionScore: 0, promptInjectionRisk: false, subject: 'Two', confidence: 0.6, inputTokens: 0, cost: 0, savedInputTokens: 50, savedCost: 0.000002, cacheHit: true, moved: true },
    { id: '3', fileName: 'image.png', category: 'Not processable', confidentiality: '—', promptInjectionScore: 0, promptInjectionRisk: false, subject: '—', confidence: null, inputTokens: 0, cost: 0, moved: true, unprocessable: true },
  ];
  assert.deepEqual(buildRunPerformance(results, 30_000), {
    savedInputTokens: 50, savedCost: 0.000002, cacheHits: 1, documentsPerMinute: 6, averageConfidence: 0.7, confidenceCount: 2,
  });
});
