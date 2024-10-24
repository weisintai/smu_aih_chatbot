"use client";

import './stylesheet.scss';
import React, {
  useState,
  FormEvent,
  useRef,
  useEffect,
  ElementRef,
  useCallback,
} from "react";
import useDetectIntent from "@/hooks/useDetectIntent";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Paperclip, X, Mic } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "../ui/input";
import { resetSessionCookies } from "./actions";
import { LoadingSpinner } from "../loading-spinner";
import { ResetConversationButton } from "./reset-conversation-button";
import GradualSpacing from "@/components/ui/gradual-spacing";
import BlurFade from "@/components/ui/blur-fade";
import { MessageList } from "./message-list";
import { useWebSocket } from "next-ws/client";
import { downsampleBuffer, getNextDelay } from "./utils";
import { AlertDialogHeader, AlertDialogFooter } from '../ui/alert-dialog';

interface Message {
  role: "user" | "assistant";
  content: string;
  fileName?: string;
}

const STORAGE_KEY = "dialogflow_messages";
const SESSION_EXPIRY_KEY = "dialogflow_session_expiry";

const DialogflowForm: React.FC = () => {
  const [isClient, setIsClient] = useState(false);

  const scrollRef = useRef<ElementRef<"div">>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageContainerRef = useRef<ElementRef<"div">>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);


  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMessages, setHasMessages] = useState(false);
  const { mutate, isPending } = useDetectIntent();

  const ws = useWebSocket(); // useWebSocket hook remains unchanged
  const [isListening, setIsListening] = useState(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  const { toast } = useToast();

  // Set isClient to true when component mounts
  useEffect(() => {
    setIsClient(true);

    if (typeof window !== "undefined") {
      const storedMessages = localStorage.getItem(STORAGE_KEY);
      const sessionExpiry = localStorage.getItem(SESSION_EXPIRY_KEY);

      if (sessionExpiry && Date.now() > parseInt(sessionExpiry, 10)) {
        // Session expired, clear messages
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(SESSION_EXPIRY_KEY);
      } else if (storedMessages) {
        setMessages(JSON.parse(storedMessages));
      }
    }
  }, []);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      scrollRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    }

    setHasMessages(messages.length > 0);
  }, [messages]);

  const clearInput = () => {
    setInput("");
    fileInputRef.current!.value = "";
    setFile(null);
  };

  useEffect(() => {
    if (isStreaming) {
      messageContainerRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    }
  }, [isStreaming]);

  const simulateStreaming = (message: string) => {
    setIsStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: message }]);
    const words = message.split(" ");
    let wordIndex = 0;

    const streamNextWord = () => {
      if (wordIndex < words.length) {
        const currentWord = words[wordIndex];
        setStreamingMessage(
          (prev) => prev + (wordIndex > 0 ? " " : "") + currentWord
        );
        wordIndex++;

        const delay = getNextDelay(currentWord);
        setTimeout(streamNextWord, delay);
      } else {
        setIsStreaming(false);
        setStreamingMessage("");
      }
    };

    streamNextWord();
  };

  // Speech to text logic

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = JSON.parse(event.data);

      if (data.event === "interimTranscription") {
        // Update interim transcript
        // setInterimTranscript(data.transcript);
        console.log("Interim:", data.transcript);
      } else if (data.event === "finalTranscription") {
        // Append final transcript and clear interim
        // setFinalTranscript((prev) => prev + " " + data.transcript);
        // setInterimTranscript("");

        // TODO: Add final transcript to input field
        setInput((prev) => {
          if (prev.trim()) {
            return prev + " " + data.transcript;
          } else {
            return data.transcript;
          }
        });
        console.log(data.transcript);
      }
    }

    function onError(error: Event) {
      console.error("WebSocket error:", error);
    }

    ws?.addEventListener("message", onMessage);
    ws?.addEventListener("error", onError);

    return () => {
      ws?.removeEventListener("message", onMessage);
      ws?.removeEventListener("error", onError);
    };
  }, [ws]);

  const startListening = useCallback(async () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error("WebSocket is not connected yet.");
      return;
    }

    try {
      setIsListening(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      mediaStreamRef.current = stream;

      const audioContext = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
      audioContextRef.current = audioContext;

      // Load the audio worklet processor
      await audioContext.audioWorklet.addModule("/recorder-worklet.js");

      const workletNode = new AudioWorkletNode(
        audioContext,
        "recorder.worklet"
      );
      workletNodeRef.current = workletNode;

      // Handle messages from the audio worklet processor
      workletNode.port.onmessage = (event) => {
        try {
          const inputData = event.data as Float32Array;
          const buffer = downsampleBuffer(
            inputData,
            audioContext.sampleRate,
            16000
          );

          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(buffer);
          }
        } catch (error) {
          console.error("Error processing audio data:", error);
        }
      };

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(workletNode);

      ws.send(JSON.stringify({ event: "startGoogleCloudStream" }));
    } catch (error) {
      console.error("Error starting speech recognition:", error);
      setIsListening(false);
    }
  }, [ws]);

  const stopListening = useCallback(() => {
    if (!ws) return;

    setIsListening(false);
    ws.send(JSON.stringify({ event: "endGoogleCloudStream" }));

    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage("stop");
      workletNodeRef.current.disconnect();
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    workletNodeRef.current = null;
    audioContextRef.current = null;
    mediaStreamRef.current = null;

    // TODO: If no final and interim transcript is not empty, add it to input field if stopped listening
  }, [ws]);

  // Form submission logic

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    const newMessage: Message = {
      role: "user",
      content: input,
      fileName: file?.name,
    };

    scrollRef.current?.scrollIntoView({
      behavior: "smooth",
    });

    mutate(
      { query: input, file: file ?? undefined },
      {
        onSuccess: (response) => {
          // Update session expiry
          const newExpiry = Date.now() + 30 * 60 * 1000; // 30 minutes from now
          localStorage.setItem(SESSION_EXPIRY_KEY, newExpiry.toString());

          let assistantMessage =
            response.queryResult.responseMessages[0]?.text?.text[0] || "";

          setMessages((prev) => [...prev, newMessage]);

          assistantMessage = assistantMessage
            .replace(/\n/g, "  \n") // Replace single newlines with soft line breaks
            .replace(/\n{3,}/g, "\n\n") // Replace 3 or more newlines with 2
            .replace(/^\s*\*\s*/gm, "* ") // Clean up unordered list items
            .replace(/^\s*\d+\.\s*/gm, "$&") // Clean up ordered list items
            .trim();

          simulateStreaming(assistantMessage);
        },
        onError: (error) => {
          console.error("Error detecting intent:", error);

          toast({
            title: "Error",
            description:
              error instanceof Error
                ? error.message
                : "An error occurred while processing your request.",
            variant: "destructive",
          });
        },
      }
    );

    clearInput();
  };

  const resetConversation = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_EXPIRY_KEY);

    toast({
      title: "Conversation reset",
      description: "The conversation has been reset.",
      variant: "default",
    });

    resetSessionCookies();
  };

  if (!isClient) {
    return (
      <div className="w-dvw h-dvh flex justify-center items-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen webContainer">
      {/* <div className="flex-grow overflow-y-auto px-4 pt-4 convoSect">
        <div className="flex flex-col items-start gap-8 pb-10 min-h-[75vh] sm:w-[95%] convoWrapper">
          {messages.map((message, index) => {
            return index !== messages.length - 1 ? (
              <div
                key={index}
                className="flex flex-col items-start gap-4 whitespace-pre-wrap markdown"
              >
                {message.role === "user" ? (
                  <div className="flex gap-2 items-center">
                    <Avatar className="w-8 h-8 self-start">
                      <AvatarFallback>
                        {message.role === "user" ? "U" : "A"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col gap-2">
                      {message.fileName && (
                        <div className="flex items-center gap-2">
                          <Paperclip className="h-5 w-5" />
                          <div className="overflow-hidden max-w-60">
                            <p className="text-muted-foreground whitespace-nowrap">
                              {message.fileName}
                            </p>
                          </div>
                        </div>
                      )}
                      <Markdown>{message.content}</Markdown>
                    </div>
                  </div>
                ) : (
                  <BotMessage message={message.content} />
                )}
              </div>
            ) : (
              !isStreaming && <BotMessage message={message.content} />
            );
          })}
          {isStreaming && (
            <div
              ref={messageContainerRef}
              className="flex flex-col items-start gap-4 whitespace-pre-wrap markdown"
            >
              <Markdown>{streamingMessage}</Markdown>
            </div>
          )}
          {(isPending || isStreaming) && <LoadingSpinner />}
        </div>
        <div ref={scrollRef}></div>
      </div> */}
      <MessageList
        messages={messages}
        isPending={isPending}
        isStreaming={isStreaming}
        streamingMessage={streamingMessage}
      />
      <div className="w-full pb-4 pt-1 bg-background">
        <div className="max-w-3xl w-full mx-auto flex flex-col gap-1.5 bg-background inputContainer">
          <div className={`inputSectWrapper ${hasMessages && "active"}`}>
            <GradualSpacing
              className="welcomeHeading font-display text-center text-4xl font-bold -tracking-widest  text-black dark:text-white md:text-7xl md:leading-[5rem]"
              text="Welcome. Ask me anything"
            />
            <form className="relative" onSubmit={handleSubmit}>
              <BlurFade className="space-x-2 bg-muted rounded-2xl p-2">
                <div>
                  {file && (
                    <div className="flex items-center gap-2 px-14 pb-2">
                      <div className="overflow-hidden max-w-60">
                        <p className="text-muted-foreground whitespace-nowrap">
                          {file.name}
                        </p>
                        <p>{file.type}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className=""
                        onClick={() => {
                          fileInputRef.current!.value = "";
                          setFile(null);
                        }}
                      >
                        <X className="h-5 w-5" />
                        <span className="sr-only">Remove</span>
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground hover:bg-muted-hover"
                    onClick={() => {
                      fileInputRef.current?.click();
                    }}
                  >
                    <Paperclip className="h-5 w-5" />
                    <span className="sr-only">Attach</span>
                    <Input
                      type="file"
                      accept="image/png, image/jpeg, application/pdf"
                      ref={fileInputRef}
                      onChange={(e) => {
                        const selectedFile = e.target.files?.[0] || null;

                        if (selectedFile) {
                          const allowedTypes = [
                            "image/jpeg",
                            "image/png",
                            "application/pdf",
                          ];

                          if (!allowedTypes.includes(selectedFile.type)) {
                            toast({
                              title: "Invalid file type",
                              description:
                                "Only JPEG, PNG, and PDF files are allowed.",
                              variant: "destructive",
                            });
                            return;
                          }
                        }

                        setFile(selectedFile);
                      }}
                      className="sr-only"
                      id="file-upload"
                      aria-label="Upload file"
                      tabIndex={-1}
                    />
                  </Button>
                  <Textarea
                    placeholder="Message [botname]"
                    ref={textareaRef}
                    name="message"
                    rows={1}
                    id="message"
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.form?.dispatchEvent(
                          new Event("submit", { cancelable: true, bubbles: true })
                        );
                      }
                    }}
                    className="min-h-[3rem] rounded-2xl resize-none p-4 border-none shadow-none"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground hover:bg-muted-hover"
                    disabled={isPending}
                  >
                    <Mic className="h-5 w-5" />
                    <span className="sr-only">Voice Message</span>
                  </Button>
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground hover:bg-muted-hover"
                    disabled={isPending || (!input.trim() && !file)}
                  >
                    <ArrowUp className="h-5 w-5" />
                    <span className="sr-only">Send</span>
                  </Button>
                </div>
              </BlurFade>
            </form>
            <BlurFade>
              <p className="disclaimerSect text-xs font-medium text-center text-muted-foreground">
                [botname] can make mistakes. Consider checking important
                information.
              </p>
              <p className="disclaimerSect text-[0.7rem] font-medium text-center text-muted-foreground/80">
                Chat clears after 30 minutes of inactivity.
              </p>
            </BlurFade>

            
            <ResetConversationButton
                  onReset={resetConversation}
                  isPending={isPending}
                />

            {/* <AlertDialog>
              <AlertDialogTrigger asChild>
                <div className='buttonWrapper'>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-center resetButton"
                    disabled={isPending || isStreaming}
                  >
                    Reset conversation
                  </Button>
                </div>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete
                    your account and remove your data from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={resetConversation}>
                    Continue
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog> */}

          </div>
        </div>
      </div>
    </div>
  );
};

export default DialogflowForm;
