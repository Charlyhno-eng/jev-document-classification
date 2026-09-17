import assert from 'node:assert/strict';
import test from 'node:test';
import { listRootFiles, moveToCategory } from '../src/lib/file-system.js';

test('browser file listing ignores directories and sorts names', async () => {
  const entries = [
    { kind: 'file', name: 'z.txt' },
    { kind: 'directory', name: 'ignored' },
    { kind: 'file', name: 'a.txt' },
  ];
  const directory = { async *values() { yield* entries; } } as unknown as FileSystemDirectoryHandle;
  assert.deepEqual((await listRootFiles(directory)).map((file) => file.name), ['a.txt', 'z.txt']);
});

test('browser move creates a numbered target before removing the source', async () => {
  const writes: unknown[] = [];
  let removed = '';
  const destination = {
    async getFileHandle(name: string, options?: { create?: boolean }) {
      if (!options?.create && name === 'paper.pdf') return {};
      if (!options?.create) throw Object.assign(new DOMException('Missing', 'NotFoundError'));
      return { async createWritable() { return { async write(value: unknown) { writes.push(value); }, async close() {} }; } };
    },
  };
  const root = {
    async getDirectoryHandle() { return destination; },
    async removeEntry(name: string) { removed = name; },
  } as unknown as FileSystemDirectoryHandle;
  const file = new File(['pdf'], 'paper.pdf');
  const source = { name: file.name, async getFile() { return file; } } as unknown as FileSystemFileHandle;
  assert.equal(await moveToCategory(root, source, 'Research'), 'paper (1).pdf');
  assert.equal(writes.length, 1);
  assert.equal(removed, 'paper.pdf');
});
