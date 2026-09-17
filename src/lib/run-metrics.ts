import type { Classification } from '../types.js';

export function buildLanguageBreakdown(results: Classification[]) {
  return results
    .filter((item) => item.moved && !item.unprocessable && item.language !== '—')
    .reduce<Record<string, number>>((counts, item) => {
      counts[item.language] = (counts[item.language] ?? 0) + 1;
      return counts;
    }, {});
}
