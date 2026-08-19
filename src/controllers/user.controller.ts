import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/express.types.js";
import {
  getUserCredentialStatus,
  saveUserCredentials,
  deleteUserCredentials,
} from "../services/credential.service.js";
import { UserTarget } from "../models/user-target.model.js";
import type { AIProvider } from "../types/ai.types.js";

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

    // Provider-specific format validation
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

export async function getUserTarget(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const target = await UserTarget.findOne({ userId });
    if (!target) {
      res.json({
        examDate: null,
        targetBand: 7.5,
        examType: "academic",
        notes: "",
      });
      return;
    }
    res.json({
      examDate: target.examDate ? target.examDate.toISOString() : null,
      targetBand: target.targetBand ?? 7.5,
      examType: target.examType ?? "academic",
      notes: target.notes ?? "",
      updatedAt: target.updatedAt,
    });
  } catch (err) {
    next(err);
  }
}

export async function saveUserTarget(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const { examDate, targetBand, examType, notes } = req.body;

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
        notes: typeof notes === "string" ? notes.slice(0, 500) : "",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.json({
      examDate: target.examDate ? target.examDate.toISOString() : null,
      targetBand: target.targetBand ?? 7.5,
      examType: target.examType ?? "academic",
      notes: target.notes ?? "",
      updatedAt: target.updatedAt,
    });
  } catch (err) {
    next(err);
  }
}

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

