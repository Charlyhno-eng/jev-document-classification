import { createGateway, experimental_evaluate as evaluate } from 'ai';
import { extractSubjectCandidates } from './subject.js';

export const PRICE_PER_MILLION_INPUT_TOKENS = 0.04;

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
};

export type EvaluationRunner = (input: EvaluationInput) => Promise<ClassificationDecision>;

export async function classifyDocument(
  input: Omit<EvaluationInput, 'subjectCandidates'>,
  runner: EvaluationRunner = runJevEvaluation,
) {
  const subjectCandidates = extractSubjectCandidates(input.fileName, input.text);
  const decision = await runner({ ...input, subjectCandidates });
  if (!input.categories.includes(decision.category)) throw new Error('JEV returned a category outside the configured choices.');
  if (!subjectCandidates.includes(decision.subject)) throw new Error('JEV returned a subject outside the extracted candidates.');
  if (!Number.isSafeInteger(decision.inputTokens) || decision.inputTokens < 0) throw new Error('JEV returned invalid token usage.');
  return {
    category: decision.category,
    categoryConfidence: decision.categoryConfidence,
    language: decision.language,
    subject: decision.subject,
    usage: { inputTokens: decision.inputTokens },
    cost: (decision.inputTokens / 1_000_000) * PRICE_PER_MILLION_INPUT_TOKENS,
  };
}

async function runJevEvaluation(input: EvaluationInput): Promise<ClassificationDecision> {
  const gateway = createGateway({ apiKey: input.apiKey });
  const categoryCriteria = Object.fromEntries(input.categories.map((category) => [category, `The document belongs in the ${category} folder.`]));
  const subjectCriteria = Object.fromEntries(input.subjectCandidates.map((subject) => [subject, `This phrase most precisely describes the document's central topic.`]));
  const state = `Document filename: ${input.fileName}\n\nDocument text:\n${input.text.slice(0, 24_000)}`;
  const result = await evaluate({
    model: gateway.evaluation('typesafe-ai/jev'),
    state,
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
