import express, { Application, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import connectDB from "./configs/db.js";
import authRoutes from "./routes/auth.routes.js";

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

// Routes - Mount auth routes BEFORE express.json() is applied globally
// to prevent express.json() from consuming the body stream for Better Auth
app.use("/api/auth", authRoutes);

// Apply express.json() for all subsequent routes
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
