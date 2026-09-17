import { classifyDocument } from './classification.js';
import { moveFileToCategory, readDocumentText, safeRootFile } from './documents.js';
import { isSupportedDocument, NOT_PROCESSABLE_FOLDER, unsupportedDocumentMessage } from '../shared/document-policy.js';

type LocalClassificationConfig = {
  apiKey: string;
  categories: string[];
};

type LocalClassificationDependencies = {
  classify?: typeof classifyDocument;
  extract?: typeof readDocumentText;
  move?: typeof moveFileToCategory;
};

export type LocalClassificationResult = {
  category: string;
  categoryConfidence: number | null;
  destinationCategory: string;
  needsReview: boolean;
  language: string;
  subject: string;
  usage: { inputTokens: number };
  cost: number;
  unprocessable?: boolean;
  note?: string;
  movedFileName: string;
};

export async function processLocalDocument(
  directoryPath: string,
  fileName: string,
  config: LocalClassificationConfig,
  dependencies: LocalClassificationDependencies = {},
): Promise<LocalClassificationResult> {
  const extract = dependencies.extract ?? readDocumentText;
  const move = dependencies.move ?? moveFileToCategory;
  const classify = dependencies.classify ?? classifyDocument;

  if (!isSupportedDocument(fileName)) {
    return moveToNotProcessable(directoryPath, fileName, unsupportedDocumentMessage(fileName), move);
  }

  let extractedText: string;
  try {
    extractedText = (await extract(safeRootFile(directoryPath, fileName))).trim();
  } catch (error) {
    return moveToNotProcessable(directoryPath, fileName, `Text extraction failed: ${messageOf(error)}`, move);
  }

  if (!extractedText) {
    return moveToNotProcessable(directoryPath, fileName, 'No selectable text was found. The document may require OCR.', move);
  }

  const result = await classify({ fileName, text: extractedText, categories: config.categories, apiKey: config.apiKey });
  const movedFileName = await move(directoryPath, fileName, result.destinationCategory);
  return { ...result, movedFileName };
}

async function moveToNotProcessable(
  directoryPath: string,
  fileName: string,
  note: string,
  move: typeof moveFileToCategory,
): Promise<LocalClassificationResult> {
  const movedFileName = await move(directoryPath, fileName, NOT_PROCESSABLE_FOLDER);
  return {
    category: NOT_PROCESSABLE_FOLDER,
    categoryConfidence: null,
    destinationCategory: NOT_PROCESSABLE_FOLDER,
    needsReview: false,
    language: '—',
    subject: '—',
    usage: { inputTokens: 0 },
    cost: 0,
    unprocessable: true,
    note,
    movedFileName,
  };
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown extraction error.';
}
