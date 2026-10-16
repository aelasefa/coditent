"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRecruitmentSocketTicket, getRecruitmentWsUrl } from "@/lib/api";
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

const ACK_TIMEOUT_MS = 10_000;
const MAX_RECONNECT_MS = 15_000;

export function useRecruitmentChatSocket({
  applicationId,
  onMessage,
  onMessagesRead,
  onReady,
}: {
  applicationId: string;
  onMessage: (message: ChatMessage) => void;
  onMessagesRead: (messageIds: string[], readAt: string) => void;
  onReady?: () => void;
}) {
  const [live, setLive] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef(new Map<string, PendingSend>());
  const handlers = useRef({ onMessage, onMessagesRead, onReady });
  handlers.current = { onMessage, onMessagesRead, onReady };

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
      }, ACK_TIMEOUT_MS);
      pendingRef.current.set(clientMessageId, { resolve, reject, timer });
    });
  }, [sendFrame]);

  const markMessagesRead = useCallback(() => sendFrame({ type: "messages_read" }), [sendFrame]);

  useEffect(() => {
    if (!localStorage.getItem(AUTH_TOKEN_KEY)) return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;

    const scheduleReconnect = () => {
      if (disposed || retryTimer || !navigator.onLine) return;
      const delay = Math.min(MAX_RECONNECT_MS, 500 * 2 ** reconnectAttempt) + Math.floor(Math.random() * 250);
      reconnectAttempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void connect();
      }, delay);
    };

    async function connect() {
      if (disposed || !navigator.onLine) return;
      try {
        const { ticket } = await createRecruitmentSocketTicket(applicationId);
        if (disposed) return;
        socket = new WebSocket(getRecruitmentWsUrl(applicationId, ticket));
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
            } else if (payload.type === "messages_read" && payload.message_ids?.length && payload.read_at) {
              handlers.current.onMessagesRead(payload.message_ids, payload.read_at);
            } else if (payload.type === "conversation_state") {
              handlers.current.onReady?.();
            } else if (payload.type === "error" && payload.client_message_id) {
              const pending = pendingRef.current.get(payload.client_message_id);
              if (pending) {
                clearTimeout(pending.timer);
                pendingRef.current.delete(payload.client_message_id);
                pending.reject(new Error(payload.detail || "Realtime message was rejected"));
              }
            }
          } catch {
            // A malformed remote frame cannot alter local state.
          }
        };
        socket.onclose = (event) => {
          if (socketRef.current === socket) socketRef.current = null;
          setLive(false);
          rejectPending("Realtime connection closed before acknowledgement");
          if (![4401, 4403, 4429].includes(event.code)) scheduleReconnect();
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
  }, [applicationId, rejectPending, sendFrame]);

  return { live, markMessagesRead, sendMessage };
}
