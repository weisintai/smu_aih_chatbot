import { NextRequest, NextResponse } from "next/server";
import { SessionsClient } from "@google-cloud/dialogflow-cx";
import {
  getOrCreateSessionId,
  setSessionCookies,
} from "@/utils/sessionManagement";

interface RequestData {
  query: string;
}

export async function POST(request: NextRequest) {
  const body: RequestData = await request.json();
  const { query } = body;

  const projectId = process.env.GCLOUD_PROJECT_ID;
  const locationId = process.env.GCLOUD_REGION_ID;
  const agentId = process.env.GCLOUD_AGENT_ID;
  const languageCode = "en";

  if (!projectId || !locationId || !agentId) {
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
      projectId,
      locationId,
      agentId,
      sessionId
    );

    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: query,
        },
        languageCode,
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
