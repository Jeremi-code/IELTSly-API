export type AIProvider = "gemini" | "openai";

export interface AICredentials {
  apiKey: string;
  provider: AIProvider;
  model?: string;
}

export interface EvaluateInput extends AICredentials {
  response: string;
  wordCount: number;
  type: "task1" | "task2";
  mode: "practice" | "exam";
  questionText: string;
  questionCategory?: string;
}
