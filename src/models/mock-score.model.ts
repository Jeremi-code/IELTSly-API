import mongoose, { Schema, Document } from "mongoose";

export type IELTSModule = "listening" | "reading" | "writing" | "speaking";

export interface IMockScore extends Document {
  userId: string;
  module: IELTSModule;
  score: number;
  rawCount?: number;
  totalQuestions?: number;
  source: string;
  testDate: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const mockScoreSchema = new Schema<IMockScore>(
  {
    userId: { type: String, required: true, index: true },
    module: {
      type: String,
      required: true,
      enum: ["listening", "reading", "writing", "speaking"],
    },
    score: { type: Number, required: true, min: 0, max: 9 },
    rawCount: { type: Number, min: 0, max: 40 },
    totalQuestions: { type: Number, default: 40 },
    source: { type: String, required: true, trim: true, default: "Practice Test" },
    testDate: { type: Date, default: Date.now },
    notes: { type: String, trim: true },
  },
  {
    timestamps: true,
  }
);

mockScoreSchema.index({ userId: 1, testDate: -1 });
mockScoreSchema.index({ userId: 1, module: 1 });

export default mongoose.models.MockScore ||
  mongoose.model<IMockScore>("MockScore", mockScoreSchema);
