"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createFriendSocketTicket, getFriendWsUrl } from "@/lib/api";
import { AUTH_TOKEN_KEY } from "@/lib/constants";
import type { ChatMessage } from "@/lib/types";

type IncomingFrame = {
  type?: string;
  message?: ChatMessage;
  message_ids?: string[];
  read_at?: string;
};

export function useFriendChatSocket({
  peerId,
  onMessage,
  onMessagesRead,
  onRevoked,
}: {
  peerId: string;
  onMessage: (message: ChatMessage) => void;
  onMessagesRead: (messageIds: string[], readAt: string) => void;
  onRevoked: () => void;
}) {
  const [live, setLive] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const handlers = useRef({ onMessage, onMessagesRead, onRevoked });
  handlers.current = { onMessage, onMessagesRead, onRevoked };

  const sendFrame = useCallback((frame: object): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify(frame));
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !localStorage.getItem(AUTH_TOKEN_KEY)) return;
    let closed = false;
    let socket: WebSocket | null = null;
    void (async () => {
      try {
        const { ticket } = await createFriendSocketTicket(peerId);
        if (closed) return;
        socket = new WebSocket(getFriendWsUrl(peerId, ticket));
        socketRef.current = socket;
        socket.onopen = () => { if (!closed) setLive(true); };
        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data as string) as IncomingFrame;
            if (payload.type === "ping") {
              socket?.send(JSON.stringify({ type: "pong" }));
            } else if (payload.type === "message" && payload.message) {
              handlers.current.onMessage(payload.message);
            } else if (payload.type === "messages_read" && payload.message_ids && payload.read_at) {
              handlers.current.onMessagesRead(payload.message_ids, payload.read_at);
            } else if (payload.type === "relationship_revoked") {
              handlers.current.onRevoked();
              socket?.close();
            }
          } catch {
            /* Ignore malformed frames. */
          }
        };
        socket.onclose = (event) => {
          if (!closed) {
            setLive(false);
            if (event.code === 4403) handlers.current.onRevoked();
          }
        };
        socket.onerror = () => socket?.close();
      } catch {
        if (!closed) setLive(false);
      }
    })();
    return () => {
      closed = true;
      socket?.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [peerId]);

  return {
    live,
    sendMessage: (content: string) => sendFrame({ type: "message_send", content }),
    markMessagesRead: () => sendFrame({ type: "messages_read" }),
  };
}
