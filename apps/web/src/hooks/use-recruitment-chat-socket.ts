"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getRecruitmentWsUrl } from "@/lib/api";
import { AUTH_TOKEN_KEY } from "@/lib/constants";
import type { ChatMessage } from "@/lib/types";

const TYPING_START_THROTTLE_MS = 1_500;
const TYPING_STOP_DELAY_MS = 2_500;
const PEER_TYPING_EXPIRY_MS = 3_000;

type SocketFrame =
  | { type: "message_send"; content: string }
  | { type: "typing_start" }
  | { type: "typing_stop" };

type IncomingFrame = {
  type?: string;
  message?: ChatMessage;
  sender_id?: string;
};

type UseRecruitmentChatSocketOptions = {
  applicationId: string;
  currentUserId?: string;
  onMessage: (message: ChatMessage) => void;
};

export function useRecruitmentChatSocket({
  applicationId,
  currentUserId,
  onMessage,
}: UseRecruitmentChatSocketOptions) {
  const [live, setLive] = useState(false);
  const [peerIsTyping, setPeerIsTyping] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const currentUserIdRef = useRef(currentUserId);
  const onMessageRef = useRef(onMessage);
  const typingActiveRef = useRef(false);
  const lastTypingStartAtRef = useRef(0);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  onMessageRef.current = onMessage;
  currentUserIdRef.current = currentUserId;

  const clearTypingStopTimer = useCallback(() => {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
  }, []);

  const clearPeerTyping = useCallback(() => {
    if (peerTypingExpiryRef.current) {
      clearTimeout(peerTypingExpiryRef.current);
      peerTypingExpiryRef.current = null;
    }
    setPeerIsTyping(false);
  }, []);

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

  const stopTyping = useCallback(() => {
    clearTypingStopTimer();
    if (typingActiveRef.current) sendFrame({ type: "typing_stop" });
    typingActiveRef.current = false;
    lastTypingStartAtRef.current = 0;
  }, [clearTypingStopTimer, sendFrame]);

  const notifyTyping = useCallback((value: string) => {
    if (!value.trim()) {
      stopTyping();
      return;
    }
    const now = Date.now();
    if (!typingActiveRef.current || now - lastTypingStartAtRef.current >= TYPING_START_THROTTLE_MS) {
      if (sendFrame({ type: "typing_start" })) {
        typingActiveRef.current = true;
        lastTypingStartAtRef.current = now;
      }
    }

    clearTypingStopTimer();
    typingStopTimerRef.current = setTimeout(stopTyping, TYPING_STOP_DELAY_MS);
  }, [clearTypingStopTimer, sendFrame, stopTyping]);

  const sendMessage = useCallback((content: string): boolean => {
    stopTyping();
    return sendFrame({ type: "message_send", content });
  }, [sendFrame, stopTyping]);

  useEffect(() => {
    if (typeof window === "undefined" || !localStorage.getItem(AUTH_TOKEN_KEY)) return;
    let closed = false;
    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(getRecruitmentWsUrl(applicationId));
    } catch {
      return;
    }
    socketRef.current = socket;

    socket.onopen = () => {
      if (!closed) setLive(true);
    };
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as IncomingFrame;
        if (payload.type === "message" && payload.message) {
          if (payload.message.sender_id !== currentUserIdRef.current) clearPeerTyping();
          onMessageRef.current(payload.message);
          return;
        }
        if (!payload.sender_id || payload.sender_id === currentUserIdRef.current) return;
        if (payload.type === "typing_start") {
          if (peerTypingExpiryRef.current) clearTimeout(peerTypingExpiryRef.current);
          setPeerIsTyping(true);
          peerTypingExpiryRef.current = setTimeout(clearPeerTyping, PEER_TYPING_EXPIRY_MS);
        } else if (payload.type === "typing_stop") {
          clearPeerTyping();
        }
      } catch {
        /* Ignore malformed frames and keep the conversation connected. */
      }
    };
    socket.onclose = () => {
      clearTypingStopTimer();
      typingActiveRef.current = false;
      lastTypingStartAtRef.current = 0;
      if (!closed) {
        clearPeerTyping();
        setLive(false);
      } else if (peerTypingExpiryRef.current) {
        clearTimeout(peerTypingExpiryRef.current);
        peerTypingExpiryRef.current = null;
      }
    };
    socket.onerror = () => {
      try {
        socket?.close();
      } catch {
        /* noop */
      }
    };

    const stopWhenHidden = () => {
      if (document.hidden) stopTyping();
    };
    document.addEventListener("visibilitychange", stopWhenHidden);

    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", stopWhenHidden);
      stopTyping();
      if (peerTypingExpiryRef.current) {
        clearTimeout(peerTypingExpiryRef.current);
        peerTypingExpiryRef.current = null;
      }
      try {
        socket?.close();
      } catch {
        /* noop */
      }
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [applicationId, clearPeerTyping, clearTypingStopTimer, stopTyping]);

  return { live, peerIsTyping, notifyTyping, stopTyping, sendMessage };
}
