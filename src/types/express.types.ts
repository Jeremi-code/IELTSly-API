import { Request } from "express";
import { auth } from "../configs/auth.js";

type AuthSession = typeof auth.$Infer.Session;

export interface AuthRequest extends Request {
  user?: AuthSession["user"];
  session?: AuthSession["session"];
}

