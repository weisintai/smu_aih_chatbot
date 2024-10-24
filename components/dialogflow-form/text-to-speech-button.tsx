"use client";

import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Volume2, CirclePause } from "lucide-react";
import { LoadingSpinner } from "../loading-spinner";

export function TextToSpeechButton({ text }: { text: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef(new Audio());

  const handleTextToSpeech = async () => {
    if (isPlaying) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
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
