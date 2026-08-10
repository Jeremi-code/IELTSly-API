import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  listQuestions,
  getQuestion,
  createQuestion,
} from "../controllers/question.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", listQuestions);
router.get("/:id", getQuestion);
router.post("/", createQuestion);

export default router;
