export async function listRootFiles(directory: FileSystemDirectoryHandle): Promise<FileSystemFileHandle[]> {
  const files: FileSystemFileHandle[] = [];
  for await (const entry of directory.values()) {
    if (entry.kind === 'file') files.push(entry);
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

export async function moveToCategory(root: FileSystemDirectoryHandle, source: FileSystemFileHandle, category: string) {
  const destination = await root.getDirectoryHandle(category, { create: true });
  const destinationName = await availableFileName(destination, source.name);
  const target = await destination.getFileHandle(destinationName, { create: true });
  const writer = await target.createWritable();
  await writer.write(await source.getFile());
  await writer.close();
  await root.removeEntry(source.name);
  return destinationName;
}

export async function restoreFromCategory(root: FileSystemDirectoryHandle, category: string, fileName: string) {
  const sourceDirectory = await root.getDirectoryHandle(category);
  const source = await sourceDirectory.getFileHandle(fileName);
  const destinationName = await availableFileName(root, fileName);
  const target = await root.getFileHandle(destinationName, { create: true });
  const writer = await target.createWritable();
  await writer.write(await source.getFile());
  await writer.close();
  await sourceDirectory.removeEntry(fileName);
  return destinationName;
}

async function availableFileName(directory: FileSystemDirectoryHandle, originalName: string) {
  const lastDot = originalName.lastIndexOf('.');
  const stem = lastDot > 0 ? originalName.slice(0, lastDot) : originalName;
  const extension = lastDot > 0 ? originalName.slice(lastDot) : '';
  for (let index = 0; index < 1_000; index += 1) {
    const candidate = index === 0 ? originalName : `${stem} (${index})${extension}`;
    try {
      await directory.getFileHandle(candidate);
    } catch (error) {
      if ((error as DOMException).name === 'NotFoundError') return candidate;
      throw error;
    }
  }
  throw new Error(`Could not find a free destination name for ${originalName}.`);
}
