import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/express.types.js";
import { Essay, EssayStatus } from "../models/essay.model.js";
import { generateDailyComment } from "../services/evaluation.service.js";

// ── GET /api/analytics ──────────────────────────────────────────────
export async function getAnalytics(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;

    // ── Aggregation: core stats ───────────────────────────────────
    const [statsResult] = await Essay.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: null,
          totalAttempts: { $sum: 1 },
          evaluatedCount: {
            $sum: { $cond: [{ $eq: ["$status", EssayStatus.Evaluated] }, 1, 0] },
          },
          inProgressCount: {
            $sum: { $cond: [{ $eq: ["$status", EssayStatus.InProgress] }, 1, 0] },
          },
          averageBand: {
            $avg: {
              $cond: [{ $eq: ["$status", EssayStatus.Evaluated] }, "$evaluation.overallBand", null],
            },
          },
          bestBand: {
            $max: {
              $cond: [{ $eq: ["$status", EssayStatus.Evaluated] }, "$evaluation.overallBand", null],
            },
          },
        },
      },
    ]);

    const stats = {
      totalAttempts: statsResult?.totalAttempts ?? 0,
      evaluatedCount: statsResult?.evaluatedCount ?? 0,
      inProgressCount: statsResult?.inProgressCount ?? 0,
      averageBand: round1dp(statsResult?.averageBand ?? 0),
      bestBand: statsResult?.bestBand ?? 0,
      task1Average: 0,
      task2Average: 0,
    };

    // ── Per-task averages ─────────────────────────────────────────
    const taskAvgs = await Essay.aggregate([
      { $match: { user: userId, status: EssayStatus.Evaluated } },
      { $group: { _id: "$type", avg: { $avg: "$evaluation.overallBand" } } },
    ]);
    for (const row of taskAvgs) {
      if (row._id === "task1") stats.task1Average = round1dp(row.avg);
      if (row._id === "task2") stats.task2Average = round1dp(row.avg);
    }

    // ── Criteria averages ─────────────────────────────────────────
    const [criteriaResult] = await Essay.aggregate([
      { $match: { user: userId, status: EssayStatus.Evaluated } },
      {
        $group: {
          _id: null,
          ta: { $avg: "$evaluation.criteria.ta" },
          cc: { $avg: "$evaluation.criteria.cc" },
          lr: { $avg: "$evaluation.criteria.lr" },
          gra: { $avg: "$evaluation.criteria.gra" },
        },
      },
    ]);
    const criteriaAverages = {
      ta: round1dp(criteriaResult?.ta ?? 0),
      cc: round1dp(criteriaResult?.cc ?? 0),
      lr: round1dp(criteriaResult?.lr ?? 0),
      gra: round1dp(criteriaResult?.gra ?? 0),
    };

    // ── Trend: last 10 evaluated essays (oldest → newest) ────────
    const trendDocs = await Essay.find({
      user: userId,
      status: EssayStatus.Evaluated,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("_id createdAt evaluation.overallBand type")
      .lean();

    const trend = trendDocs
      .reverse()
      .map((doc) => ({
        id: doc._id,
        date: doc.createdAt,
        band: doc.evaluation?.overallBand ?? 0,
        type: doc.type,
      }));

    // ── Rework improvements ───────────────────────────────────────
    const reworks = await Essay.find({
      user: userId,
      reworkOf: { $exists: true, $ne: null },
      status: EssayStatus.Evaluated,
    })
      .select("_id reworkOf evaluation.overallBand createdAt")
      .lean();

    const improvements = [];
    for (const rework of reworks) {
      const original = await Essay.findOne({
        _id: rework.reworkOf,
        status: EssayStatus.Evaluated,
      })
        .select("evaluation.overallBand")
        .lean();

      if (original?.evaluation?.overallBand != null) {
        const fromBand = original.evaluation.overallBand;
        const toBand = rework.evaluation?.overallBand ?? 0;
        improvements.push({
          originalId: rework.reworkOf,
          reworkId: rework._id,
          fromBand,
          toBand,
          delta: round1dp(toBand - fromBand),
          date: rework.createdAt,
        });
      }
    }

    // ── Daily comment (AI-generated or static fallback) ──────────
    const apiKey = req.headers["x-api-key"] as string | undefined;
    const provider = req.headers["x-ai-provider"] as string | undefined;

    let dailyComment: { text: string; tone: string };
    try {
      if (apiKey && (provider === "gemini" || provider === "openai")) {
        dailyComment = await generateDailyComment(stats, criteriaAverages, {
          apiKey,
          provider,
        });
      } else {
        // User provided no valid key — static fallback.
        dailyComment = buildStaticComment(stats);
      }
    } catch {
      dailyComment = buildStaticComment(stats);
    }

    res.json({ stats, criteriaAverages, trend, improvements, dailyComment });
  } catch (err) {
    next(err);
  }
}

// ── Utilities ───────────────────────────────────────────────────────
function round1dp(n: number): number {
  return Math.round(n * 10) / 10;
}

function buildStaticComment(stats: { averageBand: number; evaluatedCount: number }) {
  if (stats.evaluatedCount === 0) {
    return {
      text: "Welcome to IELTSly! Submit your first essay to start tracking your progress.",
      tone: "neutral",
    };
  }
  if (stats.averageBand >= 7) {
    return {
      text: `Great work! Your average band of ${stats.averageBand} shows strong writing ability. Keep refining your vocabulary for even higher scores.`,
      tone: "positive",
    };
  }
  return {
    text: `You're making progress with an average band of ${stats.averageBand}. Focus on one criterion per session to see targeted improvements.`,
    tone: "push",
  };
}
