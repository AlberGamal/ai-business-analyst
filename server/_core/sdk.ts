import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

type SessionPayload = { openId: string; name: string };

function sessionSecret() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is required for local authentication.");
  return new TextEncoder().encode(ENV.cookieSecret);
}

async function verifySession(cookieValue: string | undefined) {
  if (!cookieValue) return null;
  try {
    const { payload } = await jwtVerify(cookieValue, sessionSecret(), { algorithms: ["HS256"] });
    return typeof payload.openId === "string" && typeof payload.name === "string"
      ? { openId: payload.openId, name: payload.name }
      : null;
  } catch {
    return null;
  }
}

class LocalSessionService {
  async createSessionToken(openId: string, options: { expiresInMs?: number; name?: string } = {}) {
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    return new SignJWT({ openId, name: options.name ?? "" } satisfies SessionPayload)
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(Math.floor((Date.now() + expiresInMs) / 1000))
      .sign(sessionSecret());
  }

  async authenticateRequest(req: Request): Promise<User> {
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const session = await verifySession(cookies[COOKIE_NAME]);
    if (!session) throw ForbiddenError("Invalid session cookie");
    const user = await db.getUserByOpenId(session.openId);
    if (!user) throw ForbiddenError("User not found");
    await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
    return user;
  }
}

export const sdk = new LocalSessionService();
