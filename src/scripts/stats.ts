import mongoose from "mongoose";
import dotenv from "dotenv";
import { Question } from "../models/question.model.js";

dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/ieltsly");
  const total = await Question.countDocuments();
  const task1 = await Question.countDocuments({ taskType: "task1" });
  const task2 = await Question.countDocuments({ taskType: "task2" });

  const categories = await Question.aggregate([
    {
      $group: {
        _id: { taskType: "$taskType", category: "$category" },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.taskType": 1, count: -1 } },
  ]);

  console.log(`\n========================================`);
  console.log(`Question Bank Statistics:`);
  console.log(`  Total in DB: ${total}`);
  console.log(`  Task 1: ${task1}`);
  console.log(`  Task 2: ${task2}`);
  console.log(`----------------------------------------`);
  console.log(`Category Breakdown:`);
  categories.forEach((c) => {
    console.log(`  [${c._id.taskType}] ${c._id.category || "Uncategorized"}: ${c.count}`);
  });
  console.log(`========================================\n`);

  await mongoose.disconnect();
}

check().catch(console.error);
