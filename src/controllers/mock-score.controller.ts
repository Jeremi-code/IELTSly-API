import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/express.types.js";
import MockScore, { IELTSModule, IMockScore } from "../models/mock-score.model.js";

// Calculate official IELTS overall band score from 4 module scores
export function calculateOverallBand(
  listening: number,
  reading: number,
  writing: number,
  speaking: number
): number {
  const avg = (listening + reading + writing + speaking) / 4;
  const floor = Math.floor(avg);
  const frac = avg - floor;

  if (frac < 0.25) {
    return floor;
  } else if (frac < 0.75) {
    return floor + 0.5;
  } else {
    return floor + 1.0;
  }
}

// Helper: Convert raw score (out of 40) for Listening / Reading to Band Score
export function rawToBand(raw: number, module: "listening" | "reading"): number {
  if (raw >= 39) return 9.0;
  if (raw >= 37) return 8.5;
  if (raw >= 35) return 8.0;
  if (raw >= 32) return 7.5;
  if (raw >= 30) return 7.0;
  if (raw >= 26) return 6.5;
  if (raw >= 23) return 6.0;
  if (raw >= 18) return 5.5;
  if (raw >= 16) return 5.0;
  if (raw >= 13) return 4.5;
  if (raw >= 10) return 4.0;
  if (raw >= 7) return 3.5;
  if (raw >= 5) return 3.0;
  return 2.0;
}

/**
 * GET /api/mock-scores
 * Query params: module? (listening|reading|writing|speaking)
 */
export async function getMockScores(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { module } = req.query;
    const filter: Record<string, any> = { userId };

    if (module && ["listening", "reading", "writing", "speaking"].includes(module as string)) {
      filter.module = module;
    }

    const scores = await MockScore.find(filter).sort({ testDate: -1, createdAt: -1 });
    res.json({ scores });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/mock-scores
 * Create or update a mock test score
 */
export async function saveMockScore(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { id, module, score, rawCount, totalQuestions, source, testDate, notes } = req.body;

    if (!module || !["listening", "reading", "writing", "speaking"].includes(module)) {
      res.status(400).json({ message: "Valid module is required (listening, reading, writing, speaking)" });
      return;
    }

    let finalScore = Number(score);

    // If rawCount is provided for listening or reading and score isn't valid, calculate band score
    if ((module === "listening" || module === "reading") && rawCount !== undefined && rawCount !== null && (isNaN(finalScore) || finalScore === 0)) {
      finalScore = rawToBand(Number(rawCount), module);
    }

    if (isNaN(finalScore) || finalScore < 0 || finalScore > 9) {
      res.status(400).json({ message: "Valid score between 0.0 and 9.0 is required" });
      return;
    }

    const scoreData = {
      userId,
      module,
      score: Math.round(finalScore * 2) / 2, // Round to nearest 0.5
      rawCount: rawCount !== undefined && rawCount !== null && rawCount !== "" ? Number(rawCount) : undefined,
      totalQuestions: totalQuestions ? Number(totalQuestions) : 40,
      source: source && String(source).trim() ? String(source).trim() : "Practice Test",
      testDate: testDate ? new Date(testDate) : new Date(),
      notes: notes ? String(notes).trim() : undefined,
    };

    if (id) {
      const existing = await MockScore.findOne({ _id: id, userId });
      if (!existing) {
        res.status(404).json({ message: "Score entry not found" });
        return;
      }
      Object.assign(existing, scoreData);
      await existing.save();
      res.json({ score: existing, message: "Mock score updated successfully" });
    } else {
      const newScore = await MockScore.create(scoreData);
      res.status(201).json({ score: newScore, message: "Mock score logged successfully" });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/mock-scores/:id
 */
export async function deleteMockScore(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const deleted = await MockScore.findOneAndDelete({ _id: id, userId });

    if (!deleted) {
      res.status(404).json({ message: "Mock score entry not found" });
      return;
    }

    res.json({ message: "Mock score deleted successfully" });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/mock-scores/summary
 * Computes latest & average scores per module, plus official overall band.
 */
export async function getMockSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const scores: IMockScore[] = await MockScore.find({ userId }).sort({ testDate: -1 });

    const modules: IELTSModule[] = ["listening", "reading", "writing", "speaking"];
    const summary: Record<string, { latest: number | null; average: number | null; count: number; history: IMockScore[] }> = {};

    for (const mod of modules) {
      const modScores = scores.filter((s: IMockScore) => s.module === mod);
      const count = modScores.length;
      const latest = count > 0 ? modScores[0].score : null;
      const average =
        count > 0
          ? Math.round((modScores.reduce((acc: number, s: IMockScore) => acc + s.score, 0) / count) * 2) / 2
          : null;

      summary[mod] = {
        latest,
        average,
        count,
        history: modScores.slice(0, 5),
      };
    }

    // Compute latest overall band if all 4 modules have at least 1 test
    const latestL = summary.listening.latest;
    const latestR = summary.reading.latest;
    const latestW = summary.writing.latest;
    const latestS = summary.speaking.latest;

    let overallLatest: number | null = null;
    if (latestL !== null && latestR !== null && latestW !== null && latestS !== null) {
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

    res.json({
      summary,
      overallLatest,
      overallAverage,
      totalLogs: scores.length,
    });
  } catch (error) {
    next(error);
  }
}
