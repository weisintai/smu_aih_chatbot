import React, { useRef, useEffect } from "react";
import { Message } from "./types";
import { LoadingSpinner } from "../loading-spinner";
import Markdown, { Components } from "react-markdown";
import { TextToSpeechButton } from "@/components/dialogflow-form/text-to-speech-button";
import { Avatar, AvatarFallback } from "@radix-ui/react-avatar";
import { Info, Paperclip } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BotAvatar } from "@/components/dialogflow-form/bot-avatar";
import { UserAvatar } from "./user-avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface MessageListProps {
  messages: Message[];
  isPending: boolean;
  isStreaming: boolean;
  streamingMessage: string;
  isFilePending: boolean;
}

interface MessageContainerProps {
  children: string;
  avatar: React.ReactNode;
  additionalContent?: React.ReactNode;
}

interface CustomLinkProps {
  href?: string;
  children?: React.ReactNode;
}

const MessageContainer = ({
  children,
  avatar,
  additionalContent,
}: MessageContainerProps) => {
  const formatUrl = (href: string): string => {
    let url = href.trim();

    // Add https:// if no protocol exists
    if (!url.startsWith("http")) {
      url = `https://${url}`;
    }

    // Add www. if it doesn't exist and isn't a subdomain
    if (!url.includes("www.")) {
      url = url.replace("://", "://www.");
    }

    return url;
  };

  const customLink: Components["a"] = ({ href, children }: CustomLinkProps) => {
    if (!href) return null;

    const formattedUrl = formatUrl(href);

    return (
      <a href={formattedUrl} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  };

  return (
    <div className="flex gap-2 items-start w-full flex-col">
      <Avatar className="w-8 h-8 shrink-0 mt-1">
        <AvatarFallback>{avatar}</AvatarFallback>
      </Avatar>
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <div className="prose max-w-none">
          <Markdown
            className="markdown flex flex-col gap-4"
            components={{
              a: customLink,
            }}
          >
            {children}
          </Markdown>
        </div>
        {additionalContent}
      </div>
    </div>
  );
};

const BotMessage = ({
  message,
  reference,
}: {
  message: string;
  reference?: string;
}) => {
  return (
    <MessageContainer
      avatar={<BotAvatar />}
      additionalContent={
        <div className="flex items-center">
          <TextToSpeechButton text={message} />
          {reference && (
            <Popover>
              <PopoverTrigger className="cursor-help">
                <Info
                  size={16}
                  className="text-slate-500 hover:text-slate-900 transition-colors"
                />
              </PopoverTrigger>
              <PopoverContent className="max-w-sm text-sm">
                <strong>Vertex AI Response:</strong>
                <p>{reference}</p>
              </PopoverContent>
            </Popover>
          )}
        </div>
      }
    >
      {message}
    </MessageContainer>
  );
};

const UserMessage = ({
  message,
  fileName,
}: {
  message: string;
  fileName?: string;
}) => {
  return (
    <MessageContainer
      avatar={<UserAvatar />}
      additionalContent={
        fileName && (
          <div className="flex items-center gap-2 mb-2">
            <Paperclip className="h-5 w-5 shrink-0" />
            <div className="overflow-hidden max-w-60">
              <p className="text-muted-foreground whitespace-nowrap truncate">
                {fileName}
              </p>
            </div>
          </div>
        )
      }
    >
      {message}
    </MessageContainer>
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
    <ScrollArea className="flex-grow w-full h-[85dvh]">
      <div className="flex flex-col gap-8 pb-10 sm:w-[95%] pt-4">
        {messages.map((message, index) => {
          return index !== messages.length - 1 ? (
            <div key={index} className="w-full">
              {message.role === "user" ? (
                <UserMessage
                  message={message.content}
                  fileName={message.fileName}
                />
              ) : (
                <BotMessage
                  message={message.content}
                  reference={message.referenceMessage}
                />
              )}
            </div>
          ) : (
            !isStreaming && (
              <BotMessage
                message={message.content}
                key={index}
                reference={message.referenceMessage}
              />
            )
          );
        })}
        {isStreaming && (
          <div ref={messageContainerRef}>
            <MessageContainer avatar={<BotAvatar />}>
              {streamingMessage}
            </MessageContainer>
          </div>
        )}
        {(isPending || isStreaming) && (
          <div className="flex gap-2 items-center">
            <LoadingSpinner />
            {isPending && isFilePending && (
              <span className="text-muted-foreground">Analyzing file...</span>
            )}
          </div>
        )}
      </div>
      <div ref={scrollRef} />
    </ScrollArea>
  );
};

export default MessageList;
