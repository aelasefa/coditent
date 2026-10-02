"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRecruitmentSocketTicket, getRecruitmentWsUrl } from "@/lib/api";
import { AUTH_TOKEN_KEY } from "@/lib/constants";
import type { ChatMessage } from "@/lib/types";

type SocketFrame =
  | { type: "message_send"; content: string }
  | { type: "messages_read" }
  | { type: "pong" };

type IncomingFrame = {
  type?: string;
  message?: ChatMessage;
  message_ids?: string[];
  read_at?: string;
};

type UseRecruitmentChatSocketOptions = {
  applicationId: string;
  onMessage: (message: ChatMessage) => void;
  onMessagesRead: (messageIds: string[], readAt: string) => void;
};

export function useRecruitmentChatSocket({
  applicationId,
  onMessage,
  onMessagesRead,
}: UseRecruitmentChatSocketOptions) {
  const [live, setLive] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const onMessagesReadRef = useRef(onMessagesRead);

  onMessageRef.current = onMessage;
  onMessagesReadRef.current = onMessagesRead;

  const sendFrame = useCallback((frame: SocketFrame): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify(frame));
      return true;
    } catch {
      return false;
    }
  }, []);

  const sendMessage = useCallback((content: string): boolean => {
    return sendFrame({ type: "message_send", content });
  }, [sendFrame]);

  const markMessagesRead = useCallback((): boolean => {
    return sendFrame({ type: "messages_read" });
  }, [sendFrame]);

  useEffect(() => {
    if (typeof window === "undefined" || !localStorage.getItem(AUTH_TOKEN_KEY)) return;
    let closed = false;
    let socket: WebSocket | null = null;

    async function connect() {
      let safeSocketEndpoint = "recruitment chat endpoint";
      try {
        const { ticket } = await createRecruitmentSocketTicket(applicationId);
        if (closed) return;
        const socketUrl = getRecruitmentWsUrl(applicationId, ticket);
        const parsed = new URL(socketUrl);
        safeSocketEndpoint = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
        socket = new WebSocket(socketUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          if (!closed) setLive(true);
        };
        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data as string) as IncomingFrame;
            if (payload.type === "ping") {
              try {
                socket?.send(JSON.stringify({ type: "pong" } satisfies SocketFrame));
              } catch {
                socket?.close();
              }
              return;
            }
            if (payload.type === "message" && payload.message) {
              onMessageRef.current(payload.message);
              return;
            }
            if (payload.type === "messages_read" && payload.message_ids?.length && payload.read_at) {
              onMessagesReadRef.current(payload.message_ids, payload.read_at);
            }
          } catch {
            /* Ignore malformed frames and keep the conversation connected. */
          }
        };
        socket.onclose = () => {
          if (!closed) setLive(false);
        };
        socket.onerror = (error) => {
          console.error("[RecruitmentChat] WebSocket connection failed", safeSocketEndpoint, error);
          try {
            socket?.close();
          } catch {
            /* noop */
          }
        };
      } catch (error) {
        if (!closed) {
          setLive(false);
          console.error("[RecruitmentChat] WebSocket connection failed", safeSocketEndpoint, error);
        }
      }
    }

    void connect();

    return () => {
      closed = true;
      try {
        socket?.close();
      } catch {
        /* noop */
      }
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [applicationId]);

  return { live, markMessagesRead, sendMessage };
}
