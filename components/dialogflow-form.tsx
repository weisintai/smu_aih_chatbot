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
import { ArrowUp, Paperclip, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "./ui/input";

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

  const [messages, setMessages] = useState<Message[]>([]);
  const [isClient, setIsClient] = useState(false);
  const { mutate, isPending } = useDetectIntent();

  const scrollRef = useRef<ElementRef<"div">>(null);
  const fixedElementRef = useRef<ElementRef<"div">>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

  // Set isClient to true when component mounts
  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() && !file) return;

    const newMessage: Message = {
      role: "user",
      content: input,
      fileName: file?.name,
    };
    setMessages((prev) => [...prev, newMessage]);

    try {
      mutate(
        { query: input, file: file ?? undefined },
        {
          onSuccess: (response) => {
            // Update session expiry
            const newExpiry = Date.now() + 30 * 60 * 1000; // 30 minutes from now
            localStorage.setItem(SESSION_EXPIRY_KEY, newExpiry.toString());

            const assistantMessage =
              response.queryResult.responseMessages[0]?.text?.text[0] || "";
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: assistantMessage },
            ]);
          },
        }
      );
    } catch (error) {
      console.error("Error detecting intent:", error);

      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "An error occurred while processing your request.",
        variant: "destructive",
      });
    }

    clearInput();
  };

  if (!isClient) {
    return <div>Loading...</div>; // Or any loading indicator
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-grow overflow-y-auto px-4 pt-4">
        <div className="flex flex-col items-start gap-12 pb-10 min-h-[75vh] sm:w-[95%]">
          {messages.map((message, index) => {
            return (
              <div key={index} className="flex flex-col items-start gap-4">
                {message.role === "user" ? (
                  <div className="flex gap-2 items-center whitespace-pre-wrap">
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
                      {message.content}
                    </div>
                  </div>
                ) : (
                  <div> {message.content}</div>
                )}
              </div>
            );
          })}
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
                  onClick={handleButtonClick}
                >
                  <Paperclip className="h-5 w-5" />
                  <span className="sr-only">Attach</span>
                  <Input
                    type="file"
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
        </div>
      </div>
    </div>
  );
};

export default DialogflowForm;
