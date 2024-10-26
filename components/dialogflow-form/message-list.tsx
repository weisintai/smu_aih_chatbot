import React, { useRef, useEffect } from "react";
import { Message } from "./types";
import { LoadingSpinner } from "../loading-spinner";
import Markdown from "react-markdown";
import { TextToSpeechButton } from "@/components/dialogflow-form/text-to-speech-button";
import { Avatar, AvatarFallback } from "@radix-ui/react-avatar";
import { Paperclip } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MessageListProps {
  messages: Message[];
  isPending: boolean;
  isStreaming: boolean;
  streamingMessage: string;
  isFilePending: boolean;
}

const BotMessage = ({ message }: { message: string }) => {
  return (
    <div className="flex flex-col items-start gap-4 whitespace-pre-wrap">
      <Markdown>{message}</Markdown>
      <TextToSpeechButton text={message} />
    </div>
  );
};

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isPending,
  isStreaming,
  streamingMessage,
  isFilePending,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isPending]);

  useEffect(() => {
    if (isStreaming && messageContainerRef.current) {
      messageContainerRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [isStreaming, streamingMessage]);

  return (
    <ScrollArea className="flex-grow w-full h-[75vh]">
      <div className="flex flex-col items-start gap-8 pb-10 sm:w-[95%]">
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
                <BotMessage message={message.content} key={index} />
              )}
            </div>
          ) : (
            !isStreaming && <BotMessage message={message.content} key={index} />
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
        {
          <span className="flex items-center gap-2">
            <span>{(isPending || isStreaming) && <LoadingSpinner />}</span>
            <span className="text-muted-foreground">
              {isPending && isFilePending && "Analyzing file..."}
            </span>
          </span>
        }
      </div>
      <div ref={scrollRef} />
    </ScrollArea>
  );
};

export default MessageList;
