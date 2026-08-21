import playwright from "playwright";
const { chromium } = playwright;
import mongoose from "mongoose";
import dotenv from "dotenv";
import { Question, computeTextHash } from "../models/question.model.js";
import { detectCategory } from "../utils/scraper.utils.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/ieltsly";

// IELTS Liz Task 2 sub-pages (all topic hubs + category hubs)
const TASK2_URLS = [
  "https://ieltsliz.com/100-ielts-essay-questions/art",
  "https://ieltsliz.com/100-ielts-essay-questions/business-and-money",
  "https://ieltsliz.com/100-ielts-essay-questions/communication-and-personality",
  "https://ieltsliz.com/100-ielts-essay=questions/crime-and-punishment",
  "https://ieltsliz.com/100-ielts-essay-questions/education",
  "https://ieltsliz.com/100-ielts-essay-questions/environment",
  "https://ieltsliz.com/100-ielts-essay-questions/family",
  "https://ieltsliz.com/100-ielts-essay-questions/food-essay-titles",
  "https://ieltsliz.com/100-ielts-essay-questions/government-and-politics",
  "https://ieltsliz.com/100-ielts-essay-questions/health",
  "https://ieltsliz.com/100-ielts-essay-questions/housing-and-buildings-questions/",
  "https://ieltsliz.com/100-ielts-essay-questions/language/",
  "https://ieltsliz.com/100-ielts-essay-questions/leisure-free-time-essay-titles/",
  "https://ieltsliz.com/100-ielts-essay-questions/media-and-advertising",
  "https://ieltsliz.com/100-ielts-essay-questions/reading",
  "https://ieltsliz.com/100-ielts-essay-questions/society",
  "https://ieltsliz.com/100-ielts-essay-questions/space-exploration",
  "https://ieltsliz.com/100-ielts-essay-questions/sport-and-exercise",
  "https://ieltsliz.com/100-ielts-essay-questions/technology",
  "https://ieltsliz.com/100-ielts-essay-questions/tourism",
  "https://ieltsliz.com/100-ielts-essay-questions/transport-traffic/",
  "https://ieltsliz.com/100-ielts-essay-questions/work",
  "https://ieltsliz.com/opinion-essay-sample-questions",
  "https://ieltsliz.com/discussion-essay-sample-questions",
  "https://ieltsliz.com/ielts-solution-essay-sample-questions",
  "https://ieltsliz.com/ielts-direct-questions-sample-essay-titles",
  "https://ieltsliz.com/ielts-advantage-disadvantage-sample-essay-questions",
];

// IELTS Liz Task 1 pages
const TASK1_URLS = [
  "https://ieltsliz.com/ielts-sample-essay-task-1-questions/",
  "https://ieltsliz.com/ielts-writing-task-1-sample-answers-and-practice/",
  "https://ieltsliz.com/ielts-pie-chart/",
  "https://ieltsliz.com/ielts-line-graph/",
  "https://ieltsliz.com/ielts-bar-chart/",
  "https://ieltsliz.com/ielts-table/",
  "https://ieltsliz.com/ielts-maps/",
  "https://ieltsliz.com/ielts-process-diagram/",
];

export function cleanIeltsPrompt(text: string): string {
  return text
    .replace(/\s*\((?:Reported\s+)?\d{4}[^)]*\)/gi, "")
    .replace(/\s*\([^)]*common question[^)]*\)/gi, "")
    .replace(/\s*\([^)]*GT Test[^)]*\)/gi, "")
    .replace(/\s*\([^)]*Academic Test[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isJunkText(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (
    t.startsWith("note:") ||
    t.startsWith("note that") ||
    t.startsWith("tip:") ||
    t.startsWith("tips:") ||
    t.startsWith("remember:") ||
    t.startsWith("advice:") ||
    t.startsWith("source:") ||
    t.startsWith("how to") ||
    t.startsWith("according to") ||
    t.startsWith("regarding the") ||
    t.startsWith("overall,") ||
    t.startsWith("in conclusion,") ||
    t.startsWith("an ielts") ||
    t.startsWith("this ielts") ||
    t.startsWith("this sample answer") ||
    t.startsWith("below are some") ||
    t.startsWith("while this task") ||
    t.startsWith("the answer can") ||
    t.startsWith("well done") ||
    t.startsWith("we can see that") ||
    t.startsWith("most of you") ||
    t.startsWith("free ielts") ||
    t.startsWith("developed by") ||
    t.startsWith("ielts essay questions") ||
    t.startsWith("the ielts practice") ||
    t.startsWith("practice questions for") ||
    t.startsWith("reported essay questions are") ||
    t.startsWith("all essay questions below") ||
    t.includes("the answer can’t be") ||
    t.includes("the answer cannot be") ||
    t.includes("click here") ||
    t.includes("subscribe") ||
    t.includes("ieltsliz.com") ||
    t.includes("i like to call")
  ) {
    return true;
  }
  return false;
}

export function parseLizPrompts(paragraphs: string[]): string[] {
  const extracted: string[] = [];
  let currentStatement = "";

  const isInstruction = (t: string) =>
    /^(to what extent|discuss both|do you (agree|think)|what are the|why do you|in what way|is this|do the advantages|what could be|what other|what kinds|what do you|how can|give reasons|what is the reason)/i.test(
      t
    );

  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed || isJunkText(trimmed)) continue;

    if (isInstruction(trimmed)) {
      if (currentStatement) {
        extracted.push(`${currentStatement}\n${trimmed}`);
        currentStatement = "";
      } else {
        extracted.push(trimmed);
      }
    } else {
      if (currentStatement) {
        extracted.push(currentStatement);
      }
      currentStatement = trimmed;
    }
  }

  if (currentStatement && currentStatement.length > 50 && !isJunkText(currentStatement)) {
    extracted.push(currentStatement);
  }

  return extracted
    .map(cleanIeltsPrompt)
    .filter((q) => q.length > 40 && !isJunkText(q));
}

