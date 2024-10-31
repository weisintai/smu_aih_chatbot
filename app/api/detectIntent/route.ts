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
import { VertexAI, GenerativeModel } from "@google-cloud/vertexai";

interface ConversationContext {
  summary: string;
  recentMessages: ChatHistory[];
  keyTopics: string[];
  userPreferences?: Record<string, string>;
}

const generateEnhancedContext = async (
  history: ChatHistory[],
  generativeModel: GenerativeModel
): Promise<ConversationContext> => {
  const contextPrompt = `
Analyze this conversation and provide:
1. A brief summary of the key points
2. The main topics discussed
3. Any user preferences or important details revealed (only based on the user's messages, don't infer from the assistant's messages)
4. Don't include anything about language or translation

Conversation:
${history.map((chat) => `${chat.role}: ${chat.message}`).join("\n")}

Provide the analysis in JSON format with these keys: "summary", "keyTopics", "userPreferences"
`;

  try {
    const analysisResponse = await generativeModel.generateContent(
      contextPrompt
    );

    const analysis =
      analysisResponse.response.candidates?.[0]?.content?.parts?.[0]?.text;

    console.log(analysis);

    if (!analysis) {
      throw new Error("Analysis not generated");
    }

    const jsonMatch = analysis.match(/\{[\s\S]*\}/); // Matches everything between { and }
    if (!jsonMatch) {
      throw new Error("Analysis not in JSON format");
    }

    const { summary, keyTopics, userPreferences } = JSON.parse(jsonMatch[0]);

    return {
      summary,
      recentMessages: history,
      keyTopics,
      userPreferences,
    };
  } catch (error) {
    console.error("Error generating enhanced context:", error);
    return {
      summary: "",
      recentMessages: history.slice(-3),
      keyTopics: [],
    };
  }
};

const formatRecentHistory = (history: ChatHistory[]) => {
  return history
    .map((chat) => `* **${chat.role}:** "${chat.message.trim()}"`)
    .join("\n");
};

interface RequestData {
  query: string;
  file?: File;
  history: string;
}

interface ChatHistory {
  role: string;
  message: string;
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
  const { history } = body as unknown as RequestData;

  const parsedHistory: ChatHistory[] = JSON.parse(history);

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

    const vertexAI = new VertexAI({
      project: PROJECT_ID,
      location: "us-central1",
    });

    const generativeModel = vertexAI.getGenerativeModel({
      model: "gemini-1.5-flash-002",
    });

    let context: ConversationContext | null = null;

    if (parsedHistory.length > 0) {
      context = await generateEnhancedContext(parsedHistory, generativeModel);
    }

    const geminiPrompt = `
${
  !!context
    ? `**Conversation Context:**
${context.summary}

**Key Topics:** ${context.keyTopics.join(", ")}

**Recent Messages:**
${formatRecentHistory(context.recentMessages)}

`
    : ""
}

**User Query**: "${query}"
**Vertex AI Agent Response**:
"${assistantMessage || ""}"

${
  !!context
    ? `**Instructions**:
Consider the conversation context and key topics above when responding. 
${
  context.userPreferences
    ? `Note these user preferences: ${JSON.stringify(context.userPreferences)}`
    : ""
}`
    : ""
}

With reference from the response from Vertex AI Agent and the chat history, answer the user query
(if the response from Vertex AI Agent is too bad, make your own judgement, and combine it with the response from Vertex AI Agent if it makes sense).

Remember these pointers when crafting your response:
- empathetic reflections of user concerns, followed by clear, fact-supported responses
- friendly and informal communication style
- match the personality and tone to the user's query
- include humor where appropriate
- avoid jargon and technical terms
- if using simple english, use simple english so that the user understands. your user is a migrant worker with minimal knowledge in english language. 
- you're just a postprocessing step, so don't worry about greeting, closing, or other formalities, 
- if agent response contains phone numbers or email addresses, please keep them
- for website links, no bare URLs
  * Use format: [link text](https://example.com)
- Ensure that your responses are short and concised, use pointers if possible. 
- Keep in mind that you are serving migrant workers who are using the DBS bank. DBS is the only bank in Singapore which is actively serving migrant workers. Do not talk about other bank as majority of the migrant workers do not have a bank account in other banks. 
- Ensure that the language of the response matches the language of the user's prompt. If it doesn't, translate it to the language that the user is using.
- Strip out any content or information that is not relevant to Singapore, and replace it with relevant information.
- Don't include information from the context that's not remotely related to the user query or the agent response.
- Ask guiding questions to provide user with information they might need, based on the query and Vertex AI Agent response. (Maximum 1 question)
- Important: Preserve all technical banking terms exactly as written. For example, "Transfer Funds to Overseas Account" should not be simplified to "Transfer Money".

You're talking to migrant workers - keep everything simple and direct!
- Use simple words and short sentences
- Aim for grade level 5-6 (suitable for 10-12 year olds)
- Break complex ideas into simple steps
- Use active voice
- Avoid technical jargon
- Use everyday examples
- Keep sentences under 15 words when possible
- Use bullet points for lists
- Include spaces between ideas
- Explain any necessary complex terms

- Avoid mentioning of Vertex AI, act like you're answering the user query directly.
`;

    console.log(`Approximately ${geminiPrompt.length / 4} tokens`);

    const resp = await generativeModel.generateContent(geminiPrompt);

    const geminiResponse = await resp.response;

    try {
      if (
        response.queryResult?.responseMessages?.[0]?.text?.text &&
        geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text
      ) {
        response.queryResult.responseMessages[0].text.text[0] = geminiResponse
          .candidates[0].content.parts[0].text as string;
      }
    } catch (error) {
      console.error("Error updating response:", error);
    }

    const nextResponse = NextResponse.json({
      vertexAgentResponse: assistantMessage,
      geminiResponse: geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text,
    });

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
