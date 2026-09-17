import assert from 'node:assert/strict';
import test from 'node:test';
import { extractSubjectCandidates } from '../../server/subject.js';

test('extracts a precise thesis topic instead of a broad fixed domain', () => {
  const text = `Cryptocurrency Microsystems for Decentralized Finance

This doctoral thesis studies cryptocurrency microsystems for secure decentralized finance.
Cryptocurrency microsystems combine embedded security, consensus protocols, and low-power hardware wallets.
The research evaluates resilient microarchitectures for blockchain transactions.`;
  const candidates = extractSubjectCandidates('doctoral-thesis.pdf', text);
  assert.equal(candidates[0], 'Cryptocurrency Microsystems for Decentralized Finance');
  assert.ok(candidates.some((candidate) => candidate.includes('cryptocurrency microsystems')));
  assert.ok(candidates.some((candidate) => candidate.includes('low-power hardware wallets')));
  assert.ok(candidates.length <= 16);
});

test('uses a descriptive filename when document text has no viable phrase', () => {
  assert.deepEqual(extractSubjectCandidates('quantum-resistant-wallets.pdf', 'a the and of'), ['quantum resistant wallets']);
});

test('never returns unbounded or empty candidate lists', () => {
  assert.deepEqual(extractSubjectCandidates('x.pdf', ''), ['Document content']);
  const candidates = extractSubjectCandidates('paper.txt', 'secure protocol '.repeat(2_000), 5);
  assert.ok(candidates.length >= 1 && candidates.length <= 5);
  assert.ok(candidates.every((candidate) => candidate.length <= 100));
});
