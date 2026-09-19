import { createHash } from 'node:crypto';
import { classifyDocument, type ClassificationInput, type ClassificationResult } from './classification.js';

const CACHE_CAPACITY = 500;
const CACHE_SCHEMA_VERSION = 'classification-cache-v2';

export class ClassificationCache {
  private readonly entries = new Map<string, ClassificationResult>();

  async resolve(input: ClassificationInput, classify: (request: ClassificationInput) => Promise<ClassificationResult> = classifyDocument) {
    const key = cacheKey(input);
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return {
        ...structuredClone(cached), usage: { inputTokens: 0 }, cost: 0, cacheHit: true,
        savedInputTokens: cached.usage.inputTokens, savedCost: cached.cost,
      };
    }

    const result = await classify(input);
    this.entries.set(key, structuredClone(result));
    if (this.entries.size > CACHE_CAPACITY) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey) this.entries.delete(oldestKey);
    }
    return { ...result, cacheHit: false };
  }

  clear() {
    this.entries.clear();
  }
}

export const sessionClassificationCache = new ClassificationCache();

export function classifyCachedDocument(input: ClassificationInput) {
  return sessionClassificationCache.resolve(input);
}

function cacheKey(input: ClassificationInput) {
  return createHash('sha256').update(JSON.stringify({
    version: CACHE_SCHEMA_VERSION,
    model: 'typesafe-ai/jev',
    fileName: input.fileName,
    text: input.text,
    categories: input.categories,
  })).digest('hex');
}
