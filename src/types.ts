export type Classification = {
  id: string;
  fileName: string;
  category: string;
  language: string;
  subject: string;
  confidence: number | null;
  inputTokens: number;
  cost: number;
  moved: boolean;
  unprocessable?: boolean;
  note?: string;
  error?: string;
};

export type RunSummary = {
  durationMs: number;
  totalCost: number;
  totalInputTokens: number;
  completedAt: Date;
};
