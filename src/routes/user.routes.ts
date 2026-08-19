import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  getAICredentials,
  saveAICredentials,
  deleteAICredentials,
  getUserTarget,
  saveUserTarget,
  deleteUserTarget,
} from "../controllers/user.controller.js";

const router = Router();

router.use(authenticate);

// AI Credentials
router.get("/ai-credentials", getAICredentials);
router.post("/ai-credentials", saveAICredentials);
router.delete("/ai-credentials", deleteAICredentials);

// Target Exam & Goals
router.get("/target", getUserTarget);
router.put("/target", saveUserTarget);
router.delete("/target", deleteUserTarget);

export default router;
