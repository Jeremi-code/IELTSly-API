import { Schema, model, type InferSchemaType } from "mongoose";
import { createHash } from "crypto";

// ── Enum constants ──────────────────────────────────────────────────
export const QuestionSource = {
  Official: "official",
  Scraped: "scraped",
} as const;

// ── Schema ──────────────────────────────────────────────────────────
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

    // SHA-1 hash of normalized text — used for deduplication.
    textHash: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: "question",
  }
);

// ── Indexes ─────────────────────────────────────────────────────────
questionSchema.index({ textHash: 1 }, { unique: true });
questionSchema.index({ taskType: 1 });
questionSchema.index({ category: 1 });

// ── Utility ─────────────────────────────────────────────────────────

/**
 * Computes a deterministic SHA-1 hash of the question text.
 * Used for deduplication: identical questions produce the same hash.
 */
export function computeTextHash(text: string): string {
  return createHash("sha1").update(text.trim().toLowerCase()).digest("hex");
}

// ── Exports ─────────────────────────────────────────────────────────
export type IQuestion = InferSchemaType<typeof questionSchema>;
export const Question = model("question", questionSchema);
