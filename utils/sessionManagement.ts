import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

const SESSION_COOKIE_NAME = "dialogflow_session_id";
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds

function generateCompliantSessionId(): string {
  // UUID v4 is 36 characters long, which is 36 bytes when encoded in UTF-8
  return uuidv4();
}

export function getOrCreateSessionId(request: NextRequest): string {
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const lastActivity = request.cookies.get("last_activity")?.value;

  if (sessionId && lastActivity) {
    const lastActivityTime = new Date(lastActivity).getTime();
    if (Date.now() - lastActivityTime < INACTIVITY_TIMEOUT) {
      return sessionId;
    }
  }

  // Generate a new compliant session ID
  return generateCompliantSessionId();
}

export function updateSessionActivity(
  response: NextResponse,
  sessionId: string
): void {
  response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60, // 1 week
  });
  response.cookies.set("last_activity", new Date().toISOString(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60, // 1 week
  });
}
