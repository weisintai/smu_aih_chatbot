"use client";

import { WebSocketProvider } from "next-ws/client";

export default function WebSocketClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WebSocketProvider url="ws://localhost:3000/api/stt">
      {children}
    </WebSocketProvider>
  );
}
