"use client";

import React, {
  useState,
  FormEvent,
  useRef,
  useEffect,
  ElementRef,
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
import { MessageList } from "./message-list";

interface Message {
  role: "user" | "assistant";
  content: string;
  fileName?: string;
}

const STORAGE_KEY = "dialogflow_messages";
const SESSION_EXPIRY_KEY = "dialogflow_session_expiry";

const DialogflowForm: React.FC = () => {
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [isClient, setIsClient] = useState(false);
  const { mutate, isPending } = useDetectIntent();

  const scrollRef = useRef<ElementRef<"div">>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageContainerRef = useRef<ElementRef<"div">>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  }, [messages]);

  const clearInput = () => {
    setInput("");
    fileInputRef.current!.value = "";
    setFile(null);
  };

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

  const getNextDelay = (word: string): number => {
    const baseDelay = 30; // Increased base delay for readability
    const variableDelay = Math.random() * 100; // 0-100ms of variable delay

    const lastChar = word[word.length - 1];
    if ([".", "!", "?"].includes(lastChar)) {
      return baseDelay + variableDelay + 600; // Longer pause after sentences
    } else if ([",", ";", ":"].includes(lastChar)) {
      return baseDelay + variableDelay + 300; // Medium pause after clauses
    } else {
      return baseDelay + variableDelay;
    }
  };

  useEffect(() => {
    if (isStreaming) {
      messageContainerRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    }
  }, [isStreaming]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() && !file) return;

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
    ); // Or any loading indicator
  }

  return (
    <div className="flex flex-col h-screen">
      <MessageList
        messages={messages}
        isPending={isPending}
        isStreaming={isStreaming}
        streamingMessage={streamingMessage}
      />
      <div className="w-full pb-4 pt-1 bg-background">
        <div className="max-w-3xl w-full mx-auto flex flex-col gap-1.5 bg-background">
          <form className="relative" onSubmit={handleSubmit}>
            <div className="space-x-2 bg-muted rounded-2xl p-2">
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
            </div>
          </form>
        </div>
      </div>
      <p className="text-xs font-medium text-center text-muted-foreground">
        [botname] can make mistakes. Consider checking important information.
      </p>
      <p className="text-[0.7rem] font-medium text-center text-muted-foreground/80">
        Chat clears after 30 minutes of inactivity.
      </p>
      <ResetConversationButton
        onReset={resetConversation}
        isPending={isPending}
      />
    </div>
  );
};

export default DialogflowForm;
