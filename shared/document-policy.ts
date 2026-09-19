export const NOT_PROCESSABLE_FOLDER = 'Not processable';
export const NEED_REVIEW_FOLDER = 'Need review';
export const SUSPECTED_PROMPT_INJECTION_FOLDER = 'Suspected prompt injection';
export const CATEGORY_CONFIDENCE_THRESHOLD = 0.75;

export function needsReview(confidence: number | null) {
  return confidence !== null && confidence < CATEGORY_CONFIDENCE_THRESHOLD;
}

export function hasPromptInjectionRisk(score: number) {
  return score > 50;
}

const PLAIN_TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'xml', 'html', 'htm', 'rtf', 'log', 'yaml', 'yml',
]);

export function extensionOf(fileName: string) {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > -1 ? fileName.slice(lastDot + 1).toLowerCase() : '';
}

export function isPlainTextDocument(fileName: string) {
  return PLAIN_TEXT_EXTENSIONS.has(extensionOf(fileName));
}

export function isSupportedDocument(fileName: string) {
  const extension = extensionOf(fileName);
  return PLAIN_TEXT_EXTENSIONS.has(extension) || extension === 'pdf' || extension === 'docx';
}

export function isPreviewableImage(fileName: string) {
  return new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']).has(extensionOf(fileName));
}

export function unsupportedDocumentMessage(fileName: string) {
  const extension = extensionOf(fileName);
  return `.${extension || 'unknown'} files are not supported and were moved without being sent to JEV.`;
}
