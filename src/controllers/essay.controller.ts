import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/express.types.js";
import { Essay, EssayStatus } from "../models/essay.model.js";
import { Question, computeTextHash } from "../models/question.model.js";
import { evaluateEssay as runEvaluation } from "../services/evaluation.service.js";
import { getDecryptedCredentials } from "../services/credential.service.js";

// ── Helpers ─────────────────────────────────────────────────────────
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ── POST /api/essays ────────────────────────────────────────────────
export async function createEssay(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const { type, mode, questionId, question, response, durationSec } =
      req.body;

    let snapshot = question;

    if (questionId) {
      const bankQuestion = await Question.findById(questionId);
      if (!bankQuestion) {
        res.status(404).json({ message: "Question not found in the bank." });
        return;
      }

      snapshot = {
        text: bankQuestion.text,
        category: bankQuestion.category,
        imageUrl: bankQuestion.imageUrl,
      };
      bankQuestion.timesUsed += 1;
      await bankQuestion.save();
    }

    if (!snapshot?.text) {
      res
        .status(400)
        .json({
          message:
            "A question text is required (provide questionId or question.text).",
        });
      return;
    }

    const essay = await Essay.create({
      user: userId,
      type,
      mode,
      questionId: questionId || undefined,
      question: snapshot,
      response,
      wordCount: wordCount(response),
      durationSec,
      status: EssayStatus.InProgress,
    });

    res.status(201).json(essay);
  } catch (err) {
    next(err);
  }
}

// ── GET /api/essays ─────────────────────────────────────────────────
export async function listEssays(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const { type, status, mode } = req.query;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(req.query.limit as string) || 10),
    );

    const filter: Record<string, unknown> = { user: userId };
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (mode) filter.mode = mode;

    const [essays, total] = await Promise.all([
      Essay.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Essay.countDocuments(filter),
    ]);

    res.json({ essays, page, limit, total });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/essays/:id ─────────────────────────────────────────────
export async function getEssay(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const essay = await Essay.findOne({
      _id: req.params.id,
      user: req.user!.id,
    }).lean();

    if (!essay) {
      res.status(404).json({ message: "Essay not found." });
      return;
    }
    res.json(essay);
  } catch (err) {
    next(err);
  }
}

// ── PUT /api/essays/:id ─────────────────────────────────────────────
export async function updateEssay(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const essay = await Essay.findOne({
      _id: req.params.id,
      user: req.user!.id,
    });

    if (!essay) {
      res.status(404).json({ message: "Essay not found." });
      return;
    }

    if (essay.status !== EssayStatus.InProgress) {
      res.status(409).json({
        message:
          "Only in-progress drafts can be updated. Use rework for evaluated essays.",
      });
      return;
    }

    if (req.body.response !== undefined) {
      essay.response = req.body.response;
      essay.wordCount = wordCount(req.body.response);
    }
    if (req.body.durationSec !== undefined) {
      essay.durationSec = req.body.durationSec;
    }

    await essay.save();
    res.json(essay);
  } catch (err) {
    next(err);
  }
}

// ── POST /api/essays/:id/evaluate ───────────────────────────────────
export async function evaluateEssay(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const essay = await Essay.findOne({
      _id: req.params.id,
      user: req.user!.id,
    });

    if (!essay) {
      res.status(404).json({ message: "Essay not found." });
      return;
    }

    if (essay.status === EssayStatus.Evaluated) {
      res.status(409).json({
        message: "This essay is already evaluated. Create a rework instead.",
      });
      return;
    }

    const userId = req.user!.id;

    // User brings their own AI key (stored encrypted in DB or provided in request headers)
    let credentials = await getDecryptedCredentials(userId);

    if (!credentials) {
      const headerKey = (req.headers["x-api-key"] as string) || undefined;
      const headerProvider =
        (req.headers["x-ai-provider"] as string) || undefined;
      const headerModel = (req.headers["x-ai-model"] as string) || undefined;

      if (
        headerKey &&
        (headerProvider === "gemini" || headerProvider === "openai")
      ) {
        credentials = {
          apiKey: headerKey,
          provider: headerProvider,
          model: headerModel,
        };
      }
    }

    if (!credentials || !credentials.apiKey) {
      res.status(400).json({
        message:
          "No AI API key found. Please connect your Gemini or OpenAI key in Settings.",
      });
      return;
    }

    let evaluation;
    try {
      evaluation = await runEvaluation({
        response: essay.response,
        wordCount: essay.wordCount,
        type: essay.type as "task1" | "task2",
        mode: essay.mode as "practice" | "exam",
        questionText: essay.question.text,
        questionCategory: essay.question.category ?? undefined,
        apiKey: credentials.apiKey,
        provider: credentials.provider,
        model: credentials.model,
      });
    } catch (err) {
      console.error("Evaluation failed:", err);
      res.status(502).json({ message: "Evaluation failed, please retry." });
      return;
    }

    essay.status = EssayStatus.Evaluated;
    essay.evaluation = {
      ...evaluation,
      evaluatedAt: new Date(),
    };
    await essay.save();

    res.json(essay);
  } catch (err) {
    next(err);
  }
}

// ── POST /api/essays/:id/rework ─────────────────────────────────────
export async function reworkEssay(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const source = await Essay.findOne({
      _id: req.params.id,
      user: req.user!.id,
    });

    if (!source) {
      res.status(404).json({ message: "Source essay not found." });
      return;
    }

    const { response, durationSec } = req.body;

    // Increment timesUsed on the question if it came from the bank.
    if (source.questionId) {
      await Question.findByIdAndUpdate(source.questionId, {
        $inc: { timesUsed: 1 },
      });
    }

    const rework = await Essay.create({
      user: req.user!.id,
      type: source.type,
      mode: source.mode,
      questionId: source.questionId,
      question: source.question,
      response,
      wordCount: wordCount(response),
      durationSec,
      status: EssayStatus.InProgress,
      reworkOf: source._id,
    });

    res.status(201).json(rework);
  } catch (err) {
    next(err);
  }
}
