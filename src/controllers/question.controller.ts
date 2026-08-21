import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/express.types.js";
import { Question } from "../models/question.model.js";
import { computeTextHash } from "../utils/text.utils.js";

/**
 * Lists question prompts with search, category filtering, and pagination.
 * @route GET /api/questions
 * @param {AuthRequest} req Express request
 * @param {Response} res Express response
 * @param {NextFunction} next Express next function
 */
export async function listQuestions(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { taskType, category, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(req.query.limit as string) || 10),
    );

    const filter: Record<string, unknown> = {};
    if (taskType && taskType !== "all") filter.taskType = taskType;
    if (category && category !== "all") filter.category = category;
    if (search && typeof search === "string" && search.trim()) {
      filter.$or = [
        { text: { $regex: search.trim(), $options: "i" } },
        { category: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const [questions, total] = await Promise.all([
      Question.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Question.countDocuments(filter),
    ]);

    res.json({ questions, page, limit, total });
  } catch (err) {
    next(err);
  }
}

/**
 * Returns distinct question categories for a given task type.
 * @route GET /api/questions/categories
 * @param {AuthRequest} req Express request
 * @param {Response} res Express response
 * @param {NextFunction} next Express next function
 */
export async function getCategories(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { taskType } = req.query;
    const filter: Record<string, unknown> = {};
    if (taskType && taskType !== "all") filter.taskType = taskType;
    const categories = await Question.distinct("category", filter);
    res.json(
      categories.filter((c) => typeof c === "string" && c.trim().length > 0),
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Returns a random question prompt matching specified criteria.
 * @route GET /api/questions/random
 * @param {AuthRequest} req Express request
 * @param {Response} res Express response
 * @param {NextFunction} next Express next function
 */
export async function getRandomQuestion(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { taskType, category, search } = req.query;
    const filter: Record<string, unknown> = {};
    if (taskType && taskType !== "all") filter.taskType = taskType;
    if (category && category !== "all") filter.category = category;
    if (search && typeof search === "string" && search.trim()) {
      filter.$or = [
        { text: { $regex: search.trim(), $options: "i" } },
        { category: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const count = await Question.countDocuments(filter);
    if (count === 0) {
      res
        .status(404)
        .json({ message: "No questions found matching criteria." });
      return;
    }
    const randomSkip = Math.floor(Math.random() * count);
    const question = await Question.findOne(filter).skip(randomSkip).lean();
    res.json(question);
  } catch (err) {
    next(err);
  }
}

/**
 * Gets a specific question prompt by ID.
 * @route GET /api/questions/:id
 * @param {AuthRequest} req Express request
 * @param {Response} res Express response
 * @param {NextFunction} next Express next function
 */
export async function getQuestion(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
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

/**
 * Creates a new question prompt in the bank with hash-based deduplication.
 * @route POST /api/questions
 * @param {AuthRequest} req Express request
 * @param {Response} res Express response
 * @param {NextFunction} next Express next function
 */
export async function createQuestion(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { taskType, category, text, imageUrl, source } = req.body;

    if (!text || !taskType || !source) {
      res
        .status(400)
        .json({ message: "taskType, text, and source are required." });
      return;
    }

    const textHash = computeTextHash(text);

    const existing = await Question.findOne({ textHash }).lean();
    if (existing) {
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
