import playwright from "playwright";
const { chromium } = playwright;
import { Question, computeTextHash } from "../models/question.model.js";
import {
  extractedQuestionSchema,
  type ExtractedQuestion,
} from "../zod/question.schema.js";

// ── Configuration ───────────────────────────────────────────────────

const DEFAULT_SOURCES = [
  "https://ieltsonlinetests.com/collection/ielts-writing-recent-actual-tests",
];

function getSourceUrls(): string[] {
  const envSources = process.env.SCRAPE_SOURCES;
  if (envSources) {
    return envSources.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return DEFAULT_SOURCES;
}

// ── Main scraper function ───────────────────────────────────────────
export async function scrapeQuestions(): Promise<{
  added: number;
  duplicates: number;
  failed: number;
}> {
  const sourceUrls = getSourceUrls();
  let added = 0;
  let duplicates = 0;
  let failed = 0;

  // Track hashes within this batch run for intra-batch dedup.
  const seenHashes = new Set<string>();

  let browser;
  try {
    browser = await chromium.launch({ headless: true });

    for (const url of sourceUrls) {
      try {
        const page = await browser.newPage();
        await page.goto(url, { timeout: 30_000, waitUntil: "domcontentloaded" });

        // Extract page text content for LLM processing.
        const pageContent = await page.evaluate(() => document.body.innerText);
        await page.close();

        // For now, use a simple heuristic extraction approach.
        // In production, wire up llm-scraper with an LLM instance for
        // structured extraction. This placeholder parses visible text blocks
        // that look like IELTS prompts.
        const extracted = extractQuestionsFromText(pageContent, url);

        for (const q of extracted) {
          // Validate: drop junk (text < 30 chars or missing taskType).
          if (!q.text || q.text.length < 30 || !q.taskType) continue;

          const textHash = computeTextHash(q.text);

          // Intra-batch dedup.
          if (seenHashes.has(textHash)) {
            duplicates++;
            continue;
          }
          seenHashes.add(textHash);

          // DB dedup.
          const existing = await Question.findOne({ textHash });
          if (existing) {
            duplicates++;
            continue;
          }

          await Question.create({
            taskType: q.taskType,
            category: q.category,
            text: q.text,
            imageUrl: q.imageUrl,
            source: "scraped",
            sourceUrl: url,
            textHash,
          });
          added++;
        }
      } catch (pageErr) {
        console.error(`Scraper: failed to process ${url}:`, pageErr);
        failed++;
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  return { added, duplicates, failed };
}

// ── Heuristic text extraction ───────────────────────────────────────
// Placeholder: In production, replace this with llm-scraper's LLM-powered
// extraction for higher accuracy. This function does basic pattern matching
// on page text to find IELTS-style question prompts.
function extractQuestionsFromText(
  text: string,
  _sourceUrl: string
): ExtractedQuestion[] {
  const questions: ExtractedQuestion[] = [];
  // Split by common IELTS question patterns.
  const blocks = text.split(/\n{2,}/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (trimmed.length < 30) continue;

    // Detect task type from content heuristics.
    const lowerBlock = trimmed.toLowerCase();
    let taskType: "task1" | "task2" | null = null;

    if (
      lowerBlock.includes("task 1") ||
      lowerBlock.includes("graph") ||
      lowerBlock.includes("chart") ||
      lowerBlock.includes("diagram") ||
      lowerBlock.includes("table shows") ||
      lowerBlock.includes("map")
    ) {
      taskType = "task1";
    } else if (
      lowerBlock.includes("task 2") ||
      lowerBlock.includes("to what extent") ||
      lowerBlock.includes("do you agree") ||
      lowerBlock.includes("discuss both views") ||
      lowerBlock.includes("advantages and disadvantages")
    ) {
      taskType = "task2";
    }

    if (!taskType) continue;

    questions.push({ taskType, text: trimmed });
  }

  return questions;
}
