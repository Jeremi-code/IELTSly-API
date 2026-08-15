import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { extractQuestionsFromText, scrapeQuestions } from "../src/services/scraper.service.js";
import { clearDb, startDb, stopDb } from "./helpers.js";
import { Question } from "../src/models/question.model.js";

const PAGE_A = `Recent IELTS writing questions

Task 2
Do you agree or disagree that social media has a negative impact on young people?
Some believe this strongly while others disagree.

Task 1
The line graph below shows population trends in three major Asian cities between 1990 and 2020.

Another unrelated paragraph that mentions nothing indicative of a task type whatsoever.

Task 2
Discuss both views on whether remote work should become the default arrangement.
`;

const PAGE_B = `More questions

The chart below shows energy consumption patterns in five European countries.
`;

describe("extractQuestionsFromText", () => {
  it("detects task2 questions and classifies standard essay categories", () => {
    const out = extractQuestionsFromText(PAGE_A, "https://example.com");
    const task2 = out.filter((q) => q.taskType === "task2");
    expect(task2.length).toBe(2);
    expect(task2[0].text).toContain("social media");
    expect(task2[0].category).toBe("Agree / Disagree");
    expect(task2[1].category).toBe("Discuss Both Views");
  });

  it("detects task1 questions and classifies visual format categories", () => {
    const out = extractQuestionsFromText(PAGE_A, "https://example.com");
    const task1 = out.find((q) => q.taskType === "task1" && q.text.includes("population trends"));
    expect(task1).toBeDefined();
    expect(task1?.category).toBe("Line Graph");
  });

  it("classifies diverse Task 1 categories (Pie Chart, Table, Map, Process Diagram, Multiple Charts)", () => {
    const text = `
The pie chart below shows the proportion of spending across five categories.

The table below gives information on mobile phone subscriptions between 2000 and 2010.

The maps below show changes to the town of Harborne between 1936 and 2007.

The diagram below illustrates how electricity is generated from waves.

The pie chart and table below show the energy production and consumption in Australia.
`;
    const extracted = extractQuestionsFromText(text, "https://example.com");
    expect(extracted.map((q) => q.category)).toEqual([
      "Pie Chart",
      "Table",
      "Map",
      "Process Diagram",
      "Multiple Charts",
    ]);
  });

  it("classifies diverse Task 2 categories (Advantages & Disadvantages, Causes & Solutions, Positive / Negative, Direct Question)", () => {
    const text = `
What are the advantages and disadvantages of online shopping compared to physical stores?

Traffic congestion is a major issue in modern cities. What are the causes of this problem, and what solutions can be proposed?

In many countries, fewer people are getting married. Is this a positive or negative development?

Many people choose to live alone today. Why is this so? Is this beneficial for society?
`;
    const extracted = extractQuestionsFromText(text, "https://example.com");
    expect(extracted.map((q) => q.category)).toEqual([
      "Advantages & Disadvantages",
      "Causes & Solutions",
      "Positive / Negative Development",
      "Direct / Two-Part Question",
    ]);
  });

  it("ignores blocks without a detectable task type", () => {
    const out = extractQuestionsFromText(PAGE_A, "https://example.com");
    expect(out.every((q) => !q.text.includes("unrelated paragraph"))).toBe(true);
  });

  it("ignores blocks shorter than 30 characters", () => {
    const out = extractQuestionsFromText("Task 2\nToo short.", "https://example.com");
    expect(out).toHaveLength(0);
  });
});


vi.mock("playwright", () => ({
  default: {
    chromium: {
      launch: vi.fn(),
    },
  },
}));

describe("scrapeQuestions (integration)", () => {
  it("inserts extracted questions and deduplicates across runs", async () => {
    const { chromium } = (await import("playwright")).default as {
      chromium: { launch: ReturnType<typeof vi.fn> };
    };

    let pageCount = 0;
    chromium.launch.mockImplementation(async () => ({
      newPage: async () => {
        pageCount += 1;
        const index = pageCount;
        return {
          goto: async () => undefined,
          evaluate: async () => (index === 1 ? PAGE_A : PAGE_B),
          close: async () => undefined,
        };
      },
      close: async () => undefined,
    }));

    vi.stubEnv("SCRAPE_SOURCES", "https://a.example/page-a,https://b.example/page-b");

    const first = await scrapeQuestions();
    expect(first.added).toBe(4); // 3 from page A + 1 from page B
    expect(first.duplicates).toBe(0);
    expect(await Question.countDocuments()).toBe(4);

    pageCount = 0;
    const second = await scrapeQuestions();
    expect(second.added).toBe(0);
    expect(second.duplicates).toBe(4);
    expect(await Question.countDocuments()).toBe(4);

    vi.unstubAllEnvs();
  });

  it("counts a failed page and continues the batch", async () => {
    const { chromium } = (await import("playwright")).default as {
      chromium: { launch: ReturnType<typeof vi.fn> };
    };

    let pageCount = 0;
    chromium.launch.mockImplementation(async () => ({
      newPage: async () => {
        pageCount += 1;
        const index = pageCount;
        return {
          goto: async () => {
            if (index === 1) throw new Error("timeout");
          },
          evaluate: async () => PAGE_A,
          close: async () => undefined,
        };
      },
      close: async () => undefined,
    }));

    vi.stubEnv("SCRAPE_SOURCES", "https://a.example/bad,https://b.example/good");

    const result = await scrapeQuestions();
    expect(result.failed).toBe(1);
    expect(result.added).toBe(3);
    expect(await Question.countDocuments()).toBe(3);

    vi.unstubAllEnvs();
  });
});

beforeAll(async () => {
  await startDb();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
});