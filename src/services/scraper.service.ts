import playwright from "playwright";
const { chromium } = playwright;
import {
  Question,
  computeTextHash,
  Task1Category,
  Task2Category,
} from "../models/question.model.js";
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

// ── IELTS Question Category Detection ────────────────────────────────
// Classifies IELTS prompts into standard exam question types:
// Task 1: Bar Chart, Line Graph, Pie Chart, Table, Map, Process Diagram, Multiple Charts
// Task 2: Agree / Disagree, Discuss Both Views, Advantages & Disadvantages,
//         Causes & Solutions, Direct / Two-Part Question, Positive / Negative Development

const TASK1_CATEGORY_RULES: { category: string; patterns: RegExp[] }[] = [
  {
    category: Task1Category.MultipleCharts,
    patterns: [
      /\b(two|three|multiple|different) (charts|graphs|diagrams|tables)\b/i,
      /\b(chart and graph|graph and chart|chart and table|table and chart|pie charts? and (table|bar|line)|bar charts? and (line|pie|table)|line graphs? and (bar|pie|table)|tables? and (bar|line|pie))\b/i,
      /\bthe (charts|graphs) below show\b/i,
      /\bchart 1.*chart 2\b/is,
    ],
  },
  {
    category: Task1Category.PieChart,
    patterns: [
      /\bpie (chart|graph)s?\b/i,
      /\bthe pie chart\b/i,
      /\bproportions? of\b/i,
    ],
  },
  {
    category: Task1Category.LineGraph,
    patterns: [
      /\bline (graph|chart)s?\b/i,
      /\bthe line graph\b/i,
      /\bgraph(s)? (below )?(shows?|illustrates?|compares?|gives?|depicts?|represents?)\b/i,
      /\bthe graph below\b/i,
    ],
  },
  {
    category: Task1Category.BarChart,
    patterns: [
      /\bbar (chart|graph)s?\b/i,
      /\bthe bar chart\b/i,
      /\bhorizontal bars?\b/i,
      /\bvertical bars?\b/i,
      /\bthe chart(s)? (below )?(shows?|illustrates?|compares?|gives?|depicts?|represents?)\b/i,
      /\bchart(s)? (below )?(shows?|illustrates?|compares?|gives?|depicts?|represents?)\b/i,
    ],
  },
  {
    category: Task1Category.Table,
    patterns: [
      /\btable(s)? (below )?(shows?|illustrates?|compares?|gives?|depicts?|represents?|data)\b/i,
      /\bthe table\b/i,
      /\btable gives information\b/i,
    ],
  },
  {
    category: Task1Category.Map,
    patterns: [
      /\b(maps?|plans?|layout) (below )?(shows?|illustrates?|compares?|gives?|depicts?)\b/i,
      /\bthe map(s)? (below )?(shows?|illustrates?)\b/i,
      /\bchanges? (in|to|taking place in) (the|an?|a) (town|village|city|area|island|building|park|school|centre|center|site|harbour|harbor|airport)\b/i,
      /\bdevelopment of (the|a|an)\b/i,
      /\bproposed (changes|development|plans?)\b/i,
    ],
  },
  {
    category: Task1Category.ProcessDiagram,
    patterns: [
      /\b(process|flowchart|flow chart|diagram|life cycle|cycle|stages?) (below )?(shows?|illustrates?|compares?|gives?|depicts?|how)\b/i,
      /\bhow (\w+\s+)?is (produced|made|manufactured|recycled|generated|created|collected|processed|distributed|treated|purified)\b/i,
      /\bstages in (the|a) (process|production|manufacturing|life cycle|cycle)\b/i,
      /\bthe diagram shows\b/i,
      /\bflow chart\b/i,
    ],
  },
];

