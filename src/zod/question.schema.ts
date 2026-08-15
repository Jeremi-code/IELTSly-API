import { z } from "zod";

export const Task1CategoryEnum = z.enum([
  "Bar Chart",
  "Line Graph",
  "Pie Chart",
  "Table",
  "Map",
  "Process Diagram",
  "Multiple Charts",
]);

export const Task2CategoryEnum = z.enum([
  "Agree / Disagree",
  "Discuss Both Views",
  "Advantages & Disadvantages",
  "Causes & Solutions",
  "Direct / Two-Part Question",
  "Positive / Negative Development",
]);

export const QuestionCategoryEnum = z.union([
  Task1CategoryEnum,
  Task2CategoryEnum,
]);

export const extractedQuestionSchema = z.object({
  taskType: z.enum(["task1", "task2"]),
  category: z.string().optional(),
  text: z.string(),
  imageUrl: z.string().optional(),
});

export type ExtractedQuestion = z.infer<typeof extractedQuestionSchema>;
