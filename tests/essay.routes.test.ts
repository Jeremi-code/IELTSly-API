import request from "supertest";
import mongoose from "mongoose";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { app } from "../src/app.js";
import { clearDb, startDb, stopDb, seedEssay, TEST_USER, OTHER_USER } from "./helpers.js";
import { Essay, EssayStatus } from "../src/models/essay.model.js";
import { Question } from "../src/models/question.model.js";
import { evaluateEssay } from "../src/services/evaluation.service.js";

vi.mock("../src/configs/auth.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("../src/services/evaluation.service.js", () => ({
  evaluateEssay: vi.fn(),
  generateDailyComment: vi.fn(),
}));

import { auth } from "../src/configs/auth.js";

const getSession = vi.mocked(auth.api.getSession);
const mockEvaluate = vi.mocked(evaluateEssay);

const EVALUATION = {
  overallBand: 7.5,
  criteria: { ta: 7.5, cc: 7.5, lr: 7.0, gra: 8.0 },
  feedback: "Strong vocabulary and structure.",
  tips: ["Add more supporting details."],
};

async function authedAs(user: typeof TEST_USER): Promise<void> {
  getSession.mockResolvedValue({
    user,
    session: { id: "sess-1", userId: user.id, expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
  } as never);
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
  mockEvaluate.mockReset();
});

describe("GET /api/essays", () => {
  it("returns 401 without a valid session", async () => {
    getSession.mockResolvedValue(null as never);
    const res = await request(app).get("/api/essays");
    expect(res.status).toBe(401);
  });

  it("lists only the current user's essays, newest first", async () => {
    await authedAs(TEST_USER);
    await seedEssay({ createdAt: new Date("2026-08-01") });
    await seedEssay({ createdAt: new Date("2026-08-10") });
    await seedEssay({ user: OTHER_USER.id, createdAt: new Date("2026-08-09") });

    const res = await request(app).get("/api/essays");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(new Date(res.body.essays[0].createdAt) > new Date(res.body.essays[1].createdAt)).toBe(true);
  });

  it("filters by status and paginates", async () => {
    await authedAs(TEST_USER);
    await seedEssay({ status: EssayStatus.Evaluated, evaluation: { overallBand: 6, criteria: { ta: 6, cc: 6, lr: 6, gra: 6 }, feedback: "ok", tips: [], evaluatedAt: new Date() } });
    await seedEssay();

    const res = await request(app)
      .get("/api/essays")
      .query({ status: EssayStatus.Evaluated, page: 1, limit: 1 });
    expect(res.body.total).toBe(1);
    expect(res.body.essays).toHaveLength(1);
  });
});

