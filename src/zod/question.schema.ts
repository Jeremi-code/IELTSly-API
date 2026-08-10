import { z } from "zod";

export const extractedQuestionSchema = z.object({
  taskType: z.enum(["task1", "task2"]),
  category: z.string().optional(),
  text: z.string(),
  imageUrl: z.string().optional(),
});

export type ExtractedQuestion = z.infer<typeof extractedQuestionSchema>;
