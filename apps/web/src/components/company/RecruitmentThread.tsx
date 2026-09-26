"use client";

import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe, getRecruitmentChat, sendRecruitmentMessage } from "@/lib/api";
import type { ChatMessage, RecruitmentChatContext } from "@/lib/types";
import { MessageList, Composer } from "@/components/candidate/chat-view";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useRecruitmentChatSocket } from "@/hooks/use-recruitment-chat-socket";

export function RecruitmentThread({ applicationId, peerName }: { applicationId: string; peerName: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });

  const handleRealtimeMessage = useCallback((message: ChatMessage) => {
    qc.setQueryData<RecruitmentChatContext>(["recruitment-chat", applicationId], (previous) => {
      if (!previous || previous.messages.some((item) => item.id === message.id)) return previous;
      return { ...previous, messages: [...previous.messages, message] };
    });
  }, [applicationId, qc]);

  const recruitmentSocket = useRecruitmentChatSocket({
    applicationId,
    currentUserId: me?.id,
    onMessage: handleRealtimeMessage,
  });

  const chatQuery = useQuery({
    queryKey: ["recruitment-chat", applicationId],
    queryFn: () => getRecruitmentChat(applicationId),
    refetchInterval: recruitmentSocket.live ? false : 3000,
    retry: false,
  });
  const ctx = chatQuery.data;

  useEffect(() => {
    if (!ctx?.chat_enabled) recruitmentSocket.stopTyping();
  }, [ctx?.chat_enabled, recruitmentSocket.stopTyping]);

  const sendMut = useMutation({
    mutationFn: async (text: string) => {
      if (ctx?.chat_enabled && recruitmentSocket.sendMessage(text)) return null;
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
        {recruitmentSocket.live ? "Live" : "Auto-refresh"} · private recruitment conversation
      </p>
      <div className="min-h-0 flex-1">
        <MessageList
          messages={ctx.messages}
          myId={me?.id}
          peerName={peerName}
          peerIsTyping={recruitmentSocket.peerIsTyping}
        />
      </div>
      <Composer
        peerName={peerName}
        pending={sendMut.isPending}
        onSend={(text) => sendMut.mutate(text)}
        onTyping={recruitmentSocket.notifyTyping}
        onTypingStop={recruitmentSocket.stopTyping}
      />
    </div>
  );
}
