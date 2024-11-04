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
  enhancedQuery?: string;
}

const generateEnhancedContext = async (
  currentQuery: string,
  history: ChatHistory[],
  generativeModel: GenerativeModel
): Promise<ConversationContext> => {
  const contextPrompt = `
Conversation Analysis Instructions:

{
  "format": "Provide analysis in JSON with keys: summary, keyTopics, userPreferences, enhancedQuery",
  
  "analysisRules": [
    "1. Brief summary of key points",
    "2. Main topics discussed",
    "3. User preferences/details (only from user messages)",
    "4. Exclude language/translation notes",
    "5. Enhanced query construction"
  ],

  "queryEnhancement": {
    "sources": [
      "Current query: ${currentQuery}",
      "Previous assistant message: ${
        history.filter((h) => h.role === "assistant").at(-1)?.message
      }"
    ],
    "rules": [
      "Keep 90% of original query intact",
      "Only add context present in both sources",
      "Match original intent and tone",
      "Write in first-person as user"
    ],
    "avoid": [
      "Context only from history",
      "Changing core request",
      "Adding outside information",
      "Modifying original meaning",
      "Adding unrelated questions"
    ]
  },

  "example": [
      {
      "previousMessage": "You want a plan to pay back your $2000 loan? That's good!
        It's tricky with only $100 savings a month.
        Talk to the moneylenders. Ask about the total cost. This means the total money you need to pay back, including interest and fees.
        Ask about monthly payments. Is this more than your $100 savings?
        Ask what happens if you miss a payment. This is very important!
        Before you borrow, make sure you can pay back the loan. Can you think of ways to increase your savings?",
      "currentQuery": "nope",
      "enhancedQuery": "I could not think about ways to increase my savings. Can you help me with that?"
    },
    {
      "previousMessage": "Okay, no problem! To send money from your DBS app to OCBC, you need two things:
        The OCBC account number
        The amount of money you want to send
        You can't do it without these. The DBS app will guide you after you have this information.
        Do you have a way to get the OCBC account number and the amount you want to send?",
      "currentQuery": "not really",
      "enhancedQuery": "I don't have a way to get the OCBC account number and the amount I want to send. What should I do?"
    }
  ]
}
`;

  try {
    const analysisResponse = await generativeModel.generateContent(
      contextPrompt
    );

    const analysis =
      analysisResponse.response.candidates?.[0]?.content?.parts?.[0]?.text;

    // console.log(analysis);

    if (!analysis) {
      throw new Error("Analysis not generated");
    }

    const jsonMatch = analysis.match(/\{[\s\S]*\}/); // Matches everything between { and }
    if (!jsonMatch) {
      throw new Error("Analysis not in JSON format");
    }

    const { summary, keyTopics, userPreferences, enhancedQuery } = JSON.parse(
      jsonMatch[0]
    );

    return {
      summary,
      recentMessages: history,
      keyTopics,
      userPreferences,
      enhancedQuery,
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

    const vertexAI = new VertexAI({
      project: PROJECT_ID,
      location: "us-central1",
    });

    const generativeModel = vertexAI.getGenerativeModel({
      model: "gemini-1.5-flash-002",
    });

    let context: ConversationContext | null = null;

    if (parsedHistory.length > 0) {
      context = await generateEnhancedContext(
        query,
        parsedHistory,
        generativeModel
      );
    }

    const request: protos.google.cloud.dialogflow.cx.v3.IDetectIntentRequest = {
      session: sessionPath,
      queryInput: {
        text: {
          text: context?.enhancedQuery || query,
        },

        languageCode: LANGUAGE_CODE,
      },
    };

    // console.log(context);

    const [response] = await sessionClient.detectIntent(request);

    const assistantMessage = response.queryResult?.responseMessages?.find(
      (message) => message.text
    )?.text?.text?.[0];

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
Response Guidelines:

1. Core Communication:
  - Match user's language and tone
  - Use simple language
  - Be empathetic and friendly
  - Skip greetings/closings (you're post-processing)
  - Include humour if appropriate
  - Avoid asking for personal information

2. Content Rules:
  - Strip out any content or information that is not relevant to Singapore, and replace it with relevant information.
  - Keep in mind that you are serving migrant workers who are using the DBS bank. DBS is the only bank in Singapore which is actively serving migrant workers. 
    * Do not talk about other bank as majority of the migrant workers do not have a bank account in other banks
  - Preserve technical banking terms exactly
  - Format links as [text](url), no bare URLs
  - Keep phone numbers and email addresses as it is, don't omit them
  - Preserve all technical banking terms exactly as written. 
    * For example, "Transfer Funds to Overseas Account" should not be simplified to "Transfer Money".

3. Response Structure:
  - Use bullet points for clarity
  - Skip previously mentioned information
  - Provide fresh, non-redundant content

4. When using the Vertex AI Agent Response:
  - Follow the Vertex AI Agent Response as a guide, don't deviate too much
    - You can have your judgement if the response is not relevant to the user query
  - Ignore "Sorry something went wrong" responses
  - Create relevant response based on user query

5. Context Management:
  - Only include directly relevant information
  - Skip unrelated context
  - Skip any points/features already mentioned in the previous messages
    * Don't repeat the same information that's already been shared from past assistant messages
  - Avoid repeating the user query in the response
  - Focus on new aspects of topics

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

Avoid mentioning of Vertex AI, act like you're answering the user query directly.
Remember you are talking to migrant workers. Try and include more information that is relevant to them.
`;

    // console.log(`Approximately ${geminiPrompt.length / 4} tokens`);

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
