import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/express.types.js";
import {
  getUserCredentialStatus,
  saveUserCredentials,
  deleteUserCredentials,
} from "../services/credential.service.js";
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
