"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getApiBaseUrl,
  getMe,
  getRecruitmentChat,
  getRecruitmentWsUrl,
  sendRecruitmentMessage,
} from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import { AUTH_TOKEN_KEY } from "@/lib/constants";
import { ChatWorkspace } from "@/components/candidate/chat-workspace";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ChatHeader, Composer, MessageList } from "@/components/candidate/chat-view";
import { stageLabel } from "@/components/candidate/application-stage";
import styles from "@/components/candidate/chat-workspace.module.css";

export default function RecruitmentChatPage({ params }: { params: { applicationId: string } }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { applicationId } = params;
  const [wsLive, setWsLive] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const chatQuery = useQuery({
    queryKey: ["recruitment-chat", applicationId],
    queryFn: () => getRecruitmentChat(applicationId),
    refetchInterval: wsLive ? false : 3000,
    retry: false,
  });
  const ctx = chatQuery.data;
  const backHref = me?.role === "CANDIDATE" ? "/chat" : "/company/candidates";

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
          qc.invalidateQueries({ queryKey: ["my-recruitment-chats"] });
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
      qc.invalidateQueries({ queryKey: ["my-recruitment-chats"] });
    },
    onError: () => toast("Message failed to send", { description: "Retry.", variant: "error" }),
  });

  const peerName = ctx?.peer?.full_name ?? "recruiter";
  const peerRole = me?.role === "CANDIDATE" ? "Recruiter" : "Candidate";
  const companyLogo =
    ctx?.company_id && ctx?.company_logo_url
      ? `${getApiBaseUrl()}/companies/${ctx.company_id}/logo`
      : null;

  return (
    <ChatWorkspace activeHref={`/chat/recruitment/${applicationId}`}>
        <ChatHeader
          title={ctx?.peer?.full_name ?? peerRole}
          subtitle={ctx?.offer_title}
          context={ctx ? `${ctx.company_name ?? "Company"} · ${stageLabel(ctx.status)}` : undefined}
          avatarSrc={ctx?.peer?.avatar_url ?? companyLogo}
          status={ctx ? `${wsLive ? "Live" : "Auto-refresh"} · private recruitment conversation` : undefined}
          backHref={backHref}
        />

        {chatQuery.isLoading && (
          <div className={styles.threadLoading} role="status" aria-label="Loading conversation">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        )}

        {chatQuery.isError && (
          <div role="alert" className={styles.threadNotice}>
            <strong>Conversation unavailable</strong>
            <p>
              Access denied. Only candidate and responsible hiring team for this application can participate.
            </p>
            <button type="button" onClick={() => chatQuery.refetch()}>
              Retry
            </button>
          </div>
        )}

        {ctx && !ctx.chat_enabled && (
          <div className={styles.threadNotice} role="status">
            <strong>Chat not yet available</strong>
            <p>
              Available after application progresses. Communicate with responsible recruiter then.
            </p>
          </div>
        )}

        {ctx && ctx.chat_enabled && (
          <>
            <MessageList messages={ctx.messages} myId={me?.id} />
            <Composer
              peerName={peerName}
              pending={sendMut.isPending}
              onSend={(text) => sendMut.mutate(text)}
            />
          </>
        )}
    </ChatWorkspace>
  );
}
