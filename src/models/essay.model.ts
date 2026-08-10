import { Schema, model, type InferSchemaType } from "mongoose";

// ── Enum constants ──────────────────────────────────────────────────
export const EssayType = { Task1: "task1", Task2: "task2" } as const;
export const EssayMode = { Practice: "practice", Exam: "exam" } as const;
export const EssayStatus = {
  InProgress: "in_progress",
  Submitted: "submitted",
  Evaluated: "evaluated",
} as const;

// ── Subdocument schemas (no _id) ────────────────────────────────────
const questionSnapshotSchema = new Schema(
  {
    text: { type: String, required: true },
    category: { type: String },
    imageUrl: { type: String },
  },
  { _id: false }
);

const criteriaSchema = new Schema(
  {
    ta: { type: Number, required: true },
    cc: { type: Number, required: true },
    lr: { type: Number, required: true },
    gra: { type: Number, required: true },
  },
  { _id: false }
);

const evaluationSchema = new Schema(
  {
    overallBand: { type: Number, required: true },
    criteria: { type: criteriaSchema, required: true },
    feedback: { type: String, required: true },
    tips: { type: [String], required: true },
    evaluatedAt: { type: Date, required: true },
  },
  { _id: false }
);

// ── Main essay schema ───────────────────────────────────────────────
const essaySchema = new Schema(
  {
    // String type — better-auth uses string _id for users, NOT ObjectId.
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

    // Reference to the question bank (nullable — user may paste their own).
    questionId: { type: Schema.Types.ObjectId, ref: "question" },
    // Snapshot copied at attempt time — keeps history immutable, reads join-free.
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

    // Set when this essay is a rework of a previously evaluated essay.
    reworkOf: { type: Schema.Types.ObjectId, ref: "essay" },

    // Filled when status === "evaluated".
    evaluation: { type: evaluationSchema },
  },
  {
    timestamps: true,
    collection: "essay",
  }
);

// ── Indexes ─────────────────────────────────────────────────────────
essaySchema.index({ user: 1, createdAt: -1 }); // history listing, analytics trend
essaySchema.index({ user: 1, status: 1 }); // dashboard counts
essaySchema.index({ user: 1, type: 1, createdAt: -1 }); // per-task stats

// ── Exports ─────────────────────────────────────────────────────────
export type IEssay = InferSchemaType<typeof essaySchema>;
export const Essay = model("essay", essaySchema);
