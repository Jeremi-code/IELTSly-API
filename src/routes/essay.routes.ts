import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  createEssay,
  listEssays,
  getEssay,
  updateEssay,
  evaluateEssay,
  reworkEssay,
} from "../controllers/essay.controller.js";

const router = Router();

router.use(authenticate);

router.post("/", createEssay);
router.get("/", listEssays);
router.get("/:id", getEssay);
router.put("/:id", updateEssay);
router.post("/:id/evaluate", evaluateEssay);
router.post("/:id/rework", reworkEssay);

export default router;
