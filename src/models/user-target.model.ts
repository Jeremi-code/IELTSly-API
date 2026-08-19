import mongoose, { Schema } from "mongoose";

export interface IUserTarget {
  userId: string;
  examDate?: Date | null;
  targetBand?: number;
  examType?: "academic" | "general";
  createdAt?: Date;
  updatedAt?: Date;
}

const userTargetSchema = new Schema<IUserTarget>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    examDate: {
      type: Date,
      default: null,
    },
    targetBand: {
      type: Number,
      default: 7.5,
      min: 0,
      max: 9.0,
    },
    examType: {
      type: String,
      enum: ["academic", "general"],
      default: "academic",
    },
  },
  {
    timestamps: true,
  },
);

export const UserTarget = mongoose.model<IUserTarget>(
  "UserTarget",
  userTargetSchema,
);
