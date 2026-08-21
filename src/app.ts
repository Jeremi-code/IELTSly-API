import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./configs/auth.js";
import essayRoutes from "./routes/essay.routes.js";
import questionRoutes from "./routes/question.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import scrapeRoutes from "./routes/scrape.routes.js";
import userRoutes from "./routes/user.routes.js";
import mockScoreRoutes from "./routes/mock-score.route.js";

export const app: Application = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  }),
);
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "OK" });
});

app.use("/api/essays", essayRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/scrape", scrapeRoutes);
app.use("/api/user", userRoutes);
app.use("/api/mock-scores", mockScoreRoutes);

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    message: err.message || "Internal Server Error",
  });
});
