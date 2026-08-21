import { Schema, model, type InferSchemaType } from "mongoose";
import { computeTextHash } from "../utils/text.utils.js";
export { computeTextHash };

export const QuestionSource = {
  Official: "official",
  Scraped: "scraped",
} as const;

export const Task1Category = {
  BarChart: "Bar Chart",
  LineGraph: "Line Graph",
  PieChart: "Pie Chart",
  Table: "Table",
  Map: "Map",
  ProcessDiagram: "Process Diagram",
  MultipleCharts: "Multiple Charts",
} as const;

export const Task2Category = {
  AgreeDisagree: "Agree / Disagree",
  DiscussBothViews: "Discuss Both Views",
  AdvantagesDisadvantages: "Advantages & Disadvantages",
  CausesSolutions: "Causes & Solutions",
  DirectQuestion: "Direct / Two-Part Question",
  PositiveNegative: "Positive / Negative Development",
} as const;

export const QuestionCategory = {
  ...Task1Category,
  ...Task2Category,
} as const;

export type Task1CategoryType =
  (typeof Task1Category)[keyof typeof Task1Category];
export type Task2CategoryType =
  (typeof Task2Category)[keyof typeof Task2Category];
export type QuestionCategoryType =
  (typeof QuestionCategory)[keyof typeof QuestionCategory];

const questionSchema = new Schema(
  {
    taskType: {
      type: String,
      required: true,
      enum: ["task1", "task2"],
    },
    category: { type: String },
    text: { type: String, required: true },
    imageUrl: { type: String },
    source: {
      type: String,
      required: true,
      enum: Object.values(QuestionSource),
    },
    sourceUrl: { type: String },
    timesUsed: { type: Number, required: true, default: 0 },
    textHash: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: "question",
  },
);

questionSchema.index({ textHash: 1 }, { unique: true });
questionSchema.index({ taskType: 1 });
questionSchema.index({ category: 1 });

export type IQuestion = InferSchemaType<typeof questionSchema>;
export const Question = model("question", questionSchema);
