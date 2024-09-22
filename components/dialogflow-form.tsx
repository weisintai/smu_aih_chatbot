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
import { ArrowUpIcon } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "dialogflow_messages";
const SESSION_EXPIRY_KEY = "dialogflow_session_expiry";

const DialogflowForm: React.FC = () => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isClient, setIsClient] = useState(false);
  const { mutate, isPending } = useDetectIntent();

  const scrollRef = useRef<ElementRef<"div">>(null);
  const fixedElementRef = useRef<ElementRef<"div">>(null);

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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    const newMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, newMessage]);

    try {
      mutate(
        { query: input },
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
      // Handle error (e.g., show an error message to the user)
    }

    setInput("");
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
                  <div className="flex gap-2 items-center">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback>
                        {message.role === "user" ? "U" : "A"}
                      </AvatarFallback>
                    </Avatar>
                    {message.content}
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
        <div className="max-w-2xl w-full mx-auto flex flex-col gap-1.5 bg-background">
          <form className="relative" onSubmit={handleSubmit}>
            <Textarea
              placeholder="Message [botname]..."
              name="message"
              id="message"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-h-[48px] rounded-2xl resize-none p-4 border border-neutral-400 shadow-sm pr-16"
            />
            <Button
              type="submit"
              size="icon"
              className="absolute w-8 h-8 top-3 right-3"
              disabled={isPending}
            >
              <ArrowUpIcon className="w-4 h-4" />
              <span className="sr-only">Send</span>
            </Button>
          </form>
          <p className="text-xs font-medium text-center text-neutral-700">
            [botname] can make mistakes. Consider checking important
            information.
          </p>
          <p className="text-[0.7rem] font-medium text-center text-neutral-500">
            Chat clears after 30 minutes of inactivity.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DialogflowForm;
