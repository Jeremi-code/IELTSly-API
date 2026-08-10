import { z } from "zod";

export const evaluationOutputSchema = z.object({
  overallBand: z.number().min(0).max(9),
  criteria: z.object({
    ta: z.number().min(0).max(9),
    cc: z.number().min(0).max(9),
    lr: z.number().min(0).max(9),
    gra: z.number().min(0).max(9),
  }),
  feedback: z.string(),
  tips: z.array(z.string()),
});

export type EvaluationResult = z.infer<typeof evaluationOutputSchema>;
