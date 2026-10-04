"use client";

import axios from "axios";
import { use, useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getApiBaseUrl,
  getMe,
  getRecruitmentChat,
  getRecruitmentMessagesPage,
  markRecruitmentMessagesRead,
  sendRecruitmentMessage,
} from "@/lib/api";
import type { ChatMessage, RecruitmentChatContext } from "@/lib/types";
import { ChatWorkspace } from "@/components/candidate/chat-workspace";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ChatHeader, Composer, MessageList } from "@/components/candidate/chat-view";
import { stageLabel } from "@/components/candidate/application-stage";
import styles from "@/components/candidate/chat-workspace.module.css";
import { useRecruitmentChatSocket } from "@/hooks/use-recruitment-chat-socket";

function conversationErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return "The conversation could not be loaded. Please retry.";
  }
  if (error.response?.status === 403) {
    return "Access denied. Only the candidate and responsible hiring team for this application can participate.";
  }
  if (error.response?.status === 404) {
    return "This application conversation is no longer available.";
  }
  if (error.response?.status === 422) {
    return "This conversation link is invalid. Return to your inbox and open it again.";
  }
  return "The conversation service is temporarily unavailable. Please retry.";
}

export default function RecruitmentChatPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const markingReadRef = useRef(false);
  const { applicationId } = use(params);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const handleRealtimeMessage = useCallback((message: ChatMessage) => {
    qc.setQueryData<RecruitmentChatContext>(["recruitment-chat", applicationId], (previous) => {
      if (!previous || previous.messages.some((item) => item.id === message.id)) return previous;
      return { ...previous, messages: [...previous.messages, message] };
    });
    qc.invalidateQueries({ queryKey: ["my-recruitment-chats"] });
  }, [applicationId, qc]);

  const handleMessagesRead = useCallback((messageIds: string[], readAt: string) => {
    const ids = new Set(messageIds);
    qc.setQueryData<RecruitmentChatContext>(["recruitment-chat", applicationId], (previous) => previous ? {
      ...previous,
      messages: previous.messages.map((message) => ids.has(message.id) ? { ...message, read_at: readAt } : message),
    } : previous);
  }, [applicationId, qc]);

  const recruitmentSocket = useRecruitmentChatSocket({
    applicationId,
    onMessage: handleRealtimeMessage,
    onMessagesRead: handleMessagesRead,
  });

  const chatQuery = useQuery({
    queryKey: ["recruitment-chat", applicationId],
    queryFn: () => getRecruitmentChat(applicationId),
    refetchInterval: recruitmentSocket.live ? false : 3000,
    retry: false,
  });
  const ctx = chatQuery.data;
  const olderMessagesMut = useMutation({
    mutationFn: () => getRecruitmentMessagesPage(applicationId, ctx?.next_cursor),
    onSuccess: (page) => {
      qc.setQueryData<RecruitmentChatContext>(["recruitment-chat", applicationId], (previous) => {
        if (!previous) return previous;
        const existing = new Set(previous.messages.map((message) => message.id));
        return {
          ...previous,
          messages: [...page.messages.filter((message) => !existing.has(message.id)), ...previous.messages],
          next_cursor: page.next_cursor,
          has_more: page.has_more,
        };
      });
    },
    onError: () => toast("Could not load earlier messages", { description: "Retry.", variant: "error" }),
  });
  const backHref = me?.role === "CANDIDATE" ? "/chat" : "/company/candidates";

  const unreadIncomingKey = ctx?.messages
    .filter((message) => message.receiver_id === me?.id && !message.read_at)
    .map((message) => message.id)
    .join(",") ?? "";

  useEffect(() => {
    const markVisibleMessagesRead = async () => {
      if (!ctx?.chat_enabled || !unreadIncomingKey || document.visibilityState !== "visible" || !document.hasFocus() || markingReadRef.current) return;
      markingReadRef.current = true;
      try {
        if (recruitmentSocket.markMessagesRead()) return;
        const receipt = await markRecruitmentMessagesRead(applicationId);
        if (receipt.read_at) handleMessagesRead(receipt.message_ids, receipt.read_at);
      } finally {
        markingReadRef.current = false;
      }
    };
    void markVisibleMessagesRead();
    const onVisibilityChange = () => void markVisibleMessagesRead();
    window.addEventListener("focus", onVisibilityChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onVisibilityChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [applicationId, ctx?.chat_enabled, handleMessagesRead, recruitmentSocket.markMessagesRead, unreadIncomingKey]);

  const sendMut = useMutation({
    mutationFn: async (text: string) => {
      if (ctx?.chat_enabled && recruitmentSocket.sendMessage(text)) return null;
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
          status={ctx ? `${recruitmentSocket.live ? "Live" : "Auto-refresh"} · private recruitment conversation` : undefined}
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
            <p>{conversationErrorMessage(chatQuery.error)}</p>
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
            {ctx.has_more ? (
              <div className="border-b border-border-subtle px-4 py-2 text-center">
                <button
                  type="button"
                  className="text-xs font-semibold text-primary underline disabled:opacity-60"
                  disabled={olderMessagesMut.isPending}
                  onClick={() => olderMessagesMut.mutate()}
                >
                  {olderMessagesMut.isPending ? "Loading…" : "Load earlier messages"}
                </button>
              </div>
            ) : null}
            <MessageList
              messages={ctx.messages}
              myId={me?.id}
            />
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
