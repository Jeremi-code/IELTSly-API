import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { getAnalytics } from "../controllers/analytics.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", getAnalytics);

export default router;
