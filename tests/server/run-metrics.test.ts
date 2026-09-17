import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLanguageBreakdown, buildRunPerformance } from '../../src/lib/run-metrics.js';
import type { Classification } from '../../src/types.js';

test('counts languages only for documents classified by JEV', () => {
  const base = { confidence: null, inputTokens: 0, cost: 0 };
  const results: Classification[] = [
    { ...base, id: '1', fileName: 'english.pdf', category: 'Research', language: 'English', subject: 'Topic', moved: true },
    { ...base, id: '2', fileName: 'french.pdf', category: 'Research', language: 'French', subject: 'Sujet', moved: true },
    { ...base, id: '3', fileName: 'image.png', category: 'Not processable', language: '—', subject: '—', moved: true, unprocessable: true },
    { ...base, id: '4', fileName: 'failed.pdf', category: 'Not moved', language: '—', subject: '—', moved: false },
  ];

  assert.deepEqual(buildLanguageBreakdown(results), { English: 1, French: 1 });
});

test('calculates cache savings, throughput, and average confidence', () => {
  const results: Classification[] = [
    { id: '1', fileName: 'one.txt', category: 'Research', language: 'English', subject: 'One', confidence: 0.8, inputTokens: 20, cost: 0.000001, moved: true },
    { id: '2', fileName: 'two.txt', category: 'Research', language: 'English', subject: 'Two', confidence: 0.6, inputTokens: 0, cost: 0, savedInputTokens: 50, savedCost: 0.000002, cacheHit: true, moved: true },
    { id: '3', fileName: 'image.png', category: 'Not processable', language: '—', subject: '—', confidence: null, inputTokens: 0, cost: 0, moved: true, unprocessable: true },
  ];
  assert.deepEqual(buildRunPerformance(results, 30_000), {
    savedInputTokens: 50, savedCost: 0.000002, cacheHits: 1, documentsPerMinute: 6, averageConfidence: 0.7, confidenceCount: 2,
  });
});
