import { Router } from "express";
import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "../configs/auth.js";
import { register, login } from "../controllers/auth.controller.js";

const router = Router();
const jsonParser = express.json();

router.post("/register", jsonParser, register);
router.post("/login", jsonParser, login);

// Better Auth catch-all route (handled without global json parser)
router.all("/*", toNodeHandler(auth));

export default router;

