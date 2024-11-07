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
  let contextPrompt;

  if (history.length > 0) {
    contextPrompt = `
**Conversation:**
${history.map((chat) => `${chat.role}: ${chat.message}`).join("\\n")}}

---

**Conversation Analysis Instructions:**

You are to analyze the above conversation and provide an analysis in JSON format.

**Output Format:**

Provide the analysis in **JSON** with the following keys:

- **summary**: Brief summary of the key points discussed in the conversation.
- **keyTopics**: Main topics that were covered.
- **userPreferences**: Any user preferences or details mentioned (only from role: user, avoid taking details from role:assistant).
- **enhancedQuery**: An enhanced version of the current query, following specific rules.

**Analysis Rules:**

1. **Summary**: Provide a brief summary of the key points.
2. **Key Topics**: Identify the main topics discussed.
3. **User Preferences**: Extract any user preferences or details from the user's messages.
4. **Exclude Language/Translation Notes**: Do not include any language or translation notes in the analysis.
5. **Enhanced Query Construction**: Construct an enhanced query without overwriting the original query.

**Enhanced Query Instructions:**

You will construct the **enhancedQuery** based on the following sources:

- **Current Query**: '${currentQuery}'
- **Previous Assistant Message**: '${
      history.filter((h) => h.role === "assistant").at(-1)?.message || ""
    }'

**Important Rules for Enhanced Query:**

- **Do Not Return the Same Query as Previous Message**: Ensure that the enhanced query is not the same as the previous assistant's message.
- **Translation**: Translate the current query to English if necessary, without adding any additional context.
- **Maintain Original Meaning**: Keep the exact meaning of the original query.
- **No Additional Information**: Do not add information from previous context.
- **No Interpretation or Expansion**: Do not interpret or expand the meaning.
- **Same Level of Detail**: Maintain the same level of detail as the original.
- **Simplicity**: Keep simple responses simple.
- **Minimal Translation**: If the original is one word, the translation should be minimal.
- **No Elaboration**: Do not elaborate beyond direct translation.
- **First Person**: Always write in first person when translating.
- **Preserve Tone and Formality**: Preserve the original tone and formality level.
- **Nonsensical Queries**: If the original query does not make sense, do not rely on the previous query.

**Enhancement Steps:**

1. **Check if Translation is Needed**: Determine if the current query needs translation to English.
2. **Direct Translation**: If translation is needed, translate directly without adding context.
3. **Keep Original if Not**: If no translation is needed, keep the original exactly as it is.
4. **Verify No Additional Information Added**: Ensure that no extra information has been included.
5. **Core Message Unchanged**: Confirm that the core message remains unchanged.

**Examples:**

- **Example 1:**
  - **Previous Message**: "您想了解我们的投资产品吗？"
  - **Current Query**: "好的请介绍"
  - **Enhanced Query**: "Yes, please introduce"
  - **Note**: ✅ Good example - keeps original message intact.

- **Example 2:**
  - **Previous Message**: "What's your desired budget range?"
  - **Current Query**: "cheap"
  - **Enhanced Query**: "cheap"
  - **Note**: ✅ Good example - keeps original message unchanged.

- **Example 3:**
  - **Previous Message**: "你可以用DBS digibank app转钱。你要转本地钱还是海外钱?"
  - **Current Query**: "中国"
  - **Enhanced Query**: "China"
  - **Note**: ✅ Good example - simple translation only.

- **Example 4:**
  - **Previous Message**: "How much do you want to save?"
  - **Current Query**: "idk"
  - **Enhanced Query**: "China"
  - **Note**: ❌ Bad example - Do not just copy the previous user message if you don't understand the query.

**Additional Notes:**

- **Do Not Return Same Query as Previous Message**: Ensure the enhanced query is not identical to the previous assistant's message.
- **Consistency**: Keep the enhanced query consistent with the original query's intent and content.

---

**Your Task:**

Analyze the conversation above and provide the JSON output as per the instructions.

`;
  } else {
    contextPrompt = `
    "format": "Provide analysis in JSON with keys: enhancedQuery",
    "queryEnhancement": {
      "sources": [
        "Current query: ${currentQuery}",
      ],
      "rules": [
        "Translate the Current Query to English",
        "If it's already in English, leave it as is",
        "Just give the translated query, don't give explaination of what the query means",
      ]
    }
    `;
  }

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
      summary: summary ?? null,
      recentMessages: history,
      keyTopics: keyTopics ?? null,
      userPreferences: userPreferences ?? null,
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

    context = await generateEnhancedContext(
      query,
      parsedHistory,
      generativeModel
    );

    // console.log(context);

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
  context
    ? `
**Conversation Context:**
- Summary: ${context.summary}
- Key Topics: ${context.keyTopics?.join(", ")}

**Recent Messages:**
${formatRecentHistory(context.recentMessages)}
`
    : ""
}

