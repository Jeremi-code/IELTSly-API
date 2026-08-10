import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { scrapeQuestions } from "../controllers/scrape.controller.js";

const router = Router();

router.use(authenticate);

router.post("/questions", scrapeQuestions);

export default router;
