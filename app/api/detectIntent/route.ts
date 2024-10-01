import { NextRequest, NextResponse } from "next/server";
import { SessionsClient } from "@google-cloud/dialogflow-cx";
import {
  getOrCreateSessionId,
  setSessionCookies,
} from "@/utils/sessionManagement";
import {
  PROJECT_ID,
  LOCATION_ID,
  AGENT_ID,
  LANGUAGE_CODE,
} from "@/utils/constants";

interface RequestData {
  query: string;
}

export async function POST(request: NextRequest) {
  const body: RequestData = await request.json();
  const { query } = body;

  if (!PROJECT_ID || !LOCATION_ID || !AGENT_ID) {
    return NextResponse.json(
      { error: "Missing required environment variables" },
      { status: 500 }
    );
  }

  const { sessionId } = getOrCreateSessionId(request);

  try {
    const sessionClient = new SessionsClient({
      apiEndpoint: `${process.env.GCLOUD_SUBDOMAIN_REGION}-dialogflow.googleapis.com`,
    });

    const sessionPath = sessionClient.projectLocationAgentSessionPath(
      PROJECT_ID,
      LOCATION_ID,
      AGENT_ID,
      sessionId
    );

    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: query,
        },
        languageCode: LANGUAGE_CODE,
      },
    };

    const [response] = await sessionClient.detectIntent(request);

    const nextResponse = NextResponse.json(response);

    setSessionCookies(nextResponse, sessionId);

    return nextResponse;
  } catch (error) {
    console.error("Error detecting intent:", error);
    return NextResponse.json(
      { error: "Failed to detect intent" },
      { status: 500 }
    );
  }
}
