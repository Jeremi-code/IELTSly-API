import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateEssay, generateDailyComment } from "../src/services/evaluation.service.js";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(),
}));

import { generateObject, generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

const mockGenerateObject = vi.mocked(generateObject);
const mockGenerateText = vi.mocked(generateText);
const mockGoogle = vi.mocked(createGoogleGenerativeAI);
const mockOpenAI = vi.mocked(createOpenAI);

const EVALUATION = {
  overallBand: 7.5,
  criteria: { ta: 7.5, cc: 7.5, lr: 7.0, gra: 8.0 },
  feedback: "Strong work.",
  tips: ["Add detail."],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGoogle.mockReturnValue(vi.fn(() => ({ provider: "gemini" })) as never);
  mockOpenAI.mockReturnValue(vi.fn(() => ({ provider: "openai" })) as never);
  mockGenerateObject.mockResolvedValue({ object: EVALUATION } as never);
});

describe("evaluateEssay", () => {
  const baseInput = {
    response: "Some essay response with enough words to evaluate.",
    wordCount: 9,
    type: "task2" as const,
    mode: "practice" as const,
    questionText: "Do you agree that social media harms youth?",
  };

  it("uses the user's Gemini key with the default model", async () => {
    const googleModel = vi.fn();
    mockGoogle.mockReturnValue(googleModel as never);

    await evaluateEssay({ ...baseInput, apiKey: "gem-key-1", provider: "gemini" });

    expect(mockGoogle).toHaveBeenCalledWith({ apiKey: "gem-key-1" });
    expect(googleModel).toHaveBeenCalledWith("gemini-3.5-flash");
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({ schema: expect.anything() })
    );
  });

  it("uses OpenAI with the default gpt-4o-mini model", async () => {
    const openaiModel = vi.fn();
    mockOpenAI.mockReturnValue(openaiModel as never);

    await evaluateEssay({ ...baseInput, apiKey: "sk-test", provider: "openai" });

    expect(mockOpenAI).toHaveBeenCalledWith({ apiKey: "sk-test" });
    expect(openaiModel).toHaveBeenCalledWith("gpt-4o-mini");
  });

  it("honors a custom model override", async () => {
    const googleModel = vi.fn();
    mockGoogle.mockReturnValue(googleModel as never);

    await evaluateEssay({
      ...baseInput,
      apiKey: "gem-key-2",
      provider: "gemini",
      model: "gemini-2.5-flash",
    });

    expect(googleModel).toHaveBeenCalledWith("gemini-2.5-flash");
  });

  it("returns the structured evaluation object", async () => {
    const result = await evaluateEssay({ ...baseInput, apiKey: "k", provider: "openai" });
    expect(result).toEqual(EVALUATION);
  });
});

describe("generateDailyComment", () => {
  const stats = {
    totalAttempts: 3,
    evaluatedCount: 3,
    averageBand: 6.8,
    bestBand: 7,
    task1Average: 7,
    task2Average: 6.8,
    inProgressCount: 1,
  };
  const criteria = { ta: 6.8, cc: 6.8, lr: 6.8, gra: 6.8 };

  it("parses the tone tag from the AI output and strips it from the text", async () => {
    mockGenerateText.mockResolvedValue({
      text: "You are improving steadily.\nKeep practicing transitions.\nPOSITIVE",
    } as never);

    const result = await generateDailyComment(stats, criteria, {
      apiKey: "k",
      provider: "openai",
    });

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.anything() })
    );
    expect(result.tone).toBe("positive");
    expect(result.text).toBe("You are improving steadily.\nKeep practicing transitions.");
  });

  it("returns the welcome message when no essays are evaluated", async () => {
    const result = await generateDailyComment(
      { ...stats, evaluatedCount: 0 },
      criteria
    );
    expect(result.text).toContain("Submit your first essay");
  });

  it("throws when no credentials are provided (caller falls back to static)", async () => {
    await expect(generateDailyComment(stats, criteria)).rejects.toThrow();
  });
});