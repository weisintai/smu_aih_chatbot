import { NextRequest, NextResponse } from "next/server";
import { SessionsClient } from "@google-cloud/dialogflow-cx";
import type { protos } from "@google-cloud/dialogflow-cx";
import vision from "@google-cloud/vision";
import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
import { fileTypeFromBuffer } from "file-type";
import {
  getOrCreateSessionId,
  setSessionCookies,
} from "@/utils/sessionManagement";
import {
  PROJECT_ID,
  LOCATION_ID,
  AGENT_ID,
  LANGUAGE_CODE,
  SUBDOMAIN_REGION,
} from "@/utils/constants";

interface RequestData {
  query: string;
  file?: File;
}

export async function POST(request: NextRequest) {
  if (!PROJECT_ID || !LOCATION_ID || !AGENT_ID) {
    return NextResponse.json(
      { error: "Missing required environment variables" },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const body = Object.fromEntries(formData);

  const { file } = body as unknown as RequestData;
  let { query } = body as unknown as RequestData;

  if (!query && !file) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  let fileAnalysisResult = null;

  if (file) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileType = await fileTypeFromBuffer(Buffer.from(buffer));

    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];

    if (!fileType || !allowedTypes.includes(fileType.mime)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    if (fileType.mime.startsWith("image")) {
      const client = new vision.ImageAnnotatorClient();
      const [result] = await client.annotateImage({
        image: { content: buffer },
        features: [
          { type: "TEXT_DETECTION" },
          { type: "LABEL_DETECTION" },
          { type: "IMAGE_PROPERTIES" },
          { type: "SAFE_SEARCH_DETECTION" },
        ],
      });
      fileAnalysisResult = {
        text: result.fullTextAnnotation?.text || "",
        labels:
          result.labelAnnotations?.map((label) => label.description) || [],
        dominantColors:
          result.imagePropertiesAnnotation?.dominantColors?.colors?.map(
            (color) => ({
              color: color.color,
              score: color.score,
              pixelFraction: color.pixelFraction,
            })
          ) || [],
        safeSearch: result.safeSearchAnnotation || {},
      };
      console.log("Image analysis result:", fileAnalysisResult);
      query = `**Image Analysis:**

* **Text:** "The image contains the following text: '${fileAnalysisResult.text.replace(
        /\n/g,
        " "
      )}'"
* **Labels:** "The image is labeled as ${fileAnalysisResult.labels.join(", ")}."

**Based on this information, please answer the query: ${query}**`;
    } else if (fileType.mime === "application/pdf") {
      // Handle PDF file (you might want to use a different method or API for PDFs)

      const PROCESSOR_ID = "b993dc6ae36ae59d";

      const client = new DocumentProcessorServiceClient();
      const [pdfAnalysisResult] = await client.processDocument({
        name: `projects/${PROJECT_ID}/locations/${LOCATION_ID}/processors/${PROCESSOR_ID}`,
        inlineDocument: {
          content: buffer.toString("base64"),
          mimeType: "application/pdf",
        },
      });

      if (pdfAnalysisResult) {
        query = `**PDF Analysis:**

* **Text:** "The PDF document contains the following text: '${pdfAnalysisResult.document!.text?.replace(
          /\n/g,
          " "
        )}'"

**Based on this information, please answer the query: ${query}**`;
      }
    }
  }

  const { sessionId } = getOrCreateSessionId(request);

  try {
    const sessionClient = new SessionsClient({
      apiEndpoint: `${SUBDOMAIN_REGION}-dialogflow.googleapis.com`,
    });

    const sessionPath = sessionClient.projectLocationAgentSessionPath(
      PROJECT_ID,
      LOCATION_ID,
      AGENT_ID,
      sessionId
    );

    console.log(query);

    const request: protos.google.cloud.dialogflow.cx.v3.IDetectIntentRequest = {
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
