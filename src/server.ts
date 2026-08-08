import express, { Application, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { toNodeHandler } from "better-auth/node";
import connectDB from "./configs/db.js";
import { auth } from "./configs/auth.js";

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(morgan("dev"));

// Better Auth catch-all handler
// Must be mounted BEFORE express.json() so it can parse its own request bodies.
// Express v5 requires `*splat` syntax for wildcard routes.
app.all("/api/auth/*splat", toNodeHandler(auth));

// Apply express.json() for all other application routes
app.use(express.json());

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "OK" });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal Server Error" });
});

// Connect to Database and Start Server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(
      `Server running in ${
        process.env.NODE_ENV || "development"
      } mode on port ${PORT}`
    );
  });
});
