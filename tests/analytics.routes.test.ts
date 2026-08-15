import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { app } from "../src/app.js";
import { clearDb, startDb, stopDb, seedEssay, TEST_USER } from "./helpers.js";
import { EssayStatus } from "../src/models/essay.model.js";
import { generateDailyComment } from "../src/services/evaluation.service.js";

vi.mock("../src/configs/auth.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("../src/services/evaluation.service.js", () => ({
  evaluateEssay: vi.fn(),
  generateDailyComment: vi.fn(),
}));

import { auth } from "../src/configs/auth.js";

const getSession = vi.mocked(auth.api.getSession);
const mockDailyComment = vi.mocked(generateDailyComment);

async function authed(): Promise<void> {
  getSession.mockResolvedValue({
    user: TEST_USER,
    session: { id: "sess-1", userId: TEST_USER.id, expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
  } as never);
}

function evaluated(band: number, date: string, overrides: Record<string, unknown> = {}) {
  return seedEssay({
    status: EssayStatus.Evaluated,
    createdAt: new Date(date),
    evaluation: {
      overallBand: band,
      criteria: { ta: band, cc: band, lr: band, gra: band },
      feedback: "ok",
      tips: [],
      evaluatedAt: new Date(date),
    },
    ...overrides,
  });
}

beforeAll(async () => {
  await startDb();
});
afterAll(async () => {
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
  getSession.mockReset();
  mockDailyComment.mockReset();
});

describe("GET /api/analytics", () => {
  it("aggregates stats, criteria averages, trend, and improvements", async () => {
    await authed();
    const original = await evaluated(6.5, "2026-08-01", { type: "task2" });
    await evaluated(7.0, "2026-08-05", { type: "task1" });
    const rework = await evaluated(7.0, "2026-08-10", {
      type: "task2",
      reworkOf: original._id,
    });
    await seedEssay(); // in_progress draft

    mockDailyComment.mockResolvedValue({ text: "AI comment", tone: "positive" });

    const res = await request(app)
      .get("/api/analytics")
      .set("x-api-key", "k")
      .set("x-ai-provider", "gemini");

    expect(res.status).toBe(200);
    expect(res.body.stats.totalAttempts).toBe(4);
    expect(res.body.stats.evaluatedCount).toBe(3);
    expect(res.body.stats.inProgressCount).toBe(1);
    expect(res.body.stats.averageBand).toBe(6.8); // (6.5 + 7 + 7) / 3
    expect(res.body.stats.task1Average).toBe(7.0);
    expect(res.body.stats.task2Average).toBe(6.8);
    expect(res.body.stats.bestBand).toBe(7.0);
    expect(res.body.criteriaAverages.ta).toBe(6.8);

    expect(res.body.trend).toHaveLength(3);
    expect(res.body.trend[0].band).toBe(6.5); // oldest first

    expect(res.body.improvements).toHaveLength(1);
    expect(res.body.improvements[0].originalId.toString()).toBe(original._id.toString());
    expect(res.body.improvements[0].reworkId.toString()).toBe(rework._id.toString());
    expect(res.body.improvements[0].delta).toBe(0.5);

    expect(mockDailyComment).toHaveBeenCalledWith(
      expect.objectContaining({ averageBand: 6.8 }),
      expect.objectContaining({ ta: 6.8 }),
      { apiKey: "k", provider: "gemini" }
    );
    expect(res.body.dailyComment).toEqual({ text: "AI comment", tone: "positive" });
  });

  it("falls back to a static comment when no key is sent", async () => {
    await authed();
    await evaluated(6.5, "2026-08-01");

    const res = await request(app).get("/api/analytics");

    expect(res.status).toBe(200);
    expect(mockDailyComment).not.toHaveBeenCalled();
    expect(res.body.dailyComment.tone).toBe("push");
    expect(res.body.dailyComment.text).toContain("average band of 6.5");
  });

  it("falls back to a static welcome comment when nothing is evaluated", async () => {
    await authed();
    const res = await request(app).get("/api/analytics");
    expect(res.status).toBe(200);
    expect(res.body.stats.evaluatedCount).toBe(0);
    expect(res.body.dailyComment.text).toContain("Submit your first essay");
    expect(res.body.trend).toHaveLength(0);
  });
});