import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { classifyDocument, PRICE_PER_MILLION_INPUT_TOKENS, type EvaluationRunner } from '../../server/classification.js';
import { NEED_REVIEW_FOLDER, SUSPECTED_PROMPT_INJECTION_FOLDER } from '../../shared/document-policy.js';
import { TEST_GATEWAY_API_KEY } from '../helpers/fixtures.js';

const input = {
  apiKey: TEST_GATEWAY_API_KEY,
  fileName: 'thesis.pdf',
  text: 'Cryptocurrency Microsystems for Decentralized Finance\nA thesis about secure hardware wallets and blockchain microarchitectures.',
  categories: ['Doctoral thesis', 'Whitepaper'],
};

test('classifies with injected evaluation logic and calculates exact input cost', async () => {
  const runner: EvaluationRunner = async (request) => ({
    category: 'Doctoral thesis', categoryConfidence: 0.91, confidentiality: 'Internal', promptInjectionScore: '0',
    subject: request.subjectCandidates[0], inputTokens: 2_500,
  });
  const result = await classifyDocument(input, runner);
  assert.equal(result.subject, 'Cryptocurrency Microsystems for Decentralized Finance');
  assert.equal(result.cost, (2_500 / 1_000_000) * PRICE_PER_MILLION_INPUT_TOKENS);
  assert.deepEqual(result.usage, { inputTokens: 2_500 });
});

test('rejects model output outside configured categories', async () => {
  const runner: EvaluationRunner = async (request) => ({ category: '../escape', categoryConfidence: 1, confidentiality: 'Internal', promptInjectionScore: '0', subject: request.subjectCandidates[0], inputTokens: 1 });
  await assert.rejects(() => classifyDocument(input, runner), /outside the configured choices/);
});

test('uses a bounded subject-choice set and compact structured context', async () => {
  let choiceCount = 0;
  let context = '';
  const result = await classifyDocument({ ...input, text: `${input.text}\n${'Secure wallet recovery policy.\n'.repeat(2_000)}` }, async (request) => {
    choiceCount = request.subjectCandidates.length;
    context = request.documentContext;
    return { category: 'Doctoral thesis', categoryConfidence: 0.9, confidentiality: 'Internal', promptInjectionScore: '0', subject: request.subjectCandidates[0], inputTokens: 10 };
  });
  assert.ok(choiceCount <= 10);
  assert.ok(context.length <= 4_500);
  assert.equal(result.category, 'Doctoral thesis');
});

test('routes low-confidence classifications to Need review while retaining the suggested category', async () => {
  const runner: EvaluationRunner = async (request) => ({
    category: 'Whitepaper', categoryConfidence: 0.74, confidentiality: 'Internal', promptInjectionScore: '0', subject: request.subjectCandidates[0], inputTokens: 1,
  });
  const result = await classifyDocument(input, runner);
  assert.equal(result.category, 'Whitepaper');
  assert.equal(result.destinationCategory, NEED_REVIEW_FOLDER);
  assert.equal(result.needsReview, true);
});

test('isolates documents with a prompt injection score above 50', async () => {
  const runner: EvaluationRunner = async (request) => ({
    category: 'Whitepaper', categoryConfidence: 0.99, confidentiality: 'Internal', promptInjectionScore: '60', subject: request.subjectCandidates[0], inputTokens: 1,
  });
  const result = await classifyDocument(input, runner);
  assert.equal(result.promptInjectionScore, 60);
  assert.equal(result.promptInjectionRisk, true);
  assert.equal(result.destinationCategory, SUSPECTED_PROMPT_INJECTION_FOLDER);
});

test('rejects invented subjects and invalid usage from the provider', async () => {
  const inventedSubject: EvaluationRunner = async () => ({ category: 'Whitepaper', categoryConfidence: 1, confidentiality: 'Internal', promptInjectionScore: '0', subject: 'Invented output', inputTokens: 1 });
  await assert.rejects(() => classifyDocument(input, inventedSubject), /outside the extracted candidates/);
  const invalidUsage: EvaluationRunner = async (request) => ({ category: 'Whitepaper', categoryConfidence: 1, confidentiality: 'Internal', promptInjectionScore: '0', subject: request.subjectCandidates[0], inputTokens: -1 });
  await assert.rejects(() => classifyDocument(input, invalidUsage), /invalid token usage/);
});

test('does not request the paid Zero Data Retention Gateway option', async () => {
  const source = await readFile(new URL('../../server/classification.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /zeroDataRetention|zero_data_retention/i);
});
