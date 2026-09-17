import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLanguageBreakdown } from '../../src/lib/run-metrics.js';
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
