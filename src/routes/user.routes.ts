import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  getAICredentials,
  saveAICredentials,
  deleteAICredentials,
} from "../controllers/user.controller.js";

const router = Router();

router.use(authenticate);

router.get("/ai-credentials", getAICredentials);
router.post("/ai-credentials", saveAICredentials);
router.delete("/ai-credentials", deleteAICredentials);

export default router;
