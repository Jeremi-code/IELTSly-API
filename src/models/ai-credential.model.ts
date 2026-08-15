import mongoose, { Schema } from "mongoose";
import type { AIProvider } from "../types/ai.types.js";

export interface IAiCredential {
  userId: string;
  provider: AIProvider;
  model?: string;
  encrypted: string;
  iv: string;
  authTag: string;
  maskedKey: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const aiCredentialSchema = new Schema<IAiCredential>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ["gemini", "openai"],
      required: true,
    },
    model: {
      type: String,
      trim: true,
    },
    encrypted: {
      type: String,
      required: true,
    },
    iv: {
      type: String,
      required: true,
    },
    authTag: {
      type: String,
      required: true,
    },
    maskedKey: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const AiCredential = mongoose.model<IAiCredential>(
  "AiCredential",
  aiCredentialSchema
);
