"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "next-ws/client";

export function SpeechToText() {
  const ws = useWebSocket(); // useWebSocket hook remains unchanged
  const [isListening, setIsListening] = useState(false);

  // Separate state variables for final and interim transcripts
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = JSON.parse(event.data);

      if (data.event === "interimTranscription") {
        // Update interim transcript
        setInterimTranscript(data.transcript);
      } else if (data.event === "finalTranscription") {
        // Append final transcript and clear interim
        setFinalTranscript((prev) => prev + " " + data.transcript);
        setInterimTranscript("");
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
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

    // Reset transcripts when stopping
    setFinalTranscript("");
    setInterimTranscript("");
  }, [ws]);

  function downsampleBuffer(
    buffer: Float32Array,
    sampleRate: number,
    outSampleRate: number
  ) {
    if (outSampleRate === sampleRate) {
      return convertFloat32ToInt16(buffer);
    }
    const sampleRateRatio = sampleRate / outSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Int16Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      // Use average value between samples to prevent audio artifacts
      let accum = 0,
        count = 0;
      for (
        let i = offsetBuffer;
        i < nextOffsetBuffer && i < buffer.length;
        i++
      ) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = Math.min(1, accum / count) * 0x7fff;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result.buffer;
  }

  function convertFloat32ToInt16(buffer: Float32Array) {
    const l = buffer.length;
    const buf = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      buf[i] = Math.max(-1, Math.min(1, buffer[i])) * 0x7fff;
    }
    return buf.buffer;
  }

  return (
    <>
      <button onClick={isListening ? stopListening : startListening}>
        {isListening ? "Stop Listening" : "Start Listening"}
      </button>

      <p>
        {finalTranscript}
        <span style={{ opacity: 0.5 }}>{interimTranscript}</span>
      </p>
    </>
  );
}
