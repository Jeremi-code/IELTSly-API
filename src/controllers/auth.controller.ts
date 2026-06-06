import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { auth } from "../configs/auth.js";

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, firstName, lastName } = req.body;

    const result = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: `${firstName || ""} ${lastName || ""}`.trim() || email.split("@")[0],
        firstName,
        lastName,
      },
      headers: new Headers(req.headers as any),
    });

    if (!result) {
      res.status(400).json({ message: "Registration failed" });
      return;
    }

    const token = jwt.sign({ id: result.user.id }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN as any,
    });

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      },
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const result = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
      headers: new Headers(req.headers as any),
    });

    if (!result) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const token = jwt.sign({ id: result.user.id }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN as any,
    });

    res.json({
      message: "Login successful",
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      },
    });
  } catch (error: any) {
    res.status(401).json({ message: "Invalid credentials" });
  }
};

