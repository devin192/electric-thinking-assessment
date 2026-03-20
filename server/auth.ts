import { Request, Response, NextFunction } from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";

const PgSession = connectPgSimple(session);

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

export async function setupAuth(app: any) {
  // Create session table if it doesn't exist (avoid connect-pg-simple's file-based approach)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    ) WITH (OIDS=FALSE);
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);

  const sessionConfig: any = {
    store: new PgSession({
      pool: pool,
      tableName: "session",
    }),
    secret: (() => {
      const secret = process.env.SESSION_SECRET;
      if (!secret) {
        throw new Error("SESSION_SECRET environment variable is required. Set it in your Railway environment variables.");
      }
      return secret;
    })(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
    },
  };

  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", true);
    sessionConfig.proxy = true;
    sessionConfig.cookie.secure = true;
  }

  app.use(session(sessionConfig));
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePasswords(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  storage.getUser(req.session.userId).then(user => {
    if (!user || user.userRole !== "system_admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  }).catch(() => res.status(500).json({ message: "Internal error" }));
}

export async function getCurrentUser(req: Request): Promise<User | undefined> {
  if (!req.session.userId) return undefined;
  return storage.getUser(req.session.userId);
}
