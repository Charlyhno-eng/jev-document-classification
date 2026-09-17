import path from 'node:path';
import { classifyDocument } from '../server/classification.js';
import { readAppConfig } from '../server/config.js';
import { listRootFileNames, readDocumentText, safeRootFile } from '../server/documents.js';
import { isSupportedDocument } from '../shared/document-policy.js';
import { mapWithConcurrency } from '../src/lib/concurrency.js';

const directoryArgument = process.argv[2];
if (!directoryArgument) throw new Error('Usage: npm run benchmark:classification -- /absolute/path/to/folder');

const directoryPath = path.resolve(directoryArgument);
const config = await readAppConfig();
if (!config.apiKey) throw new Error('Configure a Vercel AI Gateway API key before running the benchmark.');

const fileNames = (await listRootFileNames(directoryPath)).filter(isSupportedDocument).slice(0, 10);
const documents = await Promise.all(fileNames.map(async (fileName) => ({
  fileName,
  text: (await readDocumentText(safeRootFile(directoryPath, fileName))).trim(),
})));
const readableDocuments = documents.filter((document) => document.text);
if (!readableDocuments.length) throw new Error('The selected folder has no readable supported documents.');

const comparisons = await mapWithConcurrency(readableDocuments, 8, async ({ fileName, text }) => {
  const input = { fileName, text, categories: config.categories, apiKey: config.apiKey };
  const [structured, full] = await Promise.all([
    classifyDocument(input, undefined, { contextMode: 'structured' }),
    classifyDocument(input, undefined, { contextMode: 'full' }),
  ]);
  return {
    fileName,
    structured: { category: structured.category, language: structured.language, subject: structured.subject, inputTokens: structured.usage.inputTokens, cost: structured.cost },
    full: { category: full.category, language: full.language, subject: full.subject, inputTokens: full.usage.inputTokens, cost: full.cost },
    agreement: {
      category: structured.category === full.category,
      language: structured.language === full.language,
      subject: structured.subject === full.subject,
    },
  };
});

const totals = comparisons.reduce((total, comparison) => ({
  structuredTokens: total.structuredTokens + comparison.structured.inputTokens,
  fullTokens: total.fullTokens + comparison.full.inputTokens,
  structuredCost: total.structuredCost + comparison.structured.cost,
  fullCost: total.fullCost + comparison.full.cost,
  categoryMatches: total.categoryMatches + Number(comparison.agreement.category),
  languageMatches: total.languageMatches + Number(comparison.agreement.language),
  subjectMatches: total.subjectMatches + Number(comparison.agreement.subject),
}), { structuredTokens: 0, fullTokens: 0, structuredCost: 0, fullCost: 0, categoryMatches: 0, languageMatches: 0, subjectMatches: 0 });

console.log(JSON.stringify({
  documents: comparisons.length,
  totals: {
    ...totals,
    tokenReduction: totals.fullTokens ? 1 - totals.structuredTokens / totals.fullTokens : 0,
    costReduction: totals.fullCost ? 1 - totals.structuredCost / totals.fullCost : 0,
  },
  comparisons,
}, null, 2));
