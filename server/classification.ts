import { createGateway, experimental_evaluate as evaluate } from 'ai';
import { extractSubjectCandidates } from './subject.js';
import { buildDocumentProfile } from './document-profile.js';
import { NEED_REVIEW_FOLDER, needsReview } from '../shared/document-policy.js';

export const PRICE_PER_MILLION_INPUT_TOKENS = 0.04;
export type ClassificationContextMode = 'structured' | 'full';
export const MAX_SUBJECT_CHOICES = 10;

export type ClassificationInput = {
  apiKey: string;
  fileName: string;
  text: string;
  categories: string[];
};

export type ClassificationResult = {
  category: string;
  categoryConfidence: number | null;
  destinationCategory: string;
  needsReview: boolean;
  language: string;
  subject: string;
  usage: { inputTokens: number };
  cost: number;
  cacheHit?: boolean;
  savedInputTokens?: number;
  savedCost?: number;
};

export type ClassificationDecision = {
  category: string;
  categoryConfidence: number | null;
  language: string;
  subject: string;
  inputTokens: number;
};

type EvaluationInput = ClassificationInput & {
  subjectCandidates: string[];
  documentContext: string;
};

export type EvaluationRunner = (input: EvaluationInput) => Promise<ClassificationDecision>;

export async function classifyDocument(
  input: ClassificationInput,
  runner: EvaluationRunner = runJevEvaluation,
  options: { contextMode?: ClassificationContextMode } = {},
): Promise<ClassificationResult> {
  const subjectCandidates = extractSubjectCandidates(input.fileName, input.text, MAX_SUBJECT_CHOICES);
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
  const categoryCriteria = Object.fromEntries(input.categories.map((category) => [category, `Destination: ${category}.`]));
  const subjectCriteria = Object.fromEntries(input.subjectCandidates.map((subject) => [subject, `Subject: ${subject}.`]));
  const result = await evaluate({
    model: gateway.evaluation('typesafe-ai/jev'),
    state: input.documentContext,
    questions: {
      category: { type: 'choice', instructions: 'Choose the best configured destination folder.', criteria: categoryCriteria },
      language: {
        type: 'choice',
        instructions: 'Identify the primary language used in the document.',
        criteria: {
          English: 'English.', French: 'French.', Spanish: 'Spanish.', German: 'German.', Italian: 'Italian.', Portuguese: 'Portuguese.',
          Dutch: 'Dutch.', Other: 'Another language or insufficient readable text.',
        },
      },
      subject: { type: 'choice', instructions: 'Choose the most precise central subject.', criteria: subjectCriteria },
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
