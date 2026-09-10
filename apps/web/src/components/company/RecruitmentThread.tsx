"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe, getRecruitmentChat, getRecruitmentWsUrl, sendRecruitmentMessage } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import { AUTH_TOKEN_KEY } from "@/lib/constants";
import { MessageList, Composer } from "@/components/candidate/chat-view";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

export function RecruitmentThread({ applicationId, peerName }: { applicationId: string; peerName: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [wsLive, setWsLive] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });

  const chatQuery = useQuery({
    queryKey: ["recruitment-chat", applicationId],
    queryFn: () => getRecruitmentChat(applicationId),
    refetchInterval: wsLive ? false : 3000,
    retry: false,
  });
  const ctx = chatQuery.data;

  useEffect(() => {
    if (typeof window === "undefined" || !localStorage.getItem(AUTH_TOKEN_KEY)) return;
    let closed = false;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(getRecruitmentWsUrl(applicationId));
    } catch {
      return;
    }
    wsRef.current = ws;
    ws.onopen = () => {
      if (!closed) setWsLive(true);
    };
    ws.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data as string) as { type: string; message?: ChatMessage };
        if (payload.type === "message" && payload.message) {
          qc.setQueryData(["recruitment-chat", applicationId], (prev: typeof ctx) =>
            prev ? { ...prev, messages: [...prev.messages, payload.message as ChatMessage] } : prev
          );
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      if (!closed) setWsLive(false);
    };
    ws.onerror = () => {
      try {
        ws?.close();
      } catch {
        /* noop */
      }
    };
    return () => {
      closed = true;
      setWsLive(false);
      try {
        ws?.close();
      } catch {
        /* noop */
      }
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  const sendMut = useMutation({
    mutationFn: async (text: string) => {
      const sock = wsRef.current;
      if (sock && sock.readyState === WebSocket.OPEN && ctx?.chat_enabled) {
        sock.send(JSON.stringify({ content: text }));
        return null;
      }
      return sendRecruitmentMessage(applicationId, text);
    },
    onSuccess: (created) => {
      if (created) qc.invalidateQueries({ queryKey: ["recruitment-chat", applicationId] });
    },
    onError: () => toast("Message failed to send", { description: "Retry.", variant: "error" }),
  });

  if (chatQuery.isLoading) {
    return (
      <div className="space-y-2 p-4" role="status" aria-label="Loading conversation">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }
  if (chatQuery.isError || !ctx) {
    return (
      <div role="alert" className="p-6 text-center">
        <p className="text-sm font-semibold text-danger">Conversation unavailable.</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
          Only responsible hiring team for this application can access it.
        </p>
        <button type="button" onClick={() => chatQuery.refetch()} className="mt-3 text-sm font-semibold text-primary underline">
          Retry
        </button>
      </div>
    );
  }
  if (!ctx.chat_enabled) {
    return (
      <p role="status" className="p-6 text-center text-sm text-muted-foreground">
        Chat locked for this application. Advance candidate stage to unlock.
      </p>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="border-b border-border-subtle px-4 py-2 text-[11px] text-muted-foreground">
        {wsLive ? "Live" : "Auto-refresh"} · private recruitment conversation
      </p>
      <div className="min-h-0 flex-1">
        <MessageList messages={ctx.messages} myId={me?.id} />
      </div>
      <Composer peerName={peerName} pending={sendMut.isPending} onSend={(t) => sendMut.mutate(t)} />
    </div>
  );
}
