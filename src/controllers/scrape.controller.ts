import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/express.types.js";
import { scrapeQuestions as runScraper } from "../services/scraper.service.js";

// ── POST /api/scrape/questions ──────────────────────────────────────
export async function scrapeQuestions(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await runScraper();
    res.json(result);
  } catch (err) {
    next(err);
  }
}
