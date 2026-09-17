import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { listRootFileNames, moveFileToCategory, readDocumentText, safeRootFile } from '../../server/documents.js';
import { isSupportedDocument } from '../../shared/document-policy.js';
import { createPdf } from '../helpers/pdf.js';

test('lists only root files and reads supported plain text', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-documents-'));
  await writeFile(path.join(root, 'notes.md'), '# Secure wallets', 'utf8');
  await mkdir(path.join(root, 'Existing category'));
  await writeFile(path.join(root, 'Existing category', 'ignored.txt'), 'ignored', 'utf8');
  assert.deepEqual(await listRootFileNames(root), ['notes.md']);
  assert.equal(await readDocumentText(path.join(root, 'notes.md')), '# Secure wallets');
});

test('extracts text from PDF without requiring a missing font data warning', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-pdf-'));
  const pdfPath = path.join(root, 'paper.pdf');
  await writeFile(pdfPath, createPdf('Cryptocurrency microsystems'));
  assert.match(await readDocumentText(pdfPath), /Cryptocurrency microsystems/);
});

test('extracts text from DOCX through mammoth', async () => {
  const fixture = path.resolve('node_modules/mammoth/test/test-data/simple-list.docx');
  assert.ok((await readDocumentText(fixture)).trim().length > 0);
});

test('rejects unsupported files and unsafe root names', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-unsupported-'));
  const filePath = path.join(root, 'archive.zip');
  await writeFile(filePath, 'not a document');
  await assert.rejects(() => readDocumentText(filePath), /cannot be read/);
  assert.throws(() => safeRootFile(root, '../archive.zip'));
});

test('recognizes supported document extensions case-insensitively', () => {
  assert.equal(isSupportedDocument('paper.PDF'), true);
  assert.equal(isSupportedDocument('notes.md'), true);
  assert.equal(isSupportedDocument('photo.png'), false);
  assert.equal(isSupportedDocument('README'), false);
});

test('moves without overwriting an existing destination file', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-move-'));
  await writeFile(path.join(root, 'paper.txt'), 'new document');
  await mkdir(path.join(root, 'Research'));
  await writeFile(path.join(root, 'Research', 'paper.txt'), 'existing document');
  const destinationName = await moveFileToCategory(root, 'paper.txt', 'Research');
  assert.equal(destinationName, 'paper (1).txt');
  assert.equal(await readFile(path.join(root, 'Research', 'paper.txt'), 'utf8'), 'existing document');
  assert.equal(await readFile(path.join(root, 'Research', destinationName), 'utf8'), 'new document');
  await assert.rejects(() => access(path.join(root, 'paper.txt')));
});

test('rejects source and destination symlinks that could escape the selected folder', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-symlink-root-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'jev-symlink-outside-'));
  await writeFile(path.join(outside, 'secret.txt'), 'secret');
  await symlink(path.join(outside, 'secret.txt'), path.join(root, 'linked.txt'));
  await assert.rejects(() => readDocumentText(path.join(root, 'linked.txt')), /regular files/);
  await writeFile(path.join(root, 'paper.txt'), 'paper');
  await symlink(outside, path.join(root, 'Research'));
  await assert.rejects(() => moveFileToCategory(root, 'paper.txt', 'Research'), /escapes the selected root/);
  assert.equal(await readFile(path.join(root, 'paper.txt'), 'utf8'), 'paper');
});
