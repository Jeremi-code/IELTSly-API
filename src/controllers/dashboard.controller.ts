import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/express.types.js";
import { Essay, EssayStatus } from "../models/essay.model.js";
import MockScore from "../models/mock-score.model.js";
import { UserTarget } from "../models/user-target.model.js";
import { calculateOverallBand } from "../utils/mock-score.utils.js";
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
} from "../types/analytics.types.js";
import type { IELTSModule, IMockScore } from "../models/mock-score.model.js";

/**
 * Combined dashboard endpoint that returns analytics, user target,
 * and mock score summary in a single response to avoid multiple
 * proxy round trips through the Vercel rewrite layer.
 *
 * @route GET /api/dashboard
 */
export async function getDashboardBundle(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;

    const [
      [statsResult],
      [performanceResult],
      taskAvgs,
      [criteriaResult],
      trendDocs,
      recentEvaluations,
      reworks,
      dailyActivitiesRaw,
      target,
      mockScores,
    ] = await Promise.all([
      // ── Analytics queries (8) ──────────────────────────────────────
      Essay.aggregate([
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
      ]),

      Essay.aggregate([
        { $match: { user: userId, status: EssayStatus.Evaluated } },
        {
          $group: {
            _id: null,
            avgWordCount: { $avg: "$wordCount" },
            avgDurationSec: { $avg: "$durationSec" },
          },
        },
      ]),

      Essay.aggregate([
        { $match: { user: userId, status: EssayStatus.Evaluated } },
        { $group: { _id: "$type", avg: { $avg: "$evaluation.overallBand" } } },
      ]),

      Essay.aggregate([
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
      ]),

      Essay.find({
        user: userId,
        status: EssayStatus.Evaluated,
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .select("_id createdAt evaluation.overallBand type")
        .lean(),

      Essay.find({
        user: userId,
        status: EssayStatus.Evaluated,
        "evaluation.tips": { $exists: true, $not: { $size: 0 } },
      })
        .sort({ createdAt: -1 })
        .limit(6)
        .select("evaluation.tips")
        .lean(),

      Essay.find({
        user: userId,
        reworkOf: { $exists: true, $ne: null },
        status: EssayStatus.Evaluated,
      })
        .select("_id reworkOf evaluation.overallBand createdAt")
        .lean(),

      Essay.aggregate([
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
      ]),

      UserTarget.findOne({ userId }).lean(),

      MockScore.find({ userId }).sort({ testDate: -1 }).lean() as Promise<IMockScore[]>,
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

    for (const row of taskAvgs) {
      if (row._id === "task1") stats.task1Average = round1dp(row.avg);
      if (row._id === "task2") stats.task2Average = round1dp(row.avg);
    }

    const criteriaAverages: CriteriaAverages = {
      ta: round1dp(criteriaResult?.ta ?? 0),
      cc: round1dp(criteriaResult?.cc ?? 0),
      lr: round1dp(criteriaResult?.lr ?? 0),
      gra: round1dp(criteriaResult?.gra ?? 0),
    };

    const trend: TrendPoint[] = trendDocs.reverse().map((doc) => ({
      id: doc._id,
      date: doc.createdAt,
      band: doc.evaluation?.overallBand ?? 0,
      type: doc.type,
    }));

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

    const originalIds = reworks.map((r) => r.reworkOf).filter(Boolean);
    const originals =
      originalIds.length > 0
        ? await Essay.find({
            _id: { $in: originalIds },
            status: EssayStatus.Evaluated,
          })
            .select("_id evaluation.overallBand")
            .lean()
        : [];

    const originalsMap = new Map(
      originals.map((o) => [o._id.toString(), o.evaluation?.overallBand]),
    );

    const improvements: Improvement[] = [];
    for (const rework of reworks) {
      const fromBand = originalsMap.get(rework.reworkOf?.toString() ?? "");
      if (fromBand != null) {
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
    const dailyComment = buildDiagnosticComment(stats, criteriaAverages);

    const analytics = {
      stats,
      criteriaAverages,
      trend,
      improvements,
      dailyComment,
      recentTips: recentTips.slice(0, 6),
      activitySummary,
    };

    const userTarget = target
      ? {
          examDate: target.examDate
            ? new Date(target.examDate).toISOString()
            : null,
          targetBand: target.targetBand ?? 7.5,
          examType: target.examType ?? "academic",
          updatedAt: target.updatedAt,
        }
      : {
          examDate: null,
          targetBand: 7.5,
          examType: "academic",
        };

    const modules: IELTSModule[] = [
      "listening",
      "reading",
      "writing",
      "speaking",
    ];
    const summary: Record<
      string,
      {
        latest: number | null;
        average: number | null;
        count: number;
        history: IMockScore[];
      }
    > = {};

    for (const mod of modules) {
      const modScores = mockScores.filter((s) => s.module === mod);
      const count = modScores.length;
      const latest = count > 0 ? modScores[0].score : null;
      const average =
        count > 0
          ? Math.round(
              (modScores.reduce((acc, s) => acc + s.score, 0) / count) * 2,
            ) / 2
          : null;

      summary[mod] = {
        latest,
        average,
        count,
        history: modScores.slice(0, 5),
      };
    }

    const latestL = summary.listening.latest;
    const latestR = summary.reading.latest;
    const latestW = summary.writing.latest;
    const latestS = summary.speaking.latest;

    let overallLatest: number | null = null;
    if (
      latestL !== null &&
      latestR !== null &&
      latestW !== null &&
      latestS !== null
    ) {
      overallLatest = calculateOverallBand(latestL, latestR, latestW, latestS);
    }

    const avgL = summary.listening.average;
    const avgR = summary.reading.average;
    const avgW = summary.writing.average;
    const avgS = summary.speaking.average;

    let overallAverage: number | null = null;
    if (avgL !== null && avgR !== null && avgW !== null && avgS !== null) {
      overallAverage = calculateOverallBand(avgL, avgR, avgW, avgS);
    }

    const mockSummary = {
      summary,
      overallLatest,
      overallAverage,
      totalLogs: mockScores.length,
    };

    res.json({
      analytics,
      userTarget,
      mockSummary,
    });
  } catch (err) {
    next(err);
  }
}
