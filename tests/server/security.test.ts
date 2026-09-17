import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { isTrustedApiRequest, resolveCategoryDirectory, resolveRootFile, validateApiKey, validateCategoryName } from '../../server/security.js';

test('accepts safe category names and rejects traversal or cross-platform reserved names', () => {
  assert.equal(validateCategoryName('Doctoral thesis'), 'Doctoral thesis');
  for (const value of ['', '../escape', 'a/b', 'a\\b', 'CON', 'report.', '.hidden', 'bad:name', 'x'.repeat(81)]) {
    assert.throws(() => validateCategoryName(value));
  }
});

test('validates API keys without exposing assumptions about a provider prefix', () => {
  assert.equal(validateApiKey('a'.repeat(32)), 'a'.repeat(32));
  assert.throws(() => validateApiKey('short'));
  assert.throws(() => validateApiKey(`valid-looking-${'x'.repeat(20)} key`));
  assert.throws(() => validateApiKey('x'.repeat(513)));
});

test('resolves only direct children of the selected root', () => {
  const root = path.resolve('/tmp/jev-root');
  assert.equal(resolveRootFile(root, 'paper.pdf'), path.join(root, 'paper.pdf'));
  assert.equal(resolveCategoryDirectory(root, 'Research'), path.join(root, 'Research'));
  for (const value of ['../secret', '/etc/passwd', 'nested/file.pdf', '.', '..']) {
    assert.throws(() => resolveRootFile(root, value));
  }
});

test('requires a trusted origin and client marker for API mutations', () => {
  assert.equal(isTrustedApiRequest('GET', 'http://localhost:5173'), true);
  assert.equal(isTrustedApiRequest('OPTIONS', 'http://localhost:5173'), true);
  assert.equal(isTrustedApiRequest('POST', 'http://localhost:5173', 'browser'), true);
  assert.equal(isTrustedApiRequest('POST', 'http://localhost:5173'), false);
  assert.equal(isTrustedApiRequest('PUT', 'https://malicious.example', 'browser'), false);
  assert.equal(isTrustedApiRequest('GET', 'https://malicious.example'), false);
});
