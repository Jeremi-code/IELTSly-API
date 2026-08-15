import { generateObject, generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { evaluationOutputSchema, type EvaluationResult } from "../zod/evaluation.schema.js";
import type { AICredentials, EvaluateInput } from "../types/ai.types.js";
import type { AnalyticsStats, CriteriaAverages, DailyComment } from "../types/analytics.types.js";

const DEFAULT_MODELS: Record<EvaluateInput["provider"], string> = {
  gemini: "gemini-3.5-flash",
  openai: "gpt-4o-mini",
};

// ── Resolve which AI model to use ───────────────────────────────────
// Users always bring their own key (Gemini or OpenAI). No server-side key.
function resolveModel({ apiKey, provider, model }: AICredentials) {
  const modelName = model?.trim() || DEFAULT_MODELS[provider];

  if (provider === "gemini") {
    const google = createGoogleGenerativeAI({ apiKey });
    return google(modelName);
  }

  const openai = createOpenAI({ apiKey });
  return openai(modelName);
}

// ── Build IELTS examiner prompt ─────────────────────────────────────
function buildPrompt(input: EvaluateInput): string {
  const taskLabel = input.type === "task1" ? "Task 1" : "Task 2";
  const modeNote =
    input.mode === "exam"
      ? " This was written under strict exam conditions — apply real-exam strictness."
      : "";

  return `You are an expert IELTS examiner evaluating a ${taskLabel} essay.${modeNote}

## Question
${input.questionText}${input.questionCategory ? ` (Category: ${input.questionCategory})` : ""}

## Student's Response (${input.wordCount} words)
${input.response}

## Evaluation Instructions
Score each criterion on the IELTS band scale (0–9, half-bands allowed like 6.5):

1. **TA (Task Achievement)** — Did they fully address all parts of the prompt with a clear position?
2. **CC (Coherence & Cohesion)** — Paragraphing, logical progression, cohesive devices without overuse.
3. **LR (Lexical Resource)** — Range and precision of vocabulary, natural collocation, no over-repetition.
4. **GRA (Grammatical Range & Accuracy)** — Range and accuracy of sentence structures, punctuation.

**overallBand** = the average of the four criteria, rounded to the nearest half-band.

${input.type === "task1" ? "For Task 1, emphasize accurate data description, key trend identification, and a clear overview." : ""}

Provide 2–4 sentences of encouraging but specific feedback and 2–4 concrete, actionable improvement tips tied to the weakest criteria.`;
}

// ── Main evaluation function ────────────────────────────────────────
export async function evaluateEssay(
  input: EvaluateInput
): Promise<EvaluationResult> {
  const model = resolveModel(input);

  const { object } = await generateObject({
    model,
    schema: evaluationOutputSchema,
    system:
      "You are a certified IELTS examiner. Evaluate strictly against the official IELTS band descriptors. Be fair, precise, and constructive.",
    prompt: buildPrompt(input),
  });

  return object;
}

// ── Daily comment generation ────────────────────────────────────────
export async function generateDailyComment(
  stats: AnalyticsStats,
  criteriaAverages: CriteriaAverages,
  credentials?: AICredentials
): Promise<DailyComment> {
  // Need at least one evaluated essay to generate a meaningful comment.
  if (stats.evaluatedCount === 0) {
    return {
      text: "Welcome to IELTSly! Submit your first essay to start tracking your progress.",
      tone: "neutral",
    };
  }

  // No user credentials — throw so the caller falls back to a static comment.
  if (!credentials) {
    throw new Error("No AI credentials for daily comment.");
  }

  const model = resolveModel(credentials);

  const summary = `Student stats: ${stats.evaluatedCount} evaluated essays, avg band ${stats.averageBand}, best ${stats.bestBand}. Task 1 avg: ${stats.task1Average}, Task 2 avg: ${stats.task2Average}. Criteria avgs — TA: ${criteriaAverages.ta}, CC: ${criteriaAverages.cc}, LR: ${criteriaAverages.lr}, GRA: ${criteriaAverages.gra}. ${stats.inProgressCount} drafts in progress.`;

  const { text } = await generateText({
    model,
    system:
      "Act as an IELTS tutor. Based on the student's stats, write ONE encouraging paragraph (2–3 sentences) with one concrete focus area for today. End your response with a tone tag on a new line: either POSITIVE, NEUTRAL, or PUSH.",
    prompt: summary,
  });

  // Parse tone from the last line.
  const lines = text.trim().split("\n");
  const lastLine = lines[lines.length - 1].trim().toUpperCase();
  let tone: DailyComment["tone"] = "neutral";
  if (lastLine.includes("POSITIVE")) tone = "positive";
  else if (lastLine.includes("PUSH")) tone = "push";

  // Remove the tone tag line from the comment text.
  const commentText =
    lines.length > 1 ? lines.slice(0, -1).join("\n").trim() : text.trim();

  return { text: commentText, tone };
}
