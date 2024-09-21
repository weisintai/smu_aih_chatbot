"use client";

import React, { useState, FormEvent, useRef, useEffect } from "react";
import useDetectIntent from "@/hooks/useDetectIntent";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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
  const scrollAreaRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  if (!isClient) {
    return <div>Loading...</div>; // Or any loading indicator
  }

  return (
    <Card className="w-full max-w-2xl mx-auto h-[600px] flex flex-col">
      <CardContent className="flex-grow p-4">
        <ScrollArea className="h-full pr-4" ref={scrollAreaRef}>
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              } mb-4`}
            >
              <div
                className={`flex ${
                  message.role === "user" ? "flex-row-reverse" : "flex-row"
                } items-start`}
              >
                <Avatar className="w-8 h-8">
                  <AvatarFallback>
                    {message.role === "user" ? "U" : "A"}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={`mx-2 p-3 rounded-lg ${
                    message.role === "user"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            </div>
          ))}
        </ScrollArea>
      </CardContent>
      <CardFooter>
        <form onSubmit={handleSubmit} className="w-full flex space-x-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message here..."
            className="flex-grow"
          />
          <Button type="submit" disabled={isPending}>
            {isPending ? "Sending..." : "Send"}
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
};

export default DialogflowForm;
