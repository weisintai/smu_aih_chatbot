import { PROJECT_ID, LOCATION_ID, AGENT_ID } from "@/utils/constants";
import { NextRequest, NextResponse } from "next/server";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { TranslationServiceClient } from "@google-cloud/translate";

const languageCodeToModelName = {
  en: "en-US-Neural2-F",
  cmn: "cmn-TW-Wavenet-A",
  // Add more language codes and corresponding model names as needed
};

export async function POST(request: NextRequest) {
  if (!PROJECT_ID || !LOCATION_ID || !AGENT_ID) {
    return NextResponse.json(
      { error: "Missing required environment variables" },
      { status: 500 }
    );
  }

  const { text } = await request.json();

  if (!text) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  const translationClient = new TranslationServiceClient();

  const [response] = await translationClient.detectLanguage({
    parent: `projects/${PROJECT_ID}/locations/global`,
    content: text,
  });

  const languageCode = response.languages?.[0]?.languageCode;

  if (!languageCode) {
    return NextResponse.json(
      { error: "Failed to detect language" },
      { status: 500 }
    );
  }

  const ttsClient = new TextToSpeechClient();

  const ssml = `
    <speak>
      <prosody rate="0.9" pitch="+0.5st">
        ${text.replace(/\. /g, '.<break time="0.5s"/>')}
      </prosody>
    </speak>
  `;

  try {
    const [response] = await ttsClient.synthesizeSpeech({
      input: { ssml },
      voice: {
        languageCode,
      },
      audioConfig: {
        audioEncoding: "MP3",
        pitch: 0, // Neutral pitch
        speakingRate: 1, // Normal speaking rate
      },
    });

    const audioBuffer = Buffer.from(response.audioContent as Buffer);

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": "attachment; filename=speech.mp3",
      },
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Failed to convert text to speech" },
      { status: 500 }
    );
  }
}
