import { generateObject, generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import {
  evaluationOutputSchema,
  type EvaluationResult,
} from "../zod/evaluation.schema.js";
import type { AICredentials, EvaluateInput } from "../types/ai.types.js";
import type {
  AnalyticsStats,
  CriteriaAverages,
  DailyComment,
} from "../types/analytics.types.js";

const DEFAULT_MODELS: Record<EvaluateInput["provider"], string> = {
  gemini: "gemini-3.5-flash",
  openai: "gpt-4o-mini",
};

/**
 * Resolves the appropriate AI model SDK instance based on user provider settings.
 * @param {AICredentials} credentials User AI credentials
 * @returns Model instance
 */
function resolveModel({ apiKey, provider, model }: AICredentials) {
  const modelName = model?.trim() || DEFAULT_MODELS[provider];

  if (provider === "gemini") {
    const google = createGoogleGenerativeAI({ apiKey });
    return google(modelName);
  }

  const openai = createOpenAI({ apiKey });
  return openai(modelName);
}

/**
 * Constructs prompt instructions for the AI examiner evaluation.
 * @param {EvaluateInput} input Evaluation input containing essay details
 * @returns {string} Formatted prompt string
 */
function buildPrompt(input: EvaluateInput): string {
  const taskLabel = input.type === "task1" ? "Task 1" : "Task 2";
  const isTask1 = input.type === "task1";
  const isPractice = input.mode === "practice";

  let wordCountGuidance = "";

  if (isPractice) {
    if (isTask1) {
      wordCountGuidance = `
## Word Count Rules (PRACTICE MODE ONLY):
- **Optimal Range**: 160 – 180 words.
- **Under 150 words**: Penalize Task Achievement (TA) for being under-length.
- **Over 180 words** (Current response: ${input.wordCount} words):
  - In practice mode, writing over 180 words is considered POOR practice due to verbosity and inefficient communication.
  - Because ${input.wordCount} > 180, you MUST penalize Task Achievement (TA) and Coherence & Cohesion (CC).
  - Do NOT award a high Band 8 or 9 if the response is overly verbose (${input.wordCount} words).
  - In your feedback and improvement tips, explicitly state that writing ${input.wordCount} words is poor practice, and advise the student to express their ideas in simpler and fewer words within 160–180 words.`;
    } else {
      wordCountGuidance = `
## Word Count Rules (PRACTICE MODE ONLY):
- **Optimal Range**: 260 – 280 words.
- **Under 250 words**: Penalize Task Achievement (TA) for being under-length.
- **Over 280 words** (Current response: ${input.wordCount} words):
  - In practice mode, writing over 280 words (e.g. 300+ words) is considered POOR practice because it leads to repetition, rambling, and loss of focus.
  - Because ${input.wordCount} > 280, you MUST penalize Task Achievement (TA) and Coherence & Cohesion (CC).
  - Do NOT award an overall score of Band 8 or 9 for an excessively long essay (${input.wordCount} words).
  - In your feedback and improvement tips, explicitly tell the user that writing ${input.wordCount} words is poor practice, and advise them to express their points using simpler structures and fewer words within the optimal 260–280 word range.`;
    }
  }

  return `You are an expert IELTS examiner evaluating a ${taskLabel} essay (${input.mode.toUpperCase()} MODE).

## Question
${input.questionText}${input.questionCategory ? ` (Category: ${input.questionCategory})` : ""}

## Student's Response (${input.wordCount} words)
${input.response}
${wordCountGuidance}

## Evaluation Instructions
Score each criterion on the official IELTS band scale (0–9, half-bands allowed like 6.5):

1. **TA (Task Achievement)** — Address all prompt requirements concisely. ${isPractice ? "(Apply practice mode word count penalties if word count is outside optimal limits)." : ""}
2. **CC (Coherence & Cohesion)** — Paragraphing, logical progression, cohesive devices without verbosity.
3. **LR (Lexical Resource)** — Range and precision of vocabulary, natural collocation, no over-repetition.
4. **GRA (Grammatical Range & Accuracy)** — Range and accuracy of sentence structures, punctuation.

**overallBand** = the average of the four criteria, rounded to the nearest half-band.

${isTask1 ? "For Task 1, emphasize accurate data description, key trend identification, and a clear overview." : ""}

Provide 2–4 sentences of encouraging but specific feedback and 2–4 concrete, actionable improvement tips tied to the weakest criteria${isPractice && ((isTask1 && input.wordCount > 180) || (!isTask1 && input.wordCount > 280)) ? " (including explicit advice to write simpler and in fewer words to stay within optimal word count limits)" : ""}.`;
}

/**
 * Evaluates an essay response using AI against official IELTS criteria.
 * @param {EvaluateInput} input Essay response data and API credentials
 * @returns {Promise<EvaluationResult>} Structured evaluation band scores and feedback
 */
export async function evaluateEssay(
  input: EvaluateInput,
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

/**
 * Generates dynamic study guidance comments based on user performance analytics.
 * @param {AnalyticsStats} stats Core analytics statistics
 * @param {CriteriaAverages} criteriaAverages Average scores per criterion
 * @param {AICredentials} [credentials] User AI credentials
 * @returns {Promise<DailyComment>} Diagnostic coach feedback object
 */
export async function generateDailyComment(
  stats: AnalyticsStats,
  criteriaAverages: CriteriaAverages,
  credentials?: AICredentials,
): Promise<DailyComment> {
  if (stats.evaluatedCount === 0) {
    return {
      text: "Welcome to IELTSly! Submit your first essay to start tracking your progress.",
      tone: "neutral",
    };
  }

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

  const lines = text.trim().split("\n");
  const lastLine = lines[lines.length - 1].trim().toUpperCase();
  let tone: DailyComment["tone"] = "neutral";
  if (lastLine.includes("POSITIVE")) tone = "positive";
  else if (lastLine.includes("PUSH")) tone = "push";

  const commentText =
    lines.length > 1 ? lines.slice(0, -1).join("\n").trim() : text.trim();

  return { text: commentText, tone };
}
