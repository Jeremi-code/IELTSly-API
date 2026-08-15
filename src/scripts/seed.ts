import mongoose from "mongoose";
import dotenv from "dotenv";
import { Essay, EssayMode, EssayStatus, EssayType } from "../models/essay.model.js";
import { Question, computeTextHash } from "../models/question.model.js";

dotenv.config();

const USER_EMAIL = process.env.SEED_USER_EMAIL || "jeremicode13@gmail.com";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/ieltsly";

const QUESTIONS = [
  // Task 2 Essays
  {
    taskType: "task2",
    category: "Agree / Disagree",
    text: "Some people believe that social media has a negative impact on young people's development and communication skills. To what extent do you agree or disagree?",
    source: "official",
  },
  {
    taskType: "task2",
    category: "Discuss Both Views",
    text: "Climate change is one of the biggest threats facing humanity. Some argue that individual responsibility is more important than global policy. Discuss both views and give your own opinion.",
    source: "official",
  },
  {
    taskType: "task2",
    category: "Advantages & Disadvantages",
    text: "In many countries, remote work has become the default arrangement. What are the advantages and disadvantages of this trend?",
    source: "scraped",
  },
  {
    taskType: "task2",
    category: "Causes & Solutions",
    text: "In many modern cities, traffic congestion has become a severe problem. What are the primary causes of this issue, and what solutions can governments implement?",
    source: "official",
  },
  {
    taskType: "task2",
    category: "Positive / Negative Development",
    text: "In many parts of the world, shopping online is replacing visiting physical stores. Is this a positive or negative development?",
    source: "official",
  },
  {
    taskType: "task2",
    category: "Direct / Two-Part Question",
    text: "Many people choose to live alone today. Why is this the case? Is this trend beneficial for society?",
    source: "scraped",
  },

  // Task 1 Visual Reports
  {
    taskType: "task1",
    category: "Line Graph",
    text: "The line graph below shows population trends in three major Asian cities between 1990 and 2020. Summarise the information by selecting and reporting the main features.",
    source: "official",
  },
  {
    taskType: "task1",
    category: "Bar Chart",
    text: "The bar chart shows energy consumption patterns in five European countries in 2025. Summarise the information by selecting and reporting the main features.",
    source: "scraped",
  },
  {
    taskType: "task1",
    category: "Pie Chart",
    text: "The pie charts below compare the proportions of household spending in five distinct categories in the UK between 1980 and 2010. Summarise the information by selecting and reporting the main features.",
    source: "official",
  },
  {
    taskType: "task1",
    category: "Table",
    text: "The table below gives information about the percentage of mobile phone owners who used various features on their phones in 2006, 2008, and 2010. Summarise the information by selecting and reporting the main features.",
    source: "official",
  },
  {
    taskType: "task1",
    category: "Map",
    text: "The maps below show the development of the village of Ryefield between 1995 and the present day. Summarise the information by selecting and reporting the main features.",
    source: "official",
  },
  {
    taskType: "task1",
    category: "Process Diagram",
    text: "The diagram below illustrates the stages in the recycling process of plastic bottles. Summarise the information by selecting and reporting the main features.",
    source: "official",
  },
  {
    taskType: "task1",
    category: "Multiple Charts",
    text: "The pie chart and table below show the distribution of electricity generation by source and total output in Australia between 2000 and 2020. Summarise the information by selecting and reporting the main features.",
    source: "scraped",
  },
];


