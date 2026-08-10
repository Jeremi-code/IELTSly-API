import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/express.types.js";
import { Question, computeTextHash } from "../models/question.model.js";

// ── GET /api/questions ──────────────────────────────────────────────
export async function listQuestions(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { taskType, category } = req.query;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));

    const filter: Record<string, unknown> = {};
    if (taskType) filter.taskType = taskType;
    if (category) filter.category = category;

    const [questions, total] = await Promise.all([
      Question.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Question.countDocuments(filter),
    ]);

    res.json({ questions, page, limit, total });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/questions/:id ──────────────────────────────────────────
export async function getQuestion(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const question = await Question.findById(req.params.id).lean();
    if (!question) {
      res.status(404).json({ message: "Question not found." });
      return;
    }
    res.json(question);
  } catch (err) {
    next(err);
  }
}

// ── POST /api/questions ─────────────────────────────────────────────
export async function createQuestion(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { taskType, category, text, imageUrl, source } = req.body;

    if (!text || !taskType || !source) {
      res.status(400).json({ message: "taskType, text, and source are required." });
      return;
    }

    const textHash = computeTextHash(text);

    // Check for existing duplicate.
    const existing = await Question.findOne({ textHash }).lean();
    if (existing) {
      // Return the existing doc without incrementing timesUsed.
      // timesUsed is only incremented by essay creation.
      res.status(200).json(existing);
      return;
    }

    const question = await Question.create({
      taskType,
      category,
      text,
      imageUrl,
      source,
      textHash,
    });

    res.status(201).json(question);
  } catch (err) {
    next(err);
  }
}
