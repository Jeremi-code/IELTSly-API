import mongoose from "mongoose";
import dotenv from "dotenv";
import { Question } from "../models/question.model.js";
import { detectCategory } from "../utils/scraper.utils.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/ieltsly";

async function run(): Promise<void> {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to database for category reclassification.");

  const questions = await Question.find({});
  console.log(`Found ${questions.length} questions to check.`);

  let updatedCount = 0;
  for (const q of questions) {
    const newCategory = detectCategory(q.text, q.taskType as "task1" | "task2");
    if (newCategory && newCategory !== q.category) {
      console.log(
        `Updating "${q.text.slice(0, 50)}...": "${q.category}" -> "${newCategory}"`,
      );
      q.category = newCategory;
      await q.save();
      updatedCount++;
    }
  }

  console.log(
    `Category reclassification completed. ${updatedCount} questions updated.`,
  );
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