**User Query:**
"${query}"

**Assistant Response:**
"${assistantMessage || "NO ASSISTANT RESPONSE"}"

${
  context && context.userPreferences
    ? `
**User Preferences:**
${JSON.stringify(context.userPreferences)}
`
    : ""
}

**Instructions:**

You are a post-processing agent. With reference to the **User Query** and the **Assistant Response**, produce a final response that:

- **Language and Tone**:
  - Ensure the response matches the language of the **User Query**.
    - Strictly follow the language used in the **User Query**.
    - Do not mix languages (e.g., do not combine English and Chinese).
    - If the **Assistant Response** is in English but the **User Query** is not, translate the response to the language of the **User Query**.
  - Use simple words and short sentences (aim for grade level 5-6, suitable for 10-12-year-olds).
  - Employ a friendly and informal communication style.
  - Match the personality and tone to the user's query.
  - Include humor where appropriate.
  - Use active voice and avoid technical jargon.
  - Keep sentences under 15 words when possible.
  - Break complex ideas into simple steps.
  - Use bullet points for lists and include spaces between ideas.
  - **Example:**
    - **User Query**: "不用了我爱你"
    - **Final Response**: "爱你！❤️ Anything else I can help you with today? Need more help sending money to China using Alipay and DBS digibank?
      Remember these easy steps:

      Open your DBS digibank app.
      Tap "Pay & Transfer", then "Overseas".
      Choose Alipay.
      Double-check the Alipay account uses a Mainland China mobile number starting with +86.
      You can send up to CNY 50,000 each time, five times a month. Your yearly limit is CNY 500,000.
      It’s only for personal use.
      Let me know if you need more help!"
    - **Note**: ❌ Bad example - Do not mix languages in the response, follow the language of the user query strictly. And do not include unnecessary information.

- **Content Guidelines**:
  - Consider the conversation context and key topics when responding.
  - Note any user preferences: ${
    context && context.userPreferences
      ? JSON.stringify(context.userPreferences)
      : "None"
  }.
  - Keep in mind you are serving migrant workers who use DBS bank in Singapore.
    - Do not mention other banks; focus on DBS as it's the primary bank for migrant workers in Singapore.
  - Strip out any content or information not relevant to Singapore and replace it with relevant information.
    - Do not use terms from other countries (e.g., "USD") unless it's mentioned in the **Assistant Response**.
    - Only include information pertinent to Singapore migrant workers.
  - Do not include information from the context that's not related to the **User Query** or the **Assistant Response**.
  - Preserve all technical banking terms exactly as written.
    - For example, do not simplify "Transfer Funds to Overseas Account" to "Transfer Money".
  - If the **Assistant Response** contains a phone number, email address, or URL, include it in the response.
    - Use the format: [link text](https://example.com).
    - Only include URLs if they are present in the **Assistant Response**.
  - If the **Assistant Response** has a relevant question, enhance and include it in your response.
    - Do not force a question into the response if it's not essential to the **User Query**.
  - Do not mention or reference the **Assistant Response** explicitly.
    - Ignore phrases like "Sorry something went wrong, can you repeat?" or similar.
  - Do not include the **User Query** in the response.
  - Avoid phrases like "I can't give financial advice" or similar; reconstruct the response to provide the information the user needs.
  - If the **Assistant Response** is asking for clarifying information, maintain it as a question.
  - Do not repeat the **User Query**. 
  - If **Assistant Response** is "NO ASSISTANT RESPONSE", provide a relevant response.
  - Keep terms like S.M.A.R.T. goals, "ah long", and "CPF" as they are.

- **Additional Notes**:
  - You're talking to migrant workers—keep everything simple and direct!
  - Avoid stripping away too much information since you're providing how-tos as well.
  - The term "ah long" is used in Singapore to refer to loan sharks; do not treat it as English or a typo. But no need to mention it if it's not relevant.
  - Avoid mentioning the same pointers repeatedly from **Recent Messages** in the **Final Response**.
---

**Final Response:**
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