describe("POST /api/essays", () => {
  it("creates an in_progress essay and increments question timesUsed", async () => {
    await authedAs(TEST_USER);
    const q = await Question.create({
      taskType: "task2",
      text: "Do you agree that social media has a negative impact on young people?",
      source: "official",
      textHash: "hash-1",
    });

    const res = await request(app).post("/api/essays").send({
      type: "task2",
      mode: "practice",
      questionId: q._id.toString(),
      response: "Modern life without social media is hard to imagine.",
      durationSec: 300,
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("in_progress");
    expect(res.body.question.text).toBe(q.text);
    expect(res.body.wordCount).toBe(9);

    const updated = await Question.findById(q._id);
    expect(updated!.timesUsed).toBe(1);
  });

  it("accepts a custom question when no questionId is given", async () => {
    await authedAs(TEST_USER);
    const res = await request(app).post("/api/essays").send({
      type: "task1",
      mode: "exam",
      question: { text: "The chart shows energy use in five countries.", category: "climate" },
      response: "The chart clearly shows a rising trend.",
      durationSec: 400,
    });
    expect(res.status).toBe(201);
    expect(res.body.question.text).toContain("chart");
  });

  it("rejects when question text is missing", async () => {
    await authedAs(TEST_USER);
    const res = await request(app).post("/api/essays").send({
      type: "task2",
      mode: "practice",
      response: "No question here.",
      durationSec: 100,
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when questionId does not exist in the bank", async () => {
    await authedAs(TEST_USER);
    const res = await request(app).post("/api/essays").send({
      type: "task2",
      mode: "practice",
      questionId: new mongoose.Types.ObjectId().toString(),
      response: "Some response.",
      durationSec: 100,
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/essays/:id", () => {
  it("does not leak another user's essay", async () => {
    await authedAs(TEST_USER);
    const other = await seedEssay({ user: OTHER_USER.id });
    const res = await request(app).get(`/api/essays/${other._id}`);
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/essays/:id", () => {
  it("updates drafts and recomputes word count", async () => {
    await authedAs(TEST_USER);
    const essay = await seedEssay();
    const res = await request(app).put(`/api/essays/${essay._id}`).send({
      response: "A brand new sentence with much more detail than before.",
    });
    expect(res.status).toBe(200);
    expect(res.body.wordCount).toBe(10);
  });

  it("rejects updates to evaluated essays with 409", async () => {
    await authedAs(TEST_USER);
    const essay = await seedEssay({
      status: EssayStatus.Evaluated,
      evaluation: { overallBand: 6, criteria: { ta: 6, cc: 6, lr: 6, gra: 6 }, feedback: "ok", tips: [], evaluatedAt: new Date() },
    });
    const res = await request(app).put(`/api/essays/${essay._id}`).send({ response: "Trying to rewrite." });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/essays/:id/evaluate", () => {
  it("returns 400 when no API key or provider is sent", async () => {
    await authedAs(TEST_USER);
    const essay = await seedEssay({ status: EssayStatus.Submitted });
    const res = await request(app).post(`/api/essays/${essay._id}/evaluate`);
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown provider", async () => {
    await authedAs(TEST_USER);
    const essay = await seedEssay({ status: EssayStatus.Submitted });
    const res = await request(app)
      .post(`/api/essays/${essay._id}/evaluate`)
      .set("x-api-key", "k")
      .set("x-ai-provider", "anthropic");
    expect(res.status).toBe(400);
  });

  it("evaluates successfully and persists the evaluation", async () => {
    await authedAs(TEST_USER);
    mockEvaluate.mockResolvedValue(EVALUATION);
    const essay = await seedEssay({ status: EssayStatus.Submitted });

    const res = await request(app)
      .post(`/api/essays/${essay._id}/evaluate`)
      .set("x-api-key", "test-key")
      .set("x-ai-provider", "gemini");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("evaluated");
    expect(res.body.evaluation.overallBand).toBe(7.5);
    expect(mockEvaluate).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "test-key", provider: "gemini" })
    );
  });

  it("returns 502 and keeps essay status on AI failure", async () => {
    await authedAs(TEST_USER);
    mockEvaluate.mockRejectedValue(new Error("upstream failed"));
    const essay = await seedEssay({ status: EssayStatus.Submitted });

    const res = await request(app)
      .post(`/api/essays/${essay._id}/evaluate`)
      .set("x-api-key", "k")
      .set("x-ai-provider", "openai");

    expect(res.status).toBe(502);
    const reloaded = await Essay.findById(essay._id);
    expect(reloaded!.status).toBe("submitted");
    expect(reloaded!.evaluation).toBeUndefined();
  });

  it("rejects re-evaluating an already evaluated essay with 409", async () => {
    await authedAs(TEST_USER);
    const essay = await seedEssay({
      status: EssayStatus.Evaluated,
      evaluation: { overallBand: 6, criteria: { ta: 6, cc: 6, lr: 6, gra: 6 }, feedback: "ok", tips: [], evaluatedAt: new Date() },
    });
    const res = await request(app)
      .post(`/api/essays/${essay._id}/evaluate`)
      .set("x-api-key", "k")
      .set("x-ai-provider", "gemini");
    expect(res.status).toBe(409);
  });
});

describe("POST /api/essays/:id/rework", () => {
  it("creates a new essay linked to the original without mutating it", async () => {
    await authedAs(TEST_USER);
    const q = await Question.create({
      taskType: "task2",
      text: "Do you agree that social media has a negative impact on young people?",
      source: "scraped",
      textHash: "hash-rework",
    });
    const original = await seedEssay({
      questionId: q._id,
      question: { text: q.text, category: "technology" },
      status: EssayStatus.Evaluated,
      evaluation: { overallBand: 6.5, criteria: { ta: 6.5, cc: 6.5, lr: 6.5, gra: 6.5 }, feedback: "ok", tips: [], evaluatedAt: new Date() },
    });

    const res = await request(app)
      .post(`/api/essays/${original._id}/rework`)
      .send({ response: "A much better revised essay with stronger arguments and examples.", durationSec: 700 });

    expect(res.status).toBe(201);
    expect(res.body.reworkOf?.toString()).toBe(original._id.toString());
    expect(res.body.status).toBe("in_progress");
    expect(res.body.evaluation).toBeUndefined();
    expect(res.body.question.text).toBe(q.text);

    const untouched = await Essay.findById(original._id);
    expect(untouched!.status).toBe("evaluated");
    expect(untouched!.evaluation!.overallBand).toBe(6.5);
    expect((await Question.findById(q._id))!.timesUsed).toBe(1);
  });

  it("returns 404 when the source essay belongs to another user", async () => {
    await authedAs(TEST_USER);
    const other = await seedEssay({ user: OTHER_USER.id });
    const res = await request(app)
      .post(`/api/essays/${other._id}/rework`)
      .send({ response: "x", durationSec: 1 });
    expect(res.status).toBe(404);
  });
});