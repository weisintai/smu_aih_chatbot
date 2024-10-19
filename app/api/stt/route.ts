import { WebSocket, WebSocketServer, Data } from "ws";
import { IncomingMessage } from "node:http";
import speech, { protos } from "@google-cloud/speech";
import { SpeechClient } from "@google-cloud/speech/build/src/v1/index";

const speechClient = new speech.SpeechClient();

const config: protos.google.cloud.speech.v1.IRecognitionConfig = {
  encoding: "LINEAR16" as const,
  sampleRateHertz: 16000,
  languageCode: "en-US",
};

const request: protos.google.cloud.speech.v1.IStreamingRecognitionConfig = {
  config,
  interimResults: true,
};

export function GET() {
  const headers = new Headers();
  headers.set("Connection", "Upgrade");
  headers.set("Upgrade", "websocket");
  return new Response("Upgrade Required", { status: 426, headers });
}

export function SOCKET(
  client: WebSocket,
  _request: IncomingMessage,
  server: WebSocketServer
) {
  const { send, broadcast } = createHelpers(client, server);

  let recognizeStream: SpeechClient.StreamingRecognizeStream | null = null;

  client.on("message", async (message: Data, isBinary: boolean) => {
    try {
      // Check if message is JSON (control messages) or binary audio data
      if (!isBinary) {
        const data = JSON.parse(message.toString("utf8"));

        switch (data.event) {
          case "startGoogleCloudStream":
            recognizeStream = speechClient
              .streamingRecognize(request)
              .on("error", (error) => {
                console.error("Speech recognition error:", error);
              })
              .on(
                "data",
                (
                  data: protos.google.cloud.speech.v1.StreamingRecognizeResponse
                ) => {
                  const result = data.results[0];
                  if (result && result.alternatives && result.alternatives[0]) {
                    const isFinal = result.isFinal;
                    const transcript = result.alternatives[0].transcript;

                    send({
                      event: isFinal
                        ? "finalTranscription"
                        : "interimTranscription",
                      transcript,
                    });
                  }
                }
              );
            break;

          case "endGoogleCloudStream":
            if (recognizeStream) {
              recognizeStream.end();
              recognizeStream = null;
            }
            break;

          default:
            console.log("Unknown event:", data.event);
        }
      } else if (message instanceof Buffer) {
        // Handle binary audio data
        if (recognizeStream) {
          recognizeStream.write(message);
        }
      } else {
        console.warn("Received unknown message type.");
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  });

  client.on("close", () => {
    if (recognizeStream) {
      recognizeStream.end();
    }
    broadcast({ author: "Server", content: "A client has disconnected." });
  });
}

function createHelpers(client: WebSocket, server: WebSocketServer) {
  const send = (payload: unknown) => client.send(JSON.stringify(payload));
  const broadcast = (payload: unknown) => {
    if (payload instanceof Buffer) payload = payload.toString();
    if (typeof payload !== "string") payload = JSON.stringify(payload);
    for (const other of server.clients)
      if (other !== client) other.send(String(payload));
  };
  return { send, broadcast };
}
