import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import mammoth from 'mammoth';
import { resolveCategoryDirectory, resolveRootFile } from './security.js';
import { extensionOf, isPlainTextDocument } from '../shared/document-policy.js';

const runFile = promisify(execFile);

export async function chooseDirectory() {
  if (process.platform === 'win32') {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
      'if ($dialog.ShowDialog() -eq "OK") { Write-Output $dialog.SelectedPath }',
    ].join('; ');
    return runPicker('powershell.exe', ['-NoProfile', '-Command', script]);
  }
  if (process.platform === 'darwin') {
    return runPicker('osascript', ['-e', 'POSIX path of (choose folder with prompt "Choose the source folder")']);
  }

  try {
    return await runPicker('zenity', ['--file-selection', '--directory', '--title=Choose the source folder']);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return runPicker('kdialog', ['--getexistingdirectory', '.', '--title', 'Choose the source folder']);
  }
}

async function runPicker(command: string, args: string[]) {
  try {
    const { stdout } = await runFile(command, args);
    return stdout.trim().replace(/[\\/]$/, '');
  } catch (error) {
    const code = (error as { code?: string | number }).code;
    if (code === 1) return '';
    throw error;
  }
}

export async function listRootFileNames(directoryPath: string) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
}

export function safeRootFile(directoryPath: string, fileName: string) {
  return resolveRootFile(directoryPath, fileName);
}

export async function readDocumentText(filePath: string) {
  await assertRegularFile(filePath);
  const extension = extensionOf(filePath);
  if (isPlainTextDocument(filePath)) return readFile(filePath, 'utf8');
  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ buffer: await readFile(filePath) });
    return result.value;
  }
  if (extension === 'pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(await readFile(filePath));
    const standardFontDataUrl = path.join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/');
    const pdf = await pdfjs.getDocument({
      data,
      standardFontDataUrl,
      verbosity: pdfjs.VerbosityLevel.ERRORS,
    }).promise;
    const pages = await Promise.all(Array.from({ length: Math.min(pdf.numPages, 25) }, async (_, index) => {
      const page = await pdf.getPage(index + 1);
      const content = await page.getTextContent();
      return content.items.map((item) => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '')).join('');
    }));
    return pages.join('\n');
  }
  throw new Error(`.${extension || 'unknown'} files cannot be read. Supported formats: PDF, DOCX, TXT, MD, CSV, JSON, XML, HTML, and RTF.`);
}

export async function moveFileToCategory(directoryPath: string, fileName: string, category: string) {
  const sourcePath = safeRootFile(directoryPath, fileName);
  await assertRegularFile(sourcePath);
  const destinationDirectory = resolveCategoryDirectory(directoryPath, category);
  await mkdir(destinationDirectory, { recursive: true });
  const [realRoot, realDestination] = await Promise.all([realpath(directoryPath), realpath(destinationDirectory)]);
  if (path.dirname(realDestination) !== realRoot) throw new Error('The destination folder escapes the selected root.');
  const { name, ext } = path.parse(fileName);

  for (let index = 0; index < 1_000; index += 1) {
    const candidate = index === 0 ? fileName : `${name} (${index})${ext}`;
    try {
      await copyFile(sourcePath, path.join(realDestination, candidate), constants.COPYFILE_EXCL);
      await unlink(sourcePath);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new Error(`Could not find a free destination name for ${fileName}.`);
}

async function assertRegularFile(filePath: string) {
  const stats = await lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('Only regular files can be processed.');
}
