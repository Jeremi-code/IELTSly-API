import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  getMockScores,
  saveMockScore,
  deleteMockScore,
  getMockSummary,
} from "../controllers/mock-score.controller.js";

const router = Router();

router.use(authenticate);

router.get("/summary", getMockSummary);
router.get("/", getMockScores);
router.post("/", saveMockScore);
router.delete("/:id", deleteMockScore);

export default router;