const TASK2_CATEGORY_RULES: { category: string; patterns: RegExp[] }[] = [
  {
    category: Task2Category.DiscussBothViews,
    patterns: [
      /\bdiscuss both (these |of these )?(views|sides|arguments|opinions)( and give your (own )?opinion)?\b/i,
      /\bdiscuss both views\b/i,
      /\bdiscuss both sides\b/i,
    ],
  },
  {
    category: Task2Category.AdvantagesDisadvantages,
    patterns: [
      /\b(advantages? and disadvantages?|benefits? and drawbacks?|pros and cons|advantages? or disadvantages?)\b/i,
      /\bdo (the )?advantages outweigh (the )?(disadvantages|drawbacks)\b/i,
      /\bdo (the )?benefits outweigh (the )?(disadvantages|drawbacks)\b/i,
      /\bdo the disadvantages outweigh the advantages\b/i,
      /\bwhat are the (advantages|benefits) and (disadvantages|drawbacks)\b/i,
    ],
  },
  {
    category: Task2Category.PositiveNegative,
    patterns: [
      /\b(is this|do you think this is) a (positive or negative|negative or positive) (development|trend|phenomenon|thing)\b/i,
      /\bpositive or negative development\b/i,
      /\bpositive or negative trend\b/i,
    ],
  },
  {
    category: Task2Category.CausesSolutions,
    patterns: [
      /\b(what are the causes|what causes|why is this the case|why is this happening|why has this occurred).*(what solutions|how can this be (solved|addressed|tackled)|what measures|what can be done|what steps)\b/is,
      /\b(problems? and solutions?|causes? and solutions?|reasons? and solutions?)\b/i,
      /\bwhat (problems|issues) does this (cause|lead to|create).*(what solutions|what measures|what steps|what can be done)\b/is,
      /\bwhy has this happened.*what (action|measures|steps|can be done)\b/is,
      /\bwhat are the reasons for this, and what can be done\b/i,
      /\bwhat problems arise from this and how can they be solved\b/i,
    ],
  },
  {
    category: Task2Category.AgreeDisagree,
    patterns: [
      /\bto what extent do you agree or disagree\b/i,
      /\bdo you agree or disagree\b/i,
      /\bwhat is your opinion\b/i,
      /\bhow far do you agree\b/i,
      /\bto what extent do you support or oppose\b/i,
      /\bdo you agree with this statement\b/i,
    ],
  },
  {
    category: Task2Category.DirectQuestion,
    patterns: [
      /\bwhy is this.*\?.*what.*\?/is,
      /\bdo you think.*\?.*what.*\?/is,
      /\?.*\?/s, // multiple explicit question marks in prompt
    ],
  },
];

/**
 * Classifies an IELTS question text into its standard question format category.
 * If taskType is provided, searches category rules specific to that task.
 */
export function detectCategory(
  text: string,
  taskType?: "task1" | "task2"
): string | undefined {
  if (taskType === "task1") {
    for (const rule of TASK1_CATEGORY_RULES) {
      if (rule.patterns.some((p) => p.test(text))) {
        return rule.category;
      }
    }
    return undefined;
  }

  if (taskType === "task2") {
    for (const rule of TASK2_CATEGORY_RULES) {
      if (rule.patterns.some((p) => p.test(text))) {
        return rule.category;
      }
    }
    return undefined;
  }

  // If taskType not specified, test Task 2 first (often distinct instruction), then Task 1
  for (const rule of TASK2_CATEGORY_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return rule.category;
    }
  }
  for (const rule of TASK1_CATEGORY_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return rule.category;
    }
  }

  return undefined;
}

// ── Heuristic text extraction ───────────────────────────────────────
// Placeholder: In production, replace this with llm-scraper's LLM-powered
// extraction for higher accuracy. This function does basic pattern matching
// on page text to find IELTS-style question prompts.
export function extractQuestionsFromText(
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
    // Word-boundary regexes: "paragraph" must not match "graph", "catalog" must not match "chart".
    let taskType: "task1" | "task2" | null = null;

    if (
      /\btask 1\b/i.test(trimmed) ||
      /\b(graph|chart|diagram|table|map|plan|flowchart|illustration)s?\b/i.test(trimmed) ||
      /\bsummarise the information\b/i.test(trimmed) ||
      /\bselect(ing)? and report(ing)? the main features\b/i.test(trimmed)
    ) {
      taskType = "task1";
    } else if (
      /\btask 2\b/i.test(trimmed) ||
      /\bto what extent\b/i.test(trimmed) ||
      /\b(agree or disagree|do you agree|agree with)\b/i.test(trimmed) ||
      /\bdiscuss both (views|sides|arguments)\b/i.test(trimmed) ||
      /\b(advantages? and disadvantages?|benefits? and drawbacks?|pros and cons)\b/i.test(trimmed) ||
      /\b(positive or negative|negative or positive)\b/i.test(trimmed) ||
      /\b(causes? and solutions?|problems? and solutions?|what are the causes|what causes|what solutions|how can this be solved|what can be done)\b/i.test(trimmed) ||
      /\bgive reasons for your answer\b/i.test(trimmed) ||
      /\b(write an essay|in your opinion|what is your view|what are your views)\b/i.test(trimmed) ||
      /\bwhy (is|do|are).*\?.*\?/is.test(trimmed)
    ) {
      taskType = "task2";
    }


    if (!taskType) continue;

    // Detect standard IELTS question format category.
    const category = detectCategory(trimmed, taskType);

    questions.push({ taskType, category, text: trimmed });
  }

  return questions;
}

