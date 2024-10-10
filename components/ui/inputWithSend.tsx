import * as React from "react";
import { Button } from "./Button"; // Make sure to import your Button component correctly.

const InputWithSend = () => {
  const [message, setMessage] = React.useState("");

  // Function to handle the "send" action (triggered by both Button click and Enter key)
  const handleSend = () => {
    if (message.trim()) {
      console.log("Sending message:", message);
      // Add your actual send logic here (e.g., API call, state update, etc.)
      setMessage(""); // Clear the input after sending
    }
  };

  // Function to handle key press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown} // Trigger send on Enter key press
        className="border p-2 rounded-md flex-1"
        placeholder="Type your message..."
      />
      <Button onClick={handleSend} variant="default" size="default">
        Send
      </Button>
    </div>
  );
};

export { InputWithSend };
