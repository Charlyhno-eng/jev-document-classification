import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ConfigStore, parseConfig, serializeConfig, toPublicConfig, validateCategories } from '../../server/config.js';

test('parses and serializes categories and the API key without data loss', () => {
  const config = { categories: ['Finance', 'Doctoral thesis'], apiKey: 'secret-key-' + 'x'.repeat(24), sourceFolderPath: '/tmp/to-organize' };
  assert.deepEqual(parseConfig(serializeConfig(config)), config);
});

test('supports an empty key but rejects malformed configuration', () => {
  assert.deepEqual(parseConfig('[classification]\ncategories = ["Legal"]\n\n[ai]\napi_key = ""\n'), { categories: ['Legal'], apiKey: '', sourceFolderPath: '' });
  assert.throws(() => parseConfig('[classification]\ncategories = nope'));
  assert.throws(() => parseConfig('[classification]\ncategories = []'));
});

test('public configuration never contains the API key', () => {
  const publicConfig = toPublicConfig({ categories: ['Research'], apiKey: 'secret-key-' + 'x'.repeat(24), sourceFolderPath: '/tmp/to-organize' });
  assert.deepEqual(publicConfig, { categories: ['Research'], apiKeyConfigured: true, sourceFolderPath: '/tmp/to-organize' });
  assert.equal('apiKey' in publicConfig, false);
});

test('validates category count, uniqueness, and folder safety', () => {
  assert.deepEqual(validateCategories(['Finance', 'Research']), ['Finance', 'Research']);
  assert.throws(() => validateCategories([]));
  assert.throws(() => validateCategories(['Finance', 'finance']));
  assert.throws(() => validateCategories(['Not processable']), /reserved/);
  assert.throws(() => validateCategories(['Need review']), /reserved/);
  assert.throws(() => validateCategories(['Suspected prompt injection']), /reserved/);
  assert.throws(() => validateCategories(['../escape']));
  assert.throws(() => validateCategories(Array.from({ length: 51 }, (_, index) => `Category ${index}`)));
});

test('creates a private config and preserves the key when categories change', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jev-config-'));
  const configPath = path.join(directory, 'config', 'config.toml');
  const store = new ConfigStore(configPath);
  assert.deepEqual((await store.read()).categories, ['Finance', 'Legal', 'Operations']);
  await store.writeApiKey('gateway-key-' + 'x'.repeat(24));
  await store.writeCategories(['Whitepaper', 'Doctoral thesis']);
  assert.deepEqual(await store.read(), { categories: ['Whitepaper', 'Doctoral thesis'], apiKey: 'gateway-key-' + 'x'.repeat(24), sourceFolderPath: '' });
  assert.equal((await stat(configPath)).mode & 0o777, 0o600);
  assert.match(await readFile(configPath, 'utf8'), /\[ai\]\napi_key = "/);
});

test('serializes concurrent key and category updates without losing either value', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jev-config-concurrent-'));
  const store = new ConfigStore(path.join(directory, 'config.toml'));
  await store.read();
  await Promise.all([
    store.writeApiKey('concurrent-key-' + 'x'.repeat(24)),
    store.writeCategories(['Research', 'Whitepaper']),
  ]);
  assert.deepEqual(await store.read(), { categories: ['Research', 'Whitepaper'], apiKey: 'concurrent-key-' + 'x'.repeat(24), sourceFolderPath: '' });
});

test('rejects a symlinked configuration file or directory', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jev-config-symlink-'));
  const outside = path.join(directory, 'outside.toml');
  await writeFile(outside, serializeConfig({ categories: ['Research'], apiKey: '', sourceFolderPath: '' }));
  const linkedFile = path.join(directory, 'linked.toml');
  await symlink(outside, linkedFile);
  await assert.rejects(() => new ConfigStore(linkedFile).read(), /regular file/);

  const realDirectory = path.join(directory, 'real');
  await mkdir(realDirectory);
  const linkedDirectory = path.join(directory, 'linked-directory');
  await symlink(realDirectory, linkedDirectory);
  await assert.rejects(() => new ConfigStore(path.join(linkedDirectory, 'config.toml')).write({ categories: ['Research'], apiKey: '', sourceFolderPath: '' }), /symbolic link/);
});
