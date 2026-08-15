import { Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../configs/auth.js";
import { AuthRequest } from "../types/express.types.js";

/**
 * Authentication middleware using Better Auth session validation.
 * Validates the session cookie set by Better Auth and attaches
 * the user and session objects to the request.
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
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
    // Session validation failed
  }

  res.status(401).json({ message: "Unauthorized — no valid session" });
};
