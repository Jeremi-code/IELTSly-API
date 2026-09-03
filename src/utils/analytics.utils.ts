import type {
  AnalyticsStats,
  CriteriaAverages,
  DailyComment,
} from "../types/analytics.types.js";

/**
 * Rounds a number to one decimal place.
 * @param {number} n Input number
 * @returns {number} Rounded number
 */
export function round1dp(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Builds a diagnostic study guidance comment based on criteria performance.
 * Returns null if no evaluated essays exist.
 * @param {Pick<AnalyticsStats, "averageBand" | "evaluatedCount">} stats Analytics stats
 * @param {CriteriaAverages} [criteriaAverages] Per-criteria average band scores
 * @returns {DailyComment | null} Diagnostic comment object or null if zero essays
 */
export function buildDiagnosticComment(
  stats: Pick<AnalyticsStats, "averageBand" | "evaluatedCount">,
  criteriaAverages?: CriteriaAverages,
): DailyComment | null {
  if (stats.evaluatedCount === 0) {
    return null;
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

/**
 * Calculates active study days, streak counts, and aggregate duration.
 * @param {Record<string, { count: number; durationSec: number; wordCount: number; bandSum: number; bandCount: number }>} activitiesMap Daily activity dictionary
 * @returns Activity matrix summary object
 */
export function calculateStreakAndStats(
  activitiesMap: Record<
    string,
    {
      count: number;
      durationSec: number;
      wordCount: number;
      bandSum: number;
      bandCount: number;
    }
  >,
) {
  const dates = Object.keys(activitiesMap).sort();
  if (dates.length === 0) {
    return {
      activities: [],
      currentStreak: 0,
      longestStreak: 0,
      totalActiveDays: 0,
      totalDurationSec: 0,
      totalEssays: 0,
    };
  }

  const activities = dates.map((d) => {
    const item = activitiesMap[d];
    return {
      date: d,
      count: item.count,
      durationSec: item.durationSec,
      wordCount: item.wordCount,
      avgBand:
        item.bandCount > 0 ? round1dp(item.bandSum / item.bandCount) : null,
    };
  });

  const totalActiveDays = dates.length;
  const totalDurationSec = activities.reduce(
    (acc, a) => acc + a.durationSec,
    0,
  );
  const totalEssays = activities.reduce((acc, a) => acc + a.count, 0);

  let longestStreak = 0;
  let currentRun = 0;
  let prevDate: Date | null = null;

  for (const dateStr of dates) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const currentDate = new Date(Date.UTC(y, m - 1, d));

    if (!prevDate) {
      currentRun = 1;
    } else {
      const diffMs = currentDate.getTime() - prevDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        currentRun += 1;
      } else if (diffDays > 1) {
        currentRun = 1;
      }
    }
    prevDate = currentDate;
    if (currentRun > longestStreak) {
      longestStreak = currentRun;
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const todayUtc = new Date(Date.UTC(ty, tm - 1, td));
  const yesterdayUtc = new Date(todayUtc.getTime() - 86400000);
  const yesterdayStr = yesterdayUtc.toISOString().slice(0, 10);

  let currentStreak = 0;
  const dateSet = new Set(dates);

  let checkDate = dateSet.has(todayStr)
    ? todayUtc
    : dateSet.has(yesterdayStr)
      ? yesterdayUtc
      : null;

  if (checkDate) {
    while (true) {
      const checkStr = checkDate.toISOString().slice(0, 10);
      if (dateSet.has(checkStr)) {
        currentStreak += 1;
        checkDate = new Date(checkDate.getTime() - 86400000);
      } else {
        break;
      }
    }
  }

  return {
    activities,
    currentStreak,
    longestStreak,
    totalActiveDays,
    totalDurationSec,
    totalEssays,
  };
}
