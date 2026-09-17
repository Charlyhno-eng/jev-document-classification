import { chmod, lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { validateApiKey, validateCategoryName } from './security.js';
import { NEED_REVIEW_FOLDER, NOT_PROCESSABLE_FOLDER } from '../shared/document-policy.js';

export type AppConfig = { categories: string[]; apiKey: string };
export const DEFAULT_CONFIG: AppConfig = { categories: ['Finance', 'Legal', 'Operations'], apiKey: '' };

export class ConfigStore {
  private updateQueue: Promise<void> = Promise.resolve();

  constructor(private readonly configPath: string) {}

  async read(): Promise<AppConfig> {
    let contents: string;
    try {
      const stats = await lstat(this.configPath);
      if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('config/config.toml must be a regular file.');
      contents = await readFile(this.configPath, 'utf8');
      await chmod(this.configPath, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await this.write(DEFAULT_CONFIG);
      return structuredClone(DEFAULT_CONFIG);
    }
    return parseConfig(contents);
  }

  async write(config: AppConfig) {
    const validated = { categories: validateCategories(config.categories), apiKey: config.apiKey ? validateApiKey(config.apiKey) : '' };
    const configDirectory = path.dirname(this.configPath);
    await mkdir(configDirectory, { recursive: true });
    if (await realpath(configDirectory) !== path.resolve(configDirectory)) throw new Error('The configuration directory cannot be a symbolic link.');
    const temporaryPath = `${this.configPath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, serializeConfig(validated), { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, this.configPath);
    await chmod(this.configPath, 0o600);
  }

  async writeCategories(categories: unknown) {
    return this.enqueue(async () => {
      const current = await this.read();
      const validated = validateCategories(categories);
      await this.write({ ...current, categories: validated });
      return validated;
    });
  }

  async writeApiKey(value: unknown) {
    return this.enqueue(async () => {
      const current = await this.read();
      await this.write({ ...current, apiKey: validateApiKey(value) });
    });
  }

  private enqueue<T>(operation: () => Promise<T>) {
    const result = this.updateQueue.then(operation, operation);
    this.updateQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

export function parseConfig(contents: string): AppConfig {
  const categoriesMatch = contents.match(/^\s*categories\s*=\s*(\[.*\])\s*$/m);
  if (!categoriesMatch) throw new Error('config/config.toml must define classification.categories.');
  let categories: unknown;
  try { categories = JSON.parse(categoriesMatch[1]); } catch { throw new Error('classification.categories must be an array of quoted strings.'); }

  const apiKeyMatch = contents.match(/^\s*api_key\s*=\s*("(?:\\.|[^"\\])*")\s*$/m);
  let apiKey = '';
  if (apiKeyMatch) {
    try { apiKey = JSON.parse(apiKeyMatch[1]) as string; } catch { throw new Error('ai.api_key must be a quoted string.'); }
  }
  return { categories: validateCategories(categories), apiKey: apiKey ? validateApiKey(apiKey) : '' };
}

export function serializeConfig(config: AppConfig) {
  return ['[classification]', `categories = ${JSON.stringify(config.categories)}`, '', '[ai]', `api_key = ${JSON.stringify(config.apiKey)}`, ''].join('\n');
}

export function toPublicConfig(config: AppConfig) {
  return { categories: config.categories, apiKeyConfigured: Boolean(config.apiKey) };
}

export function validateCategories(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) throw new Error('Provide between 1 and 50 categories.');
  const categories = value.map(validateCategoryName);
  if (new Set(categories.map((category) => category.toLocaleLowerCase())).size !== categories.length) throw new Error('Category names must be unique.');
  const reservedFolders = [NOT_PROCESSABLE_FOLDER, NEED_REVIEW_FOLDER];
  if (categories.some((category) => reservedFolders.some((reserved) => category.toLocaleLowerCase() === reserved.toLocaleLowerCase()))) {
    throw new Error(`“${NOT_PROCESSABLE_FOLDER}” and “${NEED_REVIEW_FOLDER}” are reserved folders.`);
  }
  return categories;
}

const configStore = new ConfigStore(path.resolve(process.cwd(), 'config/config.toml'));
export const readAppConfig = () => configStore.read();
export const readCategories = async () => (await configStore.read()).categories;
export const readApiKey = async () => (await configStore.read()).apiKey;
export const writeCategories = (categories: unknown) => configStore.writeCategories(categories);
export const writeApiKey = (apiKey: unknown) => configStore.writeApiKey(apiKey);
