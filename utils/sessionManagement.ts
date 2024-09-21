import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

const SESSION_COOKIE_NAME = "dialogflow_session_id";
const SESSION_EXPIRY_COOKIE_NAME = "dialogflow_session_expiry";
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds

function generateCompliantSessionId(): string {
  // UUID v4 is 36 characters long, which is 36 bytes when encoded in UTF-8
  return uuidv4();
}

export function getOrCreateSessionId(request: NextRequest): {
  sessionId: string;
  isNew: boolean;
} {
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessionExpiry = request.cookies.get(SESSION_EXPIRY_COOKIE_NAME)?.value;

  if (sessionId && sessionExpiry) {
    const expiryTime = parseInt(sessionExpiry, 10);
    if (Date.now() < expiryTime) {
      return { sessionId, isNew: false };
    }
  }

  // Generate a new session ID
  return { sessionId: generateCompliantSessionId(), isNew: true };
}

export function setSessionCookies(
  response: NextResponse,
  sessionId: string
): void {
  const expiryTime = Date.now() + INACTIVITY_TIMEOUT;

  response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: INACTIVITY_TIMEOUT / 1000, // Convert to seconds
  });

  response.cookies.set(SESSION_EXPIRY_COOKIE_NAME, expiryTime.toString(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: INACTIVITY_TIMEOUT / 1000,
  });
}
