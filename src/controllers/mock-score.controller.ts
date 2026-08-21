import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/express.types.js";
import MockScore, { IELTSModule, IMockScore } from "../models/mock-score.model.js";
import { calculateOverallBand, rawToBand } from "../utils/mock-score.utils.js";

/**
 * Fetches user mock scores with optional module filtering.
 * @route GET /api/mock-scores
 * @param {AuthRequest} req Express request object containing authenticated user credentials
 * @param {Response} res Express response object
 * @param {NextFunction} next Express next function
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
 * Creates or updates a mock test score log.
 * @route POST /api/mock-scores
 * @param {AuthRequest} req Express request object containing score payload
 * @param {Response} res Express response object
 * @param {NextFunction} next Express next function
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
      score: Math.round(finalScore * 2) / 2,
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
 * Deletes a logged mock test score entry.
 * @route DELETE /api/mock-scores/:id
 * @param {AuthRequest} req Express request object containing score ID parameter
 * @param {Response} res Express response object
 * @param {NextFunction} next Express next function
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
 * Computes latest & average scores per module alongside official overall IELTS Band score.
 * @route GET /api/mock-scores/summary
 * @param {AuthRequest} req Express request object
 * @param {Response} res Express response object
 * @param {NextFunction} next Express next function
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
