import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../configs/auth.js";
import { AuthRequest } from "../types/express.types.js";

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  // 1. Try Better Auth session validation first
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (session) {
      req.user = session.user;
      req.session = session.session;
      next();
      return;
    }
  } catch (error) {
    // Ignore Better Auth error and attempt legacy JWT check
  }

  // 2. Fallback to legacy JWT verification
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
      return;
    } catch (error) {
      res.status(401).json({ message: "Invalid token" });
      return;
    }
  }

  res.status(401).json({ message: "Authorization token missing or invalid" });
};

