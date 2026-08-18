import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  getAnalytics,
  getActivitySummary,
} from "../controllers/analytics.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", getAnalytics);
router.get("/activity", getActivitySummary);

export default router;
