import { NextRequest, NextResponse } from "next/server";
import ky from "ky";
import { getAccessToken } from "@/utils/googleAuth";
import {
  getOrCreateSessionId,
  setSessionCookies,
} from "@/utils/sessionManagement";

interface RequestData {
  query: string;
}

interface DialogflowResponse {
  queryResult: {
    intent: {
      displayName: string;
    };
    fulfillmentText: string;
  };
}

export async function POST(request: NextRequest) {
  const body: RequestData = await request.json();
  const { query } = body;

  const projectId = process.env.GCLOUD_PROJECT_ID;
  const subdomainRegion = process.env.GCLOUD_SUBDOMAIN_REGION;
  const regionId = process.env.GCLOUD_REGION_ID;
  const agentId = process.env.GCLOUD_AGENT_ID;

  if (!projectId || !subdomainRegion || !regionId || !agentId) {
    return NextResponse.json(
      { error: "Missing required environment variables" },
      { status: 500 }
    );
  }

  const { sessionId } = getOrCreateSessionId(request);

  try {
    const accessToken = await getAccessToken();

    const url = `https://${subdomainRegion}-dialogflow.googleapis.com/v3/projects/${projectId}/locations/${regionId}/agents/${agentId}/sessions/${sessionId}:detectIntent`;

    const response: DialogflowResponse = await ky
      .post(url, {
        json: {
          queryInput: { text: { text: query }, languageCode: "en" },
          queryParams: { timeZone: "Asia/Singapore" },
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-goog-user-project": projectId,
          "Content-Type": "application/json; charset=utf-8",
        },
      })
      .json();

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
