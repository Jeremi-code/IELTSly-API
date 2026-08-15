import request from "supertest";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { app } from "../src/app.js";
import { clearDb, startDb, stopDb, TEST_USER } from "./helpers.js";
import { Question } from "../src/models/question.model.js";

vi.mock("../src/configs/auth.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

import { auth } from "../src/configs/auth.js";

const getSession = vi.mocked(auth.api.getSession);

async function authed(): Promise<void> {
  getSession.mockResolvedValue({
    user: TEST_USER,
    session: {
      id: "sess-1",
      userId: TEST_USER.id,
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
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
});

describe("POST /api/questions", () => {
  it("creates a question with 201", async () => {
    await authed();
    const res = await request(app).post("/api/questions").send({
      taskType: "task2",
      text: "Do you agree that social media harms young people?",
      source: "official",
    });
    expect(res.status).toBe(201);
    expect(res.body.timesUsed).toBe(0);
    expect(res.body.textHash).toBeTruthy();
  });

  it("deduplicates identical text (case/whitespace-insensitive) returning the existing doc with 200", async () => {
    await authed();
    const first = await request(app).post("/api/questions").send({
      taskType: "task2",
      text: "  Do You AGREE that social media harms young people?  ",
      source: "official",
    });
    const second = await request(app).post("/api/questions").send({
      taskType: "task2",
      text: "do you agree that social media harms young people?",
      source: "scraped",
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body._id).toBe(first.body._id);
    expect(await Question.countDocuments()).toBe(1);
  });

  it("returns 400 when required fields are missing", async () => {
    await authed();
    const res = await request(app)
      .post("/api/questions")
      .send({ text: "Only text." });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/questions", () => {
  it("lists with filters and pagination shape", async () => {
    await authed();
    await Question.create([
      {
        taskType: "task1",
        text: "The line graph shows population trends in three cities.",
        category: "Line Graph",
        source: "official",
        textHash: "h1",
      },
      {
        taskType: "task2",
        text: "Discuss both views on remote work.",
        category: "Discuss Both Views",
        source: "scraped",
        textHash: "h2",
      },
    ]);

    const res = await request(app)
      .get("/api/questions")
      .query({ taskType: "task2" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.questions[0].taskType).toBe("task2");
    expect(res.body.questions[0].category).toBe("Discuss Both Views");
  });

  it("filters with regex search", async () => {
    await authed();
    await Question.create([
      {
        taskType: "task1",
        text: "The bar chart shows renewable energy usage.",
        category: "Bar Chart",
        source: "official",
        textHash: "h3",
      },
      {
        taskType: "task2",
        text: "Some people think space exploration is a waste of money.",
        category: "Agree / Disagree",
        source: "scraped",
        textHash: "h4",
      },
    ]);

    const res = await request(app)
      .get("/api/questions")
      .query({ search: "renewable" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.questions[0].category).toBe("Bar Chart");
  });

  it("gets distinct categories for taskType", async () => {
    await authed();
    await Question.create([
      {
        taskType: "task1",
        text: "Pie Chart A",
        category: "Pie Chart",
        source: "official",
        textHash: "h5",
      },
      {
        taskType: "task2",
        text: "Essay B",
        category: "Agree / Disagree",
        source: "official",
        textHash: "h6",
      },
    ]);

    const res = await request(app)
      .get("/api/questions/categories")
      .query({ taskType: "task1" });
    expect(res.status).toBe(200);
    expect(res.body).toContain("Pie Chart");
    expect(res.body).not.toContain("Agree / Disagree");
  });

  it("gets a random question", async () => {
    await authed();
    await Question.create([
      {
        taskType: "task2",
        text: "Prompt random test",
        category: "Agree / Disagree",
        source: "official",
        textHash: "h7",
      },
    ]);

    const res = await request(app)
      .get("/api/questions/random")
      .query({ taskType: "task2" });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("Prompt random test");
  });

  it("returns 404 for a missing id", async () => {
    await authed();
    const res = await request(app).get(
      "/api/questions/000000000000000000000000",
    );
    expect(res.status).toBe(404);
  });
});
