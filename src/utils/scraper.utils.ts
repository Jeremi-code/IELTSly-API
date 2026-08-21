import { Task1Category, Task2Category } from "../models/question.model.js";
import type { ExtractedQuestion } from "../zod/question.schema.js";

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
      /\?.*\?/s,
    ],
  },
];

/**
 * Classifies an IELTS question text into its standard question format category.
 */
export function detectCategory(
  text: string,
  taskType?: "task1" | "task2",
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

/**
 * Parses raw scraped page text to find IELTS-style question prompts.
 */
export function extractQuestionsFromText(
  text: string,
  _sourceUrl: string,
): ExtractedQuestion[] {
  const questions: ExtractedQuestion[] = [];
  const blocks = text.split(/\n{2,}/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (trimmed.length < 30) continue;

    let taskType: "task1" | "task2" | null = null;

    if (
      /\btask 1\b/i.test(trimmed) ||
      /\b(graph|chart|diagram|table|map|plan|flowchart|illustration)s?\b/i.test(
        trimmed,
      ) ||
      /\bsummarise the information\b/i.test(trimmed) ||
      /\bselect(ing)? and report(ing)? the main features\b/i.test(trimmed)
    ) {
      taskType = "task1";
    } else if (
      /\btask 2\b/i.test(trimmed) ||
      /\bto what extent\b/i.test(trimmed) ||
      /\b(agree or disagree|do you agree|agree with)\b/i.test(trimmed) ||
      /\bdiscuss both (views|sides|arguments)\b/i.test(trimmed) ||
      /\b(advantages? and disadvantages?|benefits? and drawbacks?|pros and cons)\b/i.test(
        trimmed,
      ) ||
      /\b(positive or negative|negative or positive)\b/i.test(trimmed) ||
      /\b(causes? and solutions?|problems? and solutions?|what are the causes|what causes|what solutions|how can this be solved|what can be done)\b/i.test(
        trimmed,
      ) ||
      /\bgive reasons for your answer\b/i.test(trimmed) ||
      /\b(write an essay|in your opinion|what is your view|what are your views)\b/i.test(
        trimmed,
      ) ||
      /\bwhy (is|do|are).*\?.*\?/is.test(trimmed)
    ) {
      taskType = "task2";
    }

    if (!taskType) continue;

    const category = detectCategory(trimmed, taskType);
    questions.push({ taskType, category, text: trimmed });
  }

  return questions;
}
