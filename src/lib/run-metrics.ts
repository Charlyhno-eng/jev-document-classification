import type { Classification } from '../types.js';

export type RunPerformance = {
  savedInputTokens: number;
  savedCost: number;
  cacheHits: number;
  documentsPerMinute: number | null;
  averageConfidence: number | null;
  confidenceCount: number;
};

export function buildRunPerformance(results: Classification[], durationMs: number | null): RunPerformance {
  const confidenceValues = results.filter((item) => !item.unprocessable && item.confidence !== null).map((item) => item.confidence as number);
  return {
    savedInputTokens: results.reduce((total, item) => total + (item.savedInputTokens ?? 0), 0),
    savedCost: results.reduce((total, item) => total + (item.savedCost ?? 0), 0),
    cacheHits: results.filter((item) => item.cacheHit).length,
    documentsPerMinute: durationMs && durationMs > 0 ? results.length / (durationMs / 60_000) : null,
    averageConfidence: confidenceValues.length ? confidenceValues.reduce((total, value) => total + value, 0) / confidenceValues.length : null,
    confidenceCount: confidenceValues.length,
  };
}
