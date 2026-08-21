import { Schema, model, type InferSchemaType } from "mongoose";

export const EssayType = { Task1: "task1", Task2: "task2" } as const;
export const EssayMode = { Practice: "practice", Exam: "exam" } as const;
export const EssayStatus = {
  InProgress: "in_progress",
  Submitted: "submitted",
  Evaluated: "evaluated",
} as const;

const questionSnapshotSchema = new Schema(
  {
    text: { type: String, required: true },
    category: { type: String },
    imageUrl: { type: String },
  },
  { _id: false },
);

const criteriaSchema = new Schema(
  {
    ta: { type: Number, required: true },
    cc: { type: Number, required: true },
    lr: { type: Number, required: true },
    gra: { type: Number, required: true },
  },
  { _id: false },
);

const evaluationSchema = new Schema(
  {
    overallBand: { type: Number, required: true },
    criteria: { type: criteriaSchema, required: true },
    feedback: { type: String, required: true },
    tips: { type: [String], required: true },
    evaluatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const essaySchema = new Schema(
  {
    user: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: Object.values(EssayType),
    },
    mode: {
      type: String,
      required: true,
      enum: Object.values(EssayMode),
    },
    questionId: { type: Schema.Types.ObjectId, ref: "question" },
    question: { type: questionSnapshotSchema, required: true },
    response: { type: String, required: true },
    wordCount: { type: Number, required: true },
    durationSec: { type: Number, required: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(EssayStatus),
      default: EssayStatus.InProgress,
    },
    reworkOf: { type: Schema.Types.ObjectId, ref: "essay" },
    evaluation: { type: evaluationSchema },
  },
  {
    timestamps: true,
    collection: "essay",
  },
);

essaySchema.index({ user: 1, createdAt: -1 });
essaySchema.index({ user: 1, status: 1 });
essaySchema.index({ user: 1, type: 1, createdAt: -1 });

export type IEssay = InferSchemaType<typeof essaySchema>;
export const Essay = model("essay", essaySchema);
