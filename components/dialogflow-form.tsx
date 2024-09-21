"use client";

import React, { useState, FormEvent } from "react";
import useDetectIntent from "../hooks/useDetectIntent";

const DialogflowForm: React.FC = () => {
  const [input, setInput] = useState("");
  const { mutate, isPending, error, data } = useDetectIntent();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    mutate({ query: input });
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter your message"
        />
        <button type="submit" disabled={isPending}>
          {isPending ? "Detecting..." : "Detect Intent"}
        </button>
      </form>
      {error && <p>Error: {error.message}</p>}
      {data && (
        <div>
          <h3>Response:</h3>
          <p>Response ID: {data.responseId}</p>
          <p>Text: {data.queryResult.text}</p>
          <p>Language: {data.queryResult.languageCode}</p>
          <br />
          <p>Response Messages:</p>
          <ul>
            {data.queryResult.responseMessages.map((msg, index) => (
              <li key={index}>{msg.text.text.join(" ")}</li>
            ))}
          </ul>
          <br />
          <br />
          <p>
            Intent Detection Confidence:{" "}
            {data.queryResult.intentDetectionConfidence}
          </p>
          <p>Match Type: {data.queryResult.match.matchType}</p>
          <p>Match Confidence: {data.queryResult.match.confidence}</p>
          <p>Session ID: {data.queryResult.diagnosticInfo["Session Id"]}</p>
          <p>Response ID: {data.queryResult.diagnosticInfo["Response Id"]}</p>
          <p>Response Type: {data.responseType}</p>
        </div>
      )}
    </div>
  );
};

export default DialogflowForm;
