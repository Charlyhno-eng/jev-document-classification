import { createGateway, experimental_evaluate as evaluate } from 'ai';
import { extractSubjectCandidates } from './subject.js';
import { buildDocumentProfile } from './document-profile.js';
import { NEED_REVIEW_FOLDER, needsReview } from '../shared/document-policy.js';

export const PRICE_PER_MILLION_INPUT_TOKENS = 0.04;
export type ClassificationContextMode = 'structured' | 'full';

export type ClassificationDecision = {
  category: string;
  categoryConfidence: number | null;
  language: string;
  subject: string;
  inputTokens: number;
};

type EvaluationInput = {
  apiKey: string;
  fileName: string;
  text: string;
  categories: string[];
  subjectCandidates: string[];
  documentContext: string;
};

export type EvaluationRunner = (input: EvaluationInput) => Promise<ClassificationDecision>;

export async function classifyDocument(
  input: Omit<EvaluationInput, 'subjectCandidates' | 'documentContext'>,
  runner: EvaluationRunner = runJevEvaluation,
  options: { contextMode?: ClassificationContextMode } = {},
) {
  const subjectCandidates = extractSubjectCandidates(input.fileName, input.text);
  const documentContext = buildClassificationContext(input.fileName, input.text, options.contextMode ?? 'structured');
  const decision = await runner({ ...input, subjectCandidates, documentContext });
  if (!input.categories.includes(decision.category)) throw new Error('JEV returned a category outside the configured choices.');
  if (!subjectCandidates.includes(decision.subject)) throw new Error('JEV returned a subject outside the extracted candidates.');
  if (!Number.isSafeInteger(decision.inputTokens) || decision.inputTokens < 0) throw new Error('JEV returned invalid token usage.');
  return {
    category: decision.category,
    categoryConfidence: decision.categoryConfidence,
    destinationCategory: needsReview(decision.categoryConfidence) ? NEED_REVIEW_FOLDER : decision.category,
    needsReview: needsReview(decision.categoryConfidence),
    language: decision.language,
    subject: decision.subject,
    usage: { inputTokens: decision.inputTokens },
    cost: (decision.inputTokens / 1_000_000) * PRICE_PER_MILLION_INPUT_TOKENS,
  };
}

export function buildClassificationContext(fileName: string, text: string, mode: ClassificationContextMode = 'structured') {
  if (mode === 'full') return `Document filename: ${fileName}\n\nDocument text:\n${text.trim().slice(0, 24_000)}`;
  return buildDocumentProfile(fileName, text).content;
}

async function runJevEvaluation(input: EvaluationInput): Promise<ClassificationDecision> {
  const gateway = createGateway({ apiKey: input.apiKey });
  const categoryCriteria = Object.fromEntries(input.categories.map((category) => [category, `The document belongs in the ${category} folder.`]));
  const subjectCriteria = Object.fromEntries(input.subjectCandidates.map((subject) => [subject, `This phrase most precisely describes the document's central topic.`]));
  const result = await evaluate({
    model: gateway.evaluation('typesafe-ai/jev'),
    state: input.documentContext,
    questions: {
      category: { type: 'choice', instructions: 'Choose the one configured destination folder that best fits this document.', criteria: categoryCriteria },
      language: {
        type: 'choice',
        instructions: 'Identify the primary language used in the document.',
        criteria: {
          English: 'The primary language is English.', French: 'The primary language is French.', Spanish: 'The primary language is Spanish.',
          German: 'The primary language is German.', Italian: 'The primary language is Italian.', Portuguese: 'The primary language is Portuguese.',
          Dutch: 'The primary language is Dutch.', Other: 'Another language or not enough readable text to identify one.',
        },
      },
      subject: { type: 'choice', instructions: 'Choose the most precise phrase for the document’s central subject, favoring specificity over broad themes.', criteria: subjectCriteria },
    },
  });

  return {
    category: result.answers.category.choice,
    categoryConfidence: result.answers.category.probabilities?.[result.answers.category.choice] ?? null,
    language: result.answers.language.choice,
    subject: result.answers.subject.choice,
    inputTokens: result.usage.inputTokens ?? 0,
  };
}
