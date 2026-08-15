import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Essay, type IEssay } from "../src/models/essay.model.js";

let mongod: MongoMemoryServer;

export async function startDb(): Promise<void> {
  mongod = await MongoMemoryServer.create({
    binary: { systemBinary: "/opt/homebrew/bin/mongod" },
  });
  await mongoose.connect(mongod.getUri("ieltsly_test"));
}

export async function stopDb(): Promise<void> {
  await mongoose.disconnect();
  await mongod?.stop();
}

export async function clearDb(): Promise<void> {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})),
  );
}

export const TEST_USER = {
  id: "user-123",
  name: "Tester",
  email: "tester@example.com",
  emailVerified: true,
  image: null,
  createdAt: new Date(),
};

export const OTHER_USER = {
  id: "user-456",
  name: "Other",
  email: "other@example.com",
  emailVerified: true,
  image: null,
  createdAt: new Date(),
};

export async function seedEssay(
  overrides: Partial<IEssay> & Record<string, unknown> = {},
): Promise<InstanceType<typeof Essay>> {
  return Essay.create({
    user: TEST_USER.id,
    type: "task2",
    mode: "practice",
    question: {
      text: "Do you agree that social media has a negative impact on young people?",
      category: "technology",
    },
    response: "Some people argue that social media harms the youth.",
    wordCount: 11,
    durationSec: 600,
    status: "in_progress",
    ...overrides,
  });
}
