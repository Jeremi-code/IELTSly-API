import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/express.types.js";
import { Essay, EssayStatus } from "../models/essay.model.js";
import {
  round1dp,
  buildDiagnosticComment,
  calculateStreakAndStats,
} from "../utils/analytics.utils.js";
import type {
  AnalyticsStats,
  CriteriaAverages,
  TrendPoint,
  Improvement,
  ActivitySummary,
} from "../types/analytics.types.js";

// ── GET /api/analytics ──────────────────────────────────────────────
export async function getAnalytics(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
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
            $sum: {
              $cond: [{ $eq: ["$status", EssayStatus.Evaluated] }, 1, 0],
            },
          },
          inProgressCount: {
            $sum: {
              $cond: [{ $eq: ["$status", EssayStatus.InProgress] }, 1, 0],
            },
          },
          averageBand: {
            $avg: {
              $cond: [
                { $eq: ["$status", EssayStatus.Evaluated] },
                "$evaluation.overallBand",
                null,
              ],
            },
          },
          bestBand: {
            $max: {
              $cond: [
                { $eq: ["$status", EssayStatus.Evaluated] },
                "$evaluation.overallBand",
                null,
              ],
            },
          },
        },
      },
    ]);

    // ── Word count and duration averages ──────────────────────────
    const [performanceResult] = await Essay.aggregate([
      { $match: { user: userId, status: EssayStatus.Evaluated } },
      {
        $group: {
          _id: null,
          avgWordCount: { $avg: "$wordCount" },
          avgDurationSec: { $avg: "$durationSec" },
        },
      },
    ]);

    const stats: AnalyticsStats = {
      totalAttempts: statsResult?.totalAttempts ?? 0,
      evaluatedCount: statsResult?.evaluatedCount ?? 0,
      inProgressCount: statsResult?.inProgressCount ?? 0,
      averageBand: round1dp(statsResult?.averageBand ?? 0),
      bestBand: statsResult?.bestBand ?? 0,
      task1Average: 0,
      task2Average: 0,
      avgWordCount: performanceResult?.avgWordCount
        ? Math.round(performanceResult.avgWordCount)
        : 0,
      avgDurationSec: performanceResult?.avgDurationSec
        ? Math.round(performanceResult.avgDurationSec)
        : 0,
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
    const criteriaAverages: CriteriaAverages = {
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

    const trend: TrendPoint[] = trendDocs.reverse().map((doc) => ({
      id: doc._id,
      date: doc.createdAt,
      band: doc.evaluation?.overallBand ?? 0,
      type: doc.type,
    }));

    // ── Recent examiner tips (collected from the last 6 evaluations) ──
    const recentEvaluations = await Essay.find({
      user: userId,
      status: EssayStatus.Evaluated,
      "evaluation.tips": { $exists: true, $not: { $size: 0 } },
    })
      .sort({ createdAt: -1 })
      .limit(6)
      .select("evaluation.tips")
      .lean();

    const recentTips: string[] = [];
    for (const item of recentEvaluations) {
      if (Array.isArray(item.evaluation?.tips)) {
        for (const tip of item.evaluation.tips) {
          if (
            tip &&
            typeof tip === "string" &&
            !recentTips.includes(tip.trim())
          ) {
            recentTips.push(tip.trim());
          }
        }
      }
    }

    // ── Rework improvements ───────────────────────────────────────
    const reworks = await Essay.find({
      user: userId,
      reworkOf: { $exists: true, $ne: null },
      status: EssayStatus.Evaluated,
    })
      .select("_id reworkOf evaluation.overallBand createdAt")
      .lean();

    const improvements: Improvement[] = [];
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

    // ── Daily activity & streak aggregation ───────────────────────
    const dailyActivitiesRaw = await Essay.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
          durationSec: { $sum: { $ifNull: ["$durationSec", 0] } },
          wordCount: { $sum: { $ifNull: ["$wordCount", 0] } },
          bandSum: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", EssayStatus.Evaluated] },
                    { $ne: ["$evaluation.overallBand", null] },
                  ],
                },
                "$evaluation.overallBand",
                0,
              ],
            },
          },
          bandCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", EssayStatus.Evaluated] },
                    { $ne: ["$evaluation.overallBand", null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const activitiesMap: Record<
      string,
      {
        count: number;
        durationSec: number;
        wordCount: number;
        bandSum: number;
        bandCount: number;
      }
    > = {};

    for (const item of dailyActivitiesRaw) {
      if (item._id) {
        activitiesMap[item._id] = {
          count: item.count || 0,
          durationSec: item.durationSec || 0,
          wordCount: item.wordCount || 0,
          bandSum: item.bandSum || 0,
          bandCount: item.bandCount || 0,
        };
      }
    }

    const activitySummary = calculateStreakAndStats(activitiesMap);

    // ── Diagnostic coach comment ───────────────────────────────────
    const dailyComment = buildDiagnosticComment(stats, criteriaAverages);

    res.json({
      stats,
      criteriaAverages,
      trend,
      improvements,
      dailyComment,
      recentTips: recentTips.slice(0, 6),
      activitySummary,
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/analytics/activity ─────────────────────────────────────
export async function getActivitySummary(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const dailyActivitiesRaw = await Essay.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
          durationSec: { $sum: { $ifNull: ["$durationSec", 0] } },
          wordCount: { $sum: { $ifNull: ["$wordCount", 0] } },
          bandSum: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", EssayStatus.Evaluated] },
                    { $ne: ["$evaluation.overallBand", null] },
                  ],
                },
                "$evaluation.overallBand",
                0,
              ],
            },
          },
          bandCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", EssayStatus.Evaluated] },
                    { $ne: ["$evaluation.overallBand", null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const activitiesMap: Record<
      string,
      {
        count: number;
        durationSec: number;
        wordCount: number;
        bandSum: number;
        bandCount: number;
      }
    > = {};

    for (const item of dailyActivitiesRaw) {
      if (item._id) {
        activitiesMap[item._id] = {
          count: item.count || 0,
          durationSec: item.durationSec || 0,
          wordCount: item.wordCount || 0,
          bandSum: item.bandSum || 0,
          bandCount: item.bandCount || 0,
        };
      }
    }

    const activitySummary = calculateStreakAndStats(activitiesMap);
    res.json(activitySummary);
  } catch (err) {
    next(err);
  }
}
