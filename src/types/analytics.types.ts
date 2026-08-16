export interface AnalyticsStats {
  totalAttempts: number;
  evaluatedCount: number;
  averageBand: number;
  bestBand: number;
  task1Average: number;
  task2Average: number;
  inProgressCount: number;
  avgWordCount?: number;
  avgDurationSec?: number;
}

export interface CriteriaAverages {
  ta: number;
  cc: number;
  lr: number;
  gra: number;
}

export interface TrendPoint {
  id: unknown;
  date: Date;
  band: number;
  type: string;
}

export interface Improvement {
  originalId: unknown;
  reworkId: unknown;
  fromBand: number;
  toBand: number;
  delta: number;
  date: Date;
}

export type CommentTone = "positive" | "neutral" | "push";

export interface DailyComment {
  text: string;
  tone: CommentTone;
}

export interface AnalyticsPayload {
  stats: AnalyticsStats;
  criteriaAverages: CriteriaAverages;
  trend: TrendPoint[];
  improvements: Improvement[];
  dailyComment: DailyComment;
  recentTips?: string[];
}