export async function scrapeLiz(): Promise<{
  added: number;
  duplicates: number;
  failed: number;
}> {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB for IELTS Liz Scraping.");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  let added = 0;
  let duplicates = 0;
  let failed = 0;
  const seenHashes = new Set<string>();

  console.log(`\n--- Starting IELTS Liz Task 2 Scraping (${TASK2_URLS.length} pages) ---`);
  for (const url of TASK2_URLS) {
    try {
      console.log(`Scraping Task 2: ${url}`);
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector(".entry-content, article, body", { timeout: 10000 });

      const rawParagraphs = await page.evaluate(() => {
        const content = document.querySelector(".entry-content, article");
        if (!content) return [];
        const elements = Array.from(content.querySelectorAll("p, ol li"));
        return elements.map((el) => (el as HTMLElement).innerText.trim()).filter(Boolean);
      });

      await page.close();

      const prompts = parseLizPrompts(rawParagraphs);
      console.log(`  Found ${prompts.length} prompts on ${url.split("/").pop()}`);

      for (const promptText of prompts) {
        const category = detectCategory(promptText, "task2") || "Agree / Disagree";
        const textHash = computeTextHash(promptText);

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
          taskType: "task2",
          category,
          text: promptText,
          source: "scraped",
          sourceUrl: url,
          textHash,
        });
        added++;
      }
    } catch (err) {
      console.error(`Failed to scrape ${url}:`, err);
      failed++;
    }
  }

  console.log(`\n--- Starting IELTS Liz Task 1 Scraping (${TASK1_URLS.length} pages) ---`);
  for (const url of TASK1_URLS) {
    try {
      console.log(`Scraping Task 1: ${url}`);
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector(".entry-content, article, body", { timeout: 10000 });

      const task1Items = await page.evaluate(() => {
        const content = document.querySelector(".entry-content, article");
        if (!content) return [];

        const items: { text: string; imageUrl?: string }[] = [];
        const paragraphs = Array.from(content.querySelectorAll("p, ol li"));

        // Find figures/images on page (handling WordPress lazy-load attributes)
        const getRealSrc = (el: HTMLImageElement | null): string | undefined => {
          if (!el) return undefined;
          const candidate =
            el.getAttribute("data-orig-file") ||
            el.getAttribute("data-src") ||
            el.getAttribute("data-lazy-src") ||
            el.getAttribute("data-full-url") ||
            (!el.src.startsWith("data:") ? el.src : undefined);

          if (!candidate) return undefined;
          // Strip WordPress thumbnail dimensions like -300x181.png to get full resolution
          return candidate.replace(/-\d+x\d+(\.[a-zA-Z0-9]+)$/, "$1");
        };

        const images = Array.from(content.querySelectorAll("img"))
          .map((img) => getRealSrc(img as HTMLImageElement))
          .filter((src): src is string => Boolean(src && !src.includes("logo") && !src.includes("gravatar") && !src.includes("icon")));

        for (const p of paragraphs) {
          const text = (p as HTMLElement).innerText.trim();
          if (
            text.length > 40 &&
            /^(the|below|summarise|the given|the provided)\b/i.test(text) &&
            /(chart|graph|table|diagram|map|figures?|pie|bar|line|process)/i.test(text) &&
            /(shows?|illustrates?|depicts?|compares?|gives? information|presents?|summarise)/i.test(text)
          ) {
            // Find closest image
            const directImg = p.querySelector("img") || p.parentElement?.querySelector("img");
            const imgUrl = getRealSrc(directImg as HTMLImageElement) || images[0];

            items.push({ text, imageUrl: imgUrl });
          }
        }
        return items;
      });

      await page.close();
      console.log(`  Found ${task1Items.length} Task 1 items on ${url.split("/").pop()}`);

      for (const item of task1Items) {
        if (isJunkText(item.text)) continue;
        const cleanText = cleanIeltsPrompt(item.text);
        const category = detectCategory(cleanText, "task1") || "Bar Chart";
        const textHash = computeTextHash(cleanText);

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
          taskType: "task1",
          category,
          text: cleanText,
          imageUrl: item.imageUrl,
          source: "scraped",
          sourceUrl: url,
          textHash,
        });
        added++;
      }
    } catch (err) {
      console.error(`Failed to scrape ${url}:`, err);
      failed++;
    }
  }

  await browser.close();
  await mongoose.disconnect();

  console.log(`\n========================================`);
  console.log(`IELTS Liz Scraping Summary:`);
  console.log(`  Added: ${added}`);
  console.log(`  Duplicates Skipped: ${duplicates}`);
  console.log(`  Failed Pages: ${failed}`);
  console.log(`========================================\n`);

  return { added, duplicates, failed };
}

// Run standalone when executed via node / tsx
if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeLiz()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Scraper encountered fatal error:", err);
      process.exit(1);
    });
}
