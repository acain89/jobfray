import "server-only";
import { cookies } from "next/headers";
import jwt, { type JwtPayload } from "jsonwebtoken";

export const WORKER_SESSION_COOKIE = "jobfray_worker_session";

type WorkerSessionPayload = {
  workerId: string;
  username: string;
};

export type WorkerSession = WorkerSessionPayload;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is required.");
  }

  return secret;
}

export function createWorkerSessionToken(payload: WorkerSessionPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: "30d",
  });
}

export async function getWorkerSession(): Promise<WorkerSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(WORKER_SESSION_COOKIE)?.value;

  if (!token) return null;

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;

    if (
      typeof decoded.workerId !== "string" ||
      typeof decoded.username !== "string"
    ) {
      return null;
    }

    return {
      workerId: decoded.workerId,
      username: decoded.username,
    };
  } catch {
    return null;
  }
}