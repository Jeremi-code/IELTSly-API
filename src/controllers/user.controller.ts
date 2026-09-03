import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/express.types.js";
import {
  getUserCredentialStatus,
  saveUserCredentials,
  deleteUserCredentials,
} from "../services/credential.service.js";
import { UserTarget } from "../models/user-target.model.js";
import type { AIProvider } from "../types/ai.types.js";

/**
 * Gets AI credential status for the authenticated user.
 * @route GET /api/users/ai-credentials
 * @param {AuthRequest} req Express request
 * @param {Response} res Express response
 * @param {NextFunction} next Express next function
 */
export async function getAICredentials(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const status = await getUserCredentialStatus(userId);
    res.json(status);
  } catch (err) {
    next(err);
  }
}

/**
 * Saves or updates encrypted AI credentials.
 * @route POST /api/users/ai-credentials
 * @param {AuthRequest} req Express request containing provider & API key
 * @param {Response} res Express response
 * @param {NextFunction} next Express next function
 */
export async function saveAICredentials(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const { provider, apiKey, model } = req.body as {
      provider?: AIProvider;
      apiKey?: string;
      model?: string;
    };

    if (!provider || (provider !== "gemini" && provider !== "openai")) {
      res.status(400).json({
        message: "A valid provider ('gemini' or 'openai') is required.",
      });
      return;
    }

    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 10) {
      res.status(400).json({
        message: "A valid API key is required.",
      });
      return;
    }

    const trimmedKey = apiKey.trim();
    if (provider === "gemini" && !/^AIza[0-9A-Za-z_-]{20,}$/.test(trimmedKey)) {
      res.status(400).json({
        message:
          "Invalid Google Gemini API key format (should start with AIza...).",
      });
      return;
    }

    if (provider === "openai" && !/^sk-[0-9A-Za-z_-]{10,}$/.test(trimmedKey)) {
      res.status(400).json({
        message: "Invalid OpenAI API key format (should start with sk-...).",
      });
      return;
    }

    const result = await saveUserCredentials(userId, {
      provider,
      apiKey: trimmedKey,
      model,
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Deletes AI API credentials for the user.
 * @route DELETE /api/users/ai-credentials
 * @param {AuthRequest} req Express request
 * @param {Response} res Express response
 * @param {NextFunction} next Express next function
 */
export async function deleteAICredentials(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const result = await deleteUserCredentials(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves the exam target configuration for the user.
 * Uses lightweight lean query for fast performance.
 * @route GET /api/users/target
 * @param {AuthRequest} req Express request
 * @param {Response} res Express response
 * @param {NextFunction} next Express next function
 */
export async function getUserTarget(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const target = await UserTarget.findOne({ userId }).lean();
    if (!target) {
      res.json({
        examDate: null,
        targetBand: 7.5,
        examType: "academic",
      });
      return;
    }
    res.json({
      examDate: target.examDate ? new Date(target.examDate).toISOString() : null,
      targetBand: target.targetBand ?? 7.5,
      examType: target.examType ?? "academic",
      updatedAt: target.updatedAt,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Saves or updates user exam target configuration.
 * @route PUT /api/users/target
 * @param {AuthRequest} req Express request
 * @param {Response} res Express response
 * @param {NextFunction} next Express next function
 */
export async function saveUserTarget(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const { examDate, targetBand, examType } = req.body;

    let parsedDate: Date | null = null;
    if (examDate) {
      parsedDate = new Date(examDate);
      if (isNaN(parsedDate.getTime())) {
        res.status(400).json({ message: "Invalid exam date format." });
        return;
      }
    }

    let parsedBand = 7.5;
    if (typeof targetBand === "number") {
      if (targetBand < 0 || targetBand > 9) {
        res.status(400).json({
          message: "Target band must be between 0 and 9.0",
        });
        return;
      }
      parsedBand = targetBand;
    }

    const type = examType === "general" ? "general" : "academic";

    const target = await UserTarget.findOneAndUpdate(
      { userId },
      {
        userId,
        examDate: parsedDate,
        targetBand: parsedBand,
        examType: type,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    res.json({
      examDate: target.examDate ? new Date(target.examDate).toISOString() : null,
      targetBand: target.targetBand ?? 7.5,
      examType: target.examType ?? "academic",
      updatedAt: target.updatedAt,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Clears user target exam date configuration.
 * @route DELETE /api/users/target
 * @param {AuthRequest} req Express request
 * @param {Response} res Express response
 * @param {NextFunction} next Express next function
 */
export async function deleteUserTarget(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    await UserTarget.findOneAndDelete({ userId });
    res.json({ success: true, message: "Target exam date cleared." });
  } catch (err) {
    next(err);
  }
}
