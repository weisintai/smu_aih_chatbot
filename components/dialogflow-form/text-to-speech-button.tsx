"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Volume2, CirclePause } from "lucide-react";
import { LoadingSpinner } from "../loading-spinner";

function cleanTextForSpeech(text: string): string {
  return (
    text
      // Remove code blocks (both ```code``` and `inline code`)
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`]*`/g, "")

      // Remove markdown headers
      .replace(/#{1,6}\s/g, "")

      // Remove bold and italic markers
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/_(.+?)_/g, "$1")

      // Remove markdown links but keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")

      // Remove HTML tags
      .replace(/<[^>]*>/g, "")

      // Remove bullet points and numbered lists
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")

      // Remove blockquotes
      .replace(/^\s*>\s+/gm, "")

      // Remove horizontal rules
      .replace(/^[\s-=_*]{3,}$/gm, "")

      // Remove excessive whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function TextToSpeechButton({ text }: { text: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef(new Audio());

  // Cleanup function when component unmounts
  useEffect(() => {
    const audio = audioRef.current;

    return () => {
      // Stop playing and remove the audio element
      if (audio) {
        audio.pause();
        audio.src = "";
        setIsPlaying(false);
      }
    };
  }, []); // Empty dependency array means this runs only on mount/unmount

  const handleTextToSpeech = async () => {
    if (isPlaying) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      return;
    }

    setIsLoading(true);

    try {
      const cleanedText = cleanTextForSpeech(text);

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: cleanedText }),
      });

      if (!response.ok) {
        throw new Error("Failed to convert text to speech");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      audioRef.current.src = url;
      audioRef.current.onended = () => setIsPlaying(false);
      audioRef.current.play();

      setIsPlaying(true);
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleTextToSpeech}
      disabled={isLoading}
      variant="ghost"
      size="icon"
      aria-label={isPlaying ? "Stop audio" : "Read aloud"}
    >
      {isPlaying ? (
        <CirclePause className="h-4 w-4" />
      ) : isLoading ? (
        <LoadingSpinner />
      ) : (
        <Volume2 className="h-4 w-4" />
      )}
    </Button>
  );
}
