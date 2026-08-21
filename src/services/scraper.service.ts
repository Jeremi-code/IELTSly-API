import playwright from "playwright";
const { chromium } = playwright;
import { Question } from "../models/question.model.js";
import { computeTextHash } from "../utils/text.utils.js";
import { extractQuestionsFromText } from "../utils/scraper.utils.js";

const DEFAULT_SOURCES = [
  "https://ieltsonlinetests.com/collection/ielts-writing-recent-actual-tests",
];

/**
 * Returns source URLs configured for web scraping.
 * @returns {string[]} List of target source URLs
 */
function getSourceUrls(): string[] {
  const envSources = process.env.SCRAPE_SOURCES;
  if (envSources) {
    return envSources
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return DEFAULT_SOURCES;
}

/**
 * Scrapes target web pages for IELTS writing questions and adds unique entries to the question bank.
 * @returns {Promise<{ added: number; duplicates: number; failed: number }>} Scrape results summary
 */
export async function scrapeQuestions(): Promise<{
  added: number;
  duplicates: number;
  failed: number;
}> {
  const sourceUrls = getSourceUrls();
  let added = 0;
  let duplicates = 0;
  let failed = 0;

  const seenHashes = new Set<string>();
  let browser;

  try {
    browser = await chromium.launch({ headless: true });

    for (const url of sourceUrls) {
      try {
        const page = await browser.newPage();
        await page.goto(url, {
          timeout: 30_000,
          waitUntil: "domcontentloaded",
        });

        const pageContent = await page.evaluate(() => document.body.innerText);
        await page.close();

        const extracted = extractQuestionsFromText(pageContent, url);

        for (const q of extracted) {
          if (!q.text || q.text.length < 30 || !q.taskType) continue;

          const textHash = computeTextHash(q.text);

          if (seenHashes.has(textHash)) {
            duplicates++;
            continue;
          }
          seenHashes.add(textHash);

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
