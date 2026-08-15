import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  listQuestions,
  getCategories,
  getRandomQuestion,
  getQuestion,
  createQuestion,
} from "../controllers/question.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", listQuestions);
router.get("/categories", getCategories);
router.get("/random", getRandomQuestion);
router.get("/:id", getQuestion);
router.post("/", createQuestion);

export default router;
