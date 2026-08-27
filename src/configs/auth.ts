import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/ieltsly";
const client = new MongoClient(mongoUri);

client.connect().catch((err) => {
  console.error("Failed to connect MongoDB client for Better Auth:", err);
});

const db = client.db();

const isProduction = process.env.NODE_ENV === "production";
const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:5000",
  database: mongodbAdapter(db, { client }),
  trustedOrigins: [frontendUrl],
  advanced: {
    useSecureCookies: isProduction,
    crossSubdomainCookies: {
      enabled: false,
    },
    defaultCookieAttributes: isProduction
      ? {
          sameSite: "none" as const,
          secure: true,
        }
      : {},
  },
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
});
