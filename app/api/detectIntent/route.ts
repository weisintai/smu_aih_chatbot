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
import { VertexAI } from "@google-cloud/vertexai";

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
  let base64File = null;
  let fileType = null;

  if (file) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fileType = await fileTypeFromBuffer(Buffer.from(buffer));
    base64File = buffer.toString("base64");

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
          content: base64File,
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

    const assistantMessage = response.queryResult?.responseMessages?.find(
      (message) => message.text
    )?.text?.text?.[0];

    console.log("Assistant response:", assistantMessage);

    const vertexAI = new VertexAI({
      project: PROJECT_ID,
      location: "us-central1",
    });

    const generativeModel = vertexAI.getGenerativeModel({
      model: "gemini-1.5-flash-002",
    });

    const geminiPrompt = `
    **Prompt:**

**User Query:** "${query}"

**Vertex AI Agent Response:**

${assistantMessage || ""}

**Instructions:**
With reference from the response from Vertex AI Agent, answer the user query (do not trust the response fully, make your own judgement, and combine it with the response from Vertex AI Agent if it makes sense).

Remember these pointers when crafting your response:
- empathetic reflections of user concerns, followed by clear, fact-supported responses
- friendly and informal communication style
- match the personality and tone to the user's query
- include humor where appropriate
- avoid jargon and technical terms
- you're just a postprocessing step, so don't worry about greeting, closing, or other formalities, 
- don't mention about Vertex AI, act like you're answering the user query directly
- no need to ask follow-up questions if the vertex AI response already covers the query well
- if agent response contains phone numbers or email addresses, please keep them

Response in user query's language (IMPORTANT), with a slight Singapore local touch (where appropriate, no need to force it in every response), 
and must keep it short and concise as it is for migrant workers. (Best to keep it within 1-2 sentences)
`;

    // console.log(geminiPrompt);

    const resp = await generativeModel.generateContent(
      // base64File && fileType
      //   ? {
      //       contents: [
      //         {
      //           role: "user",
      //           parts: [
      //             {
      //               inlineData: {
      //                 data: base64File,
      //                 mimeType: fileType.mime,
      //               },
      //             },
      //             {
      //               text: geminiPrompt,
      //             },
      //           ],
      //         },
      //       ],
      //     }
      // :
      geminiPrompt
    );

    const contentResponse = await resp.response;

    try {
      if (
        response.queryResult?.responseMessages?.[0]?.text?.text &&
        contentResponse.candidates?.[0]?.content?.parts?.[0]?.text
      ) {
        response.queryResult.responseMessages[0].text.text[0] = contentResponse
          .candidates[0].content.parts[0].text as string;
      }
    } catch (error) {
      console.error("Error updating response:", error);
    }

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
