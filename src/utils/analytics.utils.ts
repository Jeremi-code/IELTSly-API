import type { AnalyticsStats, DailyComment } from "../types/analytics.types.js";

export function round1dp(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildStaticComment(
  stats: Pick<AnalyticsStats, "averageBand" | "evaluatedCount">,
): DailyComment {
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
