import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/express.types.js";
import { scrapeQuestions as runScraper } from "../services/scraper.service.js";

/**
 * Triggers scraper job for IELTS question bank updates.
 * @route POST /api/scrape/questions
 * @param {AuthRequest} req Express request
 * @param {Response} res Express response
 * @param {NextFunction} next Express next function
 */
export async function scrapeQuestions(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await runScraper();
    res.json(result);
  } catch (err) {
    next(err);
  }
}
