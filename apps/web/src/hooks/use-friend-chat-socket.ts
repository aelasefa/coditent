"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createFriendSocketTicket, getFriendWsUrl } from "@/lib/api";
import { AUTH_TOKEN_KEY } from "@/lib/constants";
import type { ChatMessage } from "@/lib/types";

type IncomingFrame = {
  type?: string;
  detail?: string;
  client_message_id?: string;
  message?: ChatMessage;
  message_ids?: string[];
  read_at?: string;
};

type PendingSend = {
  resolve: (message: ChatMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export function useFriendChatSocket({
  peerId,
  onMessage,
  onMessagesRead,
  onRevoked,
  onReady,
}: {
  peerId: string;
  onMessage: (message: ChatMessage) => void;
  onMessagesRead: (messageIds: string[], readAt: string) => void;
  onRevoked: () => void;
  onReady?: () => void;
}) {
  const [live, setLive] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef(new Map<string, PendingSend>());
  const handlers = useRef({ onMessage, onMessagesRead, onRevoked, onReady });
  handlers.current = { onMessage, onMessagesRead, onRevoked, onReady };

  const rejectPending = useCallback((reason: string) => {
    for (const pending of pendingRef.current.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    pendingRef.current.clear();
  }, []);

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

  const sendMessage = useCallback((content: string): Promise<ChatMessage> | null => {
    const clientMessageId = crypto.randomUUID();
    if (!sendFrame({ type: "message_send", content, client_message_id: clientMessageId })) return null;
    return new Promise<ChatMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRef.current.delete(clientMessageId);
        reject(new Error("Realtime message acknowledgement timed out"));
      }, 10_000);
      pendingRef.current.set(clientMessageId, { resolve, reject, timer });
    });
  }, [sendFrame]);

  useEffect(() => {
    if (!localStorage.getItem(AUTH_TOKEN_KEY)) return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;

    const scheduleReconnect = () => {
      if (disposed || retryTimer || !navigator.onLine) return;
      const delay = Math.min(15_000, 500 * 2 ** reconnectAttempt) + Math.floor(Math.random() * 250);
      reconnectAttempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void connect();
      }, delay);
    };

    async function connect() {
      if (disposed || !navigator.onLine) return;
      try {
        const { ticket } = await createFriendSocketTicket(peerId);
        if (disposed) return;
        socket = new WebSocket(getFriendWsUrl(peerId, ticket));
        socketRef.current = socket;
        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data as string) as IncomingFrame;
            if (payload.type === "ready") {
              reconnectAttempt = 0;
              setLive(true);
              handlers.current.onReady?.();
            } else if (payload.type === "ping") {
              if (!sendFrame({ type: "pong" })) socket?.close();
            } else if (payload.type === "message" && payload.message) {
              handlers.current.onMessage(payload.message);
            } else if (payload.type === "message_ack" && payload.message && payload.client_message_id) {
              handlers.current.onMessage(payload.message);
              const pending = pendingRef.current.get(payload.client_message_id);
              if (pending) {
                clearTimeout(pending.timer);
                pendingRef.current.delete(payload.client_message_id);
                pending.resolve(payload.message);
              }
            } else if (payload.type === "messages_read" && payload.message_ids && payload.read_at) {
              handlers.current.onMessagesRead(payload.message_ids, payload.read_at);
            } else if (payload.type === "relationship_revoked") {
              handlers.current.onRevoked();
              socket?.close(4403);
            } else if (payload.type === "error" && payload.client_message_id) {
              const pending = pendingRef.current.get(payload.client_message_id);
              if (pending) {
                clearTimeout(pending.timer);
                pendingRef.current.delete(payload.client_message_id);
                pending.reject(new Error(payload.detail || "Realtime message was rejected"));
              }
            }
          } catch {
            // Ignore malformed frames and retain the last valid state.
          }
        };
        socket.onclose = (event) => {
          if (socketRef.current === socket) socketRef.current = null;
          setLive(false);
          rejectPending("Realtime connection closed before acknowledgement");
          if (event.code === 4403) handlers.current.onRevoked();
          else if (![4401, 4429].includes(event.code)) scheduleReconnect();
        };
        socket.onerror = () => socket?.close();
      } catch {
        setLive(false);
        scheduleReconnect();
      }
    }

    const reconnectOnline = () => { reconnectAttempt = 0; void connect(); };
    window.addEventListener("online", reconnectOnline);
    void connect();
    return () => {
      disposed = true;
      window.removeEventListener("online", reconnectOnline);
      if (retryTimer) clearTimeout(retryTimer);
      rejectPending("Conversation closed");
      socket?.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [peerId, rejectPending, sendFrame]);

  return {
    live,
    sendMessage,
    markMessagesRead: () => sendFrame({ type: "messages_read" }),
  };
}
