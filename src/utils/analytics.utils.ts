import type {
  AnalyticsStats,
  CriteriaAverages,
  DailyComment,
} from "../types/analytics.types.js";

export function round1dp(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildDiagnosticComment(
  stats: Pick<AnalyticsStats, "averageBand" | "evaluatedCount">,
  criteriaAverages?: CriteriaAverages,
): DailyComment {
  if (stats.evaluatedCount === 0) {
    return {
      text: "Welcome to IELTSly! Submit your first essay to unlock personalized 4-pillar diagnostics and band tracking.",
      tone: "neutral",
    };
  }

  if (criteriaAverages) {
    const scores = [
      { name: "Task Response", code: "TR", score: criteriaAverages.ta },
      { name: "Coherence & Cohesion", code: "CC", score: criteriaAverages.cc },
      { name: "Lexical Resource", code: "LR", score: criteriaAverages.lr },
      { name: "Grammatical Range", code: "GRA", score: criteriaAverages.gra },
    ].filter((s) => s.score > 0);

    if (scores.length > 1) {
      scores.sort((a, b) => a.score - b.score);
      const lowest = scores[0];
      const highest = scores[scores.length - 1];

      if (lowest.score < highest.score) {
        return {
          text: `Your strongest performance is in ${highest.name} (${highest.score.toFixed(1)}). Focus on boosting ${lowest.name} (${lowest.score.toFixed(1)}) to push your overall average to Band ${(stats.averageBand + 0.5).toFixed(1)}+.`,
          tone: stats.averageBand >= 7.0 ? "positive" : "push",
        };
      }
    }
  }

  if (stats.averageBand >= 7.5) {
    return {
      text: `Outstanding performance! Your average of Band ${stats.averageBand.toFixed(1)} demonstrates very strong mastery. Maintain sentence variety and precision to achieve Band 8.5+.`,
      tone: "positive",
    };
  }

  if (stats.averageBand >= 6.5) {
    return {
      text: `Solid momentum with an average of Band ${stats.averageBand.toFixed(1)}. Focus on paragraph structure and complex sentence accuracy to cross into the Band 7.5+ range.`,
      tone: "positive",
    };
  }

  return {
    text: `You're making steady progress at Band ${stats.averageBand.toFixed(1)}. Consistent practice targeting task structure and clear topic sentences will yield fast score gains.`,
    tone: "push",
  };
}
