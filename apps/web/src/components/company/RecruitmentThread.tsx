"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe, getRecruitmentChat, getRecruitmentMessagesPage, markRecruitmentMessagesRead, sendRecruitmentMessage } from "@/lib/api";
import type { ChatMessage, RecruitmentChatContext } from "@/lib/types";
import { MessageList, Composer } from "@/components/candidate/chat-view";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useRecruitmentChatSocket } from "@/hooks/use-recruitment-chat-socket";
import { recruitmentChatErrorMessage } from "@/lib/recruitment-chat-error";
import { confirmOptimisticMessage, createOptimisticMessage, removeOptimisticMessage } from "@/lib/optimistic-chat";

export function RecruitmentThread({ applicationId, peerName }: { applicationId: string; peerName: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const markingReadRef = useRef(false);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });

  const handleRealtimeMessage = useCallback((message: ChatMessage) => {
    qc.setQueryData<RecruitmentChatContext>(["recruitment-chat", applicationId], (previous) => {
      if (!previous || previous.messages.some((item) => item.id === message.id)) return previous;
      return { ...previous, messages: [...previous.messages, message] };
    });
  }, [applicationId, qc]);

  const handleMessagesRead = useCallback((messageIds: string[], readAt: string) => {
    const ids = new Set(messageIds);
    qc.setQueryData<RecruitmentChatContext>(["recruitment-chat", applicationId], (previous) => previous ? {
      ...previous,
      messages: previous.messages.map((message) => ids.has(message.id) ? { ...message, read_at: readAt } : message),
    } : previous);
  }, [applicationId, qc]);

  const {
    live: recruitmentLive,
    markMessagesRead: markRealtimeMessagesRead,
    sendMessage: sendRealtimeMessage,
  } = useRecruitmentChatSocket({
    applicationId,
    onMessage: handleRealtimeMessage,
    onMessagesRead: handleMessagesRead,
    onReady: () => {
      void qc.invalidateQueries({ queryKey: ["recruitment-chat", applicationId] });
      void qc.invalidateQueries({ queryKey: ["conversation-inbox"] });
    },
  });

  const chatQuery = useQuery({
    queryKey: ["recruitment-chat", applicationId],
    queryFn: () => getRecruitmentChat(applicationId),
    refetchInterval: recruitmentLive ? false : 3000,
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

  const unreadIncomingKey = ctx?.messages
    .filter((message) => message.receiver_id === me?.id && !message.read_at)
    .map((message) => message.id)
    .join(",") ?? "";

  useEffect(() => {
    const markVisibleMessagesRead = async () => {
      if (!ctx?.chat_enabled || !unreadIncomingKey || document.visibilityState !== "visible" || !document.hasFocus() || markingReadRef.current) return;
      markingReadRef.current = true;
      try {
        if (markRealtimeMessagesRead()) return;
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
  }, [applicationId, ctx?.chat_enabled, handleMessagesRead, markRealtimeMessagesRead, unreadIncomingKey]);

  const sendMut = useMutation({
    mutationFn: async (text: string) => {
      const realtime = ctx?.chat_enabled ? sendRealtimeMessage(text) : null;
      if (realtime) return realtime;
      return sendRecruitmentMessage(applicationId, text);
    },
    onMutate: (text) => {
      if (!me?.id || !ctx?.peer?.id) return undefined;
      const optimistic = createOptimisticMessage({
        applicationId,
        content: text,
        receiverId: ctx.peer.id,
        senderId: me.id,
      });
      qc.setQueryData<RecruitmentChatContext>(["recruitment-chat", applicationId], (previous) => previous ? {
        ...previous,
        messages: [...previous.messages, optimistic],
      } : previous);
      return { optimisticId: optimistic.id };
    },
    onSuccess: (created, _text, mutationContext) => {
      if (!mutationContext) {
        handleRealtimeMessage(created);
        return;
      }
      qc.setQueryData<RecruitmentChatContext>(["recruitment-chat", applicationId], (previous) => previous ? {
        ...previous,
        messages: confirmOptimisticMessage(previous.messages, mutationContext.optimisticId, created),
      } : previous);
    },
    onError: (_error, _text, mutationContext) => {
      if (mutationContext) {
        qc.setQueryData<RecruitmentChatContext>(["recruitment-chat", applicationId], (previous) => previous ? {
          ...previous,
          messages: removeOptimisticMessage(previous.messages, mutationContext.optimisticId),
        } : previous);
      }
      toast("Message failed to send", { description: "Retry.", variant: "error" });
    },
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
          {recruitmentChatErrorMessage(chatQuery.error)}
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
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2 bg-surface-secondary/40 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <span className={`h-2 w-2 rounded-full ${recruitmentLive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/60"}`} />
          {recruitmentLive ? "Live updates" : "Auto-refresh active"}
        </span>
        <span className="text-[11px] font-medium">Private candidate discussion</span>
      </div>
      {ctx.has_more ? (
        <div className="border-b border-border-subtle px-4 py-2 text-center bg-surface-secondary/20">
          <button
            type="button"
            className="text-xs font-semibold text-primary hover:underline disabled:opacity-60"
            disabled={olderMessagesMut.isPending}
            onClick={() => olderMessagesMut.mutate()}
          >
            {olderMessagesMut.isPending ? "Loading older messages…" : "↑ Load earlier messages"}
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MessageList
          messages={ctx.messages}
          myId={me?.id}
        />
      </div>
      <Composer
        peerName={peerName}
        pending={false}
        onSend={(text) => sendMut.mutateAsync(text).then(() => undefined)}
      />
    </div>
  );
}
