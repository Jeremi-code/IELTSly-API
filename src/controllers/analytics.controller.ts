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
} from "../types/analytics.types.js";

/**
 * Computes performance analytics, criteria averages, trend data, and study streak stats.
 * All database aggregations run concurrently via Promise.all for maximum speed.
 * @route GET /api/analytics
 * @param {AuthRequest} req Express request object containing user context
 * @param {Response} res Express response object
 * @param {NextFunction} next Express next function
 */
export async function getAnalytics(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;

    // Execute all independent queries in parallel to eliminate database latency
    const [
      [statsResult],
      [performanceResult],
      taskAvgs,
      [criteriaResult],
      trendDocs,
      recentEvaluations,
      reworks,
      dailyActivitiesRaw,
    ] = await Promise.all([
      // 1. Overall essay attempt & evaluation statistics
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

      // 2. Average writing speed and word counts
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

      // 3. Task 1 vs Task 2 band averages
      Essay.aggregate([
        { $match: { user: userId, status: EssayStatus.Evaluated } },
        { $group: { _id: "$type", avg: { $avg: "$evaluation.overallBand" } } },
      ]),

      // 4. IELTS 4-pillar criteria averages (TA, CC, LR, GRA)
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

      // 5. Recent 10 evaluated essays for band score trajectory
      Essay.find({
        user: userId,
        status: EssayStatus.Evaluated,
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .select("_id createdAt evaluation.overallBand type")
        .lean(),

      // 6. Recent examiner tips for recommendations
      Essay.find({
        user: userId,
        status: EssayStatus.Evaluated,
        "evaluation.tips": { $exists: true, $not: { $size: 0 } },
      })
        .sort({ createdAt: -1 })
        .limit(6)
        .select("evaluation.tips")
        .lean(),

      // 7. Reworked essays
      Essay.find({
        user: userId,
        reworkOf: { $exists: true, $ne: null },
        status: EssayStatus.Evaluated,
      })
        .select("_id reworkOf evaluation.overallBand createdAt")
        .lean(),

      // 8. Heatmap study activity matrix
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
    ]);

    // Build stats object
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

    // Batch query original essays for reworks (eliminating N+1 loop)
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

/**
 * Returns user study activity matrix and streak breakdown.
 * @route GET /api/analytics/activity
 * @param {AuthRequest} req Express request object
 * @param {Response} res Express response object
 * @param {NextFunction} next Express next function
 */
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
