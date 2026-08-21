import { Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../configs/auth.js";
import { AuthRequest } from "../types/express.types.js";

/**
 * Authentication middleware using Better Auth session validation.
 * @param {AuthRequest} req Express request containing authorization headers
 * @param {Response} res Express response
 * @param {NextFunction} next Express next function
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
    // Handled below by returning 401
  }

  res.status(401).json({ message: "Unauthorized — no valid session" });
};
