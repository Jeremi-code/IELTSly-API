import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { getDashboardBundle } from "../controllers/dashboard.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", getDashboardBundle);

export default router;
