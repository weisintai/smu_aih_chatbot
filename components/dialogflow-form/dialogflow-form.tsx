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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowUp, Paperclip, X, Mic } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "../ui/input";
import Markdown from "react-markdown";
import { resetSessionCookies } from "./actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LoadingSpinner } from "../loading-spinner";
import { TextToSpeechButton } from "../text-to-speech-button";

interface Message {
  role: "user" | "assistant";
  content: string;
  fileName?: string;
}

const STORAGE_KEY = "dialogflow_messages";
const SESSION_EXPIRY_KEY = "dialogflow_session_expiry";

const BotMessage = ({ message }: { message: string }) => {
  return (
    <div className="flex flex-col items-start gap-4 whitespace-pre-wrap">
      <Markdown>{message}</Markdown>
      <TextToSpeechButton text={message} />
    </div>
  );
};

const DialogflowForm: React.FC = () => {
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [isClient, setIsClient] = useState(false);
  const { mutate, isPending } = useDetectIntent();

  const scrollRef = useRef<ElementRef<"div">>(null);
  const fixedElementRef = useRef<ElementRef<"div">>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageContainerRef = useRef<ElementRef<"div">>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { toast } = useToast();

  // Set isClient to true when component mounts
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Load messages from localStorage
  useEffect(() => {
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
  });

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
      <div className="flex-grow overflow-y-auto px-4 pt-4">
        <div className="flex flex-col items-start gap-8 pb-10 min-h-[75vh] sm:w-[95%]">
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
      </div>
      <div className="w-full pb-4 pt-1 bg-background" ref={fixedElementRef}>
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
                      fixedElementRef.current?.scrollIntoView({
                        behavior: "smooth",
                      });
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
                  disabled={isPending}
                >
                  <ArrowUp className="h-5 w-5" />
                  <span className="sr-only">Send</span>
                </Button>
              </div>
            </div>
          </form>
          <p className="text-xs font-medium text-center text-muted-foreground">
            [botname] can make mistakes. Consider checking important
            information.
          </p>
          <p className="text-[0.7rem] font-medium text-center text-muted-foreground/80">
            Chat clears after 30 minutes of inactivity.
          </p>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="self-center"
                disabled={isPending || isStreaming}
              >
                Reset conversation
              </Button>
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
          </AlertDialog>
        </div>
      </div>
    </div>
  );
};

export default DialogflowForm;
