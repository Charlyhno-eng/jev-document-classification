import path from 'node:path';

const windowsReservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const unsafeNameCharacters = /[<>:"/\\|?*\u0000-\u001f]/;
const allowedOrigins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);

export function isTrustedApiRequest(method: string, origin?: string, clientMarker?: string) {
  if (origin && !allowedOrigins.has(origin)) return false;
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || clientMarker === 'browser';
}

export function validateCategoryName(value: unknown) {
  if (typeof value !== 'string') throw new Error('Every category must be a string.');
  const name = value.trim();
  if (!name || name.length > 80 || unsafeNameCharacters.test(name) || /^\.|[. ]$/.test(name) || windowsReservedNames.test(name)) {
    throw new Error('Category names must be valid folder names with 1 to 80 characters.');
  }
  return name;
}

export function validateApiKey(value: unknown) {
  if (typeof value !== 'string') throw new Error('An AI Gateway API key is required.');
  const apiKey = value.trim();
  if (apiKey.length < 20 || apiKey.length > 512 || /\s/.test(apiKey)) {
    throw new Error('Enter a valid AI Gateway API key.');
  }
  return apiKey;
}

export function resolveRootFile(root: string, fileName: unknown) {
  if (typeof fileName !== 'string' || !fileName || fileName.length > 255 || path.basename(fileName) !== fileName || fileName === '.' || fileName === '..') {
    throw new Error('Invalid root-level file name.');
  }
  return resolveChild(root, fileName);
}

export function resolveCategoryDirectory(root: string, category: unknown) {
  return resolveChild(root, validateCategoryName(category));
}

function resolveChild(root: string, child: string) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, child);
  if (path.dirname(resolved) !== resolvedRoot) throw new Error('The requested path escapes the selected folder.');
  return resolved;
}