const daysAgo = (days: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

async function run(): Promise<void> {
  await mongoose.connect(MONGO_URI);

  const user = (await mongoose.connection.collection("user").findOne({ email: USER_EMAIL })) ||
    (await mongoose.connection.collection("user").findOne({}));

  if (!user) {
    console.error("No user found in DB. Sign up first, then run the seed.");
    process.exit(1);
  }
  console.log(`Seeding for user: ${user.email} (${user._id})`);

  const userIdStr = user._id.toString();
  const existing = await Essay.countDocuments({ user: userIdStr });
  if (existing > 0) {
    console.log(`User already has ${existing} essays — skipping. Delete them to re-seed.`);
    await mongoose.disconnect();
    return;
  }

  const questionDocs = [];
  for (const q of QUESTIONS) {
    const textHash = computeTextHash(q.text);
    let doc = await Question.findOne({ textHash });
    if (!doc) {
      doc = await Question.create({ ...q, textHash });
    }
    questionDocs.push(doc);
  }
  console.log(`Questions ready: ${questionDocs.length}`);

  const socialMedia = questionDocs.find((q) => q.text.includes("social media"))!;
  const climate = questionDocs.find((q) => q.text.includes("Climate change"))!;
  const remoteWork = questionDocs.find((q) => q.text.includes("remote work"))!;
  const lineGraph = questionDocs.find((q) => q.text.includes("line graph"))!;
  const barChart = questionDocs.find((q) => q.text.includes("bar chart"))!;

  const evaluations = [
    { overallBand: 6.5, criteria: { ta: 6.5, cc: 6.0, lr: 7.0, gra: 6.5 }, feedback: "Good arguments, but Coherence and Cohesion fell short due to weak transitions between paragraphs. Your vocabulary range is solid — keep it up.", tips: ["Use more linking words between paragraphs", "Develop each main idea with a clear topic sentence"], evaluatedAt: daysAgo(10) },
    { overallBand: 7.0, criteria: { ta: 7.0, cc: 7.0, lr: 7.0, gra: 7.0 }, feedback: "Data trends were accurately summarized with a clear overview. Lexical resource was precise and varied.", tips: ["Compare figures explicitly using fractions", "Add one more specific data point per paragraph"], evaluatedAt: daysAgo(9) },
    { overallBand: 6.0, criteria: { ta: 6.0, cc: 6.0, lr: 6.0, gra: 6.0 }, feedback: "The position is clear but arguments lack specific supporting examples. Watch out for repeated vocabulary.", tips: ["Provide 2-3 specific supporting details per argument", "Vary sentence openings"], evaluatedAt: daysAgo(7) },
    { overallBand: 7.0, criteria: { ta: 7.0, cc: 7.0, lr: 7.0, gra: 7.0 }, feedback: "Well-structured response with balanced coverage of both views. Cohesive devices used naturally.", tips: ["Strengthen the conclusion with a clear recommendation", "Use more advanced collocations"], evaluatedAt: daysAgo(5) },
    { overallBand: 7.5, criteria: { ta: 7.5, cc: 7.5, lr: 7.0, gra: 8.0 }, feedback: "Strong vocabulary usage and structural layout. Minor errors in punctuation only. Excellent task achievement.", tips: ["Watch comma placement in complex sentences", "Keep up the precise data description"], evaluatedAt: daysAgo(3) },
    { overallBand: 7.0, criteria: { ta: 7.0, cc: 7.0, lr: 7.0, gra: 7.0 }, feedback: "Clear improvement over the original draft — arguments are now backed by concrete examples and the flow is much smoother.", tips: ["Add a counter-argument paragraph for a higher TA score", "Expand the conclusion"], evaluatedAt: daysAgo(1) },
  ];

  const essays = [
    { type: EssayType.Task2, mode: EssayMode.Practice, questionId: socialMedia._id, question: { text: socialMedia.text, category: socialMedia.category }, response: "Social media has transformed the way young people communicate...", wordCount: 284, durationSec: 2280, status: EssayStatus.Evaluated, evaluation: evaluations[0], createdAt: daysAgo(10) },
    { type: EssayType.Task1, mode: EssayMode.Practice, questionId: lineGraph._id, question: { text: lineGraph.text, category: lineGraph.category }, response: "The line graph illustrates population trends in three major Asian cities...", wordCount: 172, durationSec: 1080, status: EssayStatus.Evaluated, evaluation: evaluations[1], createdAt: daysAgo(9) },
    { type: EssayType.Task2, mode: EssayMode.Exam, questionId: climate._id, question: { text: climate.text, category: climate.category }, response: "Climate change represents one of the most pressing challenges of our time...", wordCount: 260, durationSec: 2400, status: EssayStatus.Evaluated, evaluation: evaluations[2], createdAt: daysAgo(7) },
    { type: EssayType.Task2, mode: EssayMode.Practice, questionId: remoteWork._id, question: { text: remoteWork.text, category: remoteWork.category }, response: "The shift towards remote work has accelerated dramatically in recent years...", wordCount: 291, durationSec: 2100, status: EssayStatus.Evaluated, evaluation: evaluations[3], createdAt: daysAgo(5) },
    { type: EssayType.Task1, mode: EssayMode.Exam, questionId: barChart._id, question: { text: barChart.text, category: barChart.category }, response: "The bar chart compares energy consumption across five European countries...", wordCount: 168, durationSec: 1200, status: EssayStatus.Evaluated, evaluation: evaluations[4], createdAt: daysAgo(3) },
    { type: EssayType.Task2, mode: EssayMode.Practice, questionId: socialMedia._id, question: { text: socialMedia.text, category: socialMedia.category }, response: "In recent years, social media platforms have become central to young people's daily lives...", wordCount: 298, durationSec: 2350, status: EssayStatus.Evaluated, evaluation: evaluations[5], createdAt: daysAgo(1) },
    { type: EssayType.Task2, mode: EssayMode.Practice, questionId: remoteWork._id, question: { text: remoteWork.text, category: remoteWork.category }, response: "Remote work arrangements have become increasingly common...", wordCount: 96, durationSec: 300, status: EssayStatus.InProgress, createdAt: daysAgo(0) },
  ];

  const created = await Essay.insertMany(
    essays.map(({ createdAt, ...essay }) => ({ ...essay, user: userIdStr, createdAt }))
  );

  const original = created.find((e) => e.questionId?.equals(socialMedia._id) && e.evaluation?.overallBand === 6.5);
  const rework = created.find((e) => e.questionId?.equals(socialMedia._id) && e.evaluation?.overallBand === 7.0);
  if (rework && original) {
    rework.reworkOf = original._id as any;
    await rework.save();
  }

  const usedCounts = new Map<string, number>();
  for (const essay of created) {
    if (essay.questionId) {
      const key = essay.questionId.toString();
      usedCounts.set(key, (usedCounts.get(key) ?? 0) + 1);
    }
  }
  for (const [id, count] of usedCounts) {
    await Question.findByIdAndUpdate(id, { $inc: { timesUsed: count } });
  }

  console.log(`Seeded ${created.length} essays (6 evaluated, 1 draft, 1 rework chain) and ${questionDocs.length} questions.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});