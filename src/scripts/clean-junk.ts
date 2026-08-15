import mongoose from "mongoose";
import dotenv from "dotenv";
import { Question } from "../models/question.model.js";
import { isJunkText } from "./scrape-liz.js";

dotenv.config();

async function cleanDb() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/ieltsly");
  console.log("Connected to MongoDB for database cleanup.");

  const allQuestions = await Question.find({});
  let removed = 0;

  for (const q of allQuestions) {
    const isInvalidTask1 =
      q.taskType === "task1" &&
      (!/^(the|below|summarise|the given|the provided)\b/i.test(q.text) ||
        q.text.includes("Well done") ||
        q.text.includes("Most of you") ||
        q.text.includes("This final paragraph") ||
        q.text.includes("significant because") ||
        /Below is an IELTS/i.test(q.text) ||
        /The overview is/i.test(q.text) ||
        /The time to give/i.test(q.text) ||
        /model answer/i.test(q.text) ||
        /getting lost in too many numbers/i.test(q.text));

    if (
      isJunkText(q.text) ||
      q.text.length < 35 ||
      isInvalidTask1 ||
      (q.imageUrl && q.imageUrl.startsWith("data:"))
    ) {
      console.log(`Removing junk question [${q.taskType} - ${q.category}]: "${q.text.slice(0, 70)}..."`);
      await Question.findByIdAndDelete(q._id);
      removed++;
    }
  }

  console.log(`\nCleanup complete. Removed ${removed} junk entries.`);
  await mongoose.disconnect();
}

cleanDb().catch(console.error);
