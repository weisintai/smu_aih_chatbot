"use client";

import { WebSocketProvider } from "next-ws/client";

export default function WebSocketClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  let wsUrl = "";

  if (typeof window !== "undefined") {
    wsUrl = `${window?.location.protocol === "https:" ? "wss:" : "ws:"}//${
      window?.location.host
    }/api/stt`;
  }

  return <WebSocketProvider url={wsUrl}>{children}</WebSocketProvider>;
}
