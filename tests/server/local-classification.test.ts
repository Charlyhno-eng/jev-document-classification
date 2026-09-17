import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { processLocalDocument } from '../../server/local-classification.js';
import { NOT_PROCESSABLE_FOLDER } from '../../shared/document-policy.js';
import { NEED_REVIEW_FOLDER } from '../../shared/document-policy.js';
import { TEST_LOCAL_CLASSIFICATION_CONFIG as config } from '../helpers/fixtures.js';

test('moves unsupported files to Not processable without calling JEV', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-local-unsupported-'));
  await writeFile(path.join(root, 'photo.png'), 'image bytes');
  let calls = 0;
  const result = await processLocalDocument(root, 'photo.png', config, {
    classify: async () => { calls += 1; throw new Error('JEV must not be called'); },
  });

  assert.equal(calls, 0);
  assert.equal(result.unprocessable, true);
  assert.equal(result.category, NOT_PROCESSABLE_FOLDER);
  assert.equal(await readFile(path.join(root, NOT_PROCESSABLE_FOLDER, 'photo.png'), 'utf8'), 'image bytes');
  await assert.rejects(() => access(path.join(root, 'photo.png')));
});

test('moves supported documents with no readable text to Not processable', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-local-empty-'));
  await writeFile(path.join(root, 'scan.pdf'), 'empty scan');
  const result = await processLocalDocument(root, 'scan.pdf', config, { extract: async () => '   ' });
  assert.equal(result.unprocessable, true);
  assert.match(result.note ?? '', /No selectable text/);
  assert.equal(await readFile(path.join(root, NOT_PROCESSABLE_FOLDER, 'scan.pdf'), 'utf8'), 'empty scan');
});

test('moves documents with extraction failures to Not processable and records the reason', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-local-unreadable-'));
  await writeFile(path.join(root, 'broken.docx'), 'corrupt document');
  const result = await processLocalDocument(root, 'broken.docx', config, {
    extract: async () => { throw new Error('Invalid DOCX archive'); },
  });
  assert.equal(result.unprocessable, true);
  assert.match(result.note ?? '', /Invalid DOCX archive/);
  assert.equal(await readFile(path.join(root, NOT_PROCESSABLE_FOLDER, 'broken.docx'), 'utf8'), 'corrupt document');
});

test('moves a successfully classified document into its selected category', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-local-classified-'));
  await writeFile(path.join(root, 'paper.txt'), 'document');
  const result = await processLocalDocument(root, 'paper.txt', config, {
    extract: async () => 'A precise paper about secure wallet microsystems.',
    classify: async () => ({
      category: 'Research', destinationCategory: 'Research', needsReview: false, categoryConfidence: 0.9, language: 'English', subject: 'Secure wallet microsystems',
      usage: { inputTokens: 25 }, cost: 0.000001,
    }),
  });
  assert.equal(result.category, 'Research');
  assert.equal(await readFile(path.join(root, 'Research', 'paper.txt'), 'utf8'), 'document');
});

test('leaves the source file untouched when Gateway classification fails', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-local-gateway-'));
  await writeFile(path.join(root, 'paper.txt'), 'document');
  await assert.rejects(() => processLocalDocument(root, 'paper.txt', config, {
    extract: async () => 'Readable document',
    classify: async () => { throw new Error('Gateway unavailable'); },
  }), /Gateway unavailable/);
  assert.equal(await readFile(path.join(root, 'paper.txt'), 'utf8'), 'document');
});

test('moves a low-confidence classification into Need review', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-local-review-'));
  await writeFile(path.join(root, 'paper.txt'), 'document');
  const result = await processLocalDocument(root, 'paper.txt', config, {
    extract: async () => 'Readable document',
    classify: async () => ({
      category: 'Research', destinationCategory: NEED_REVIEW_FOLDER, needsReview: true, categoryConfidence: 0.6,
      language: 'English', subject: 'Readable document', usage: { inputTokens: 2 }, cost: 0,
    }),
  });
  assert.equal(result.destinationCategory, NEED_REVIEW_FOLDER);
  assert.equal(await readFile(path.join(root, NEED_REVIEW_FOLDER, 'paper.txt'), 'utf8'), 'document');
});
