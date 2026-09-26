"use client";

import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getApiBaseUrl,
  getMe,
  getRecruitmentChat,
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

export default function RecruitmentChatPage({ params }: { params: { applicationId: string } }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { applicationId } = params;
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const handleRealtimeMessage = useCallback((message: ChatMessage) => {
    qc.setQueryData<RecruitmentChatContext>(["recruitment-chat", applicationId], (previous) => {
      if (!previous || previous.messages.some((item) => item.id === message.id)) return previous;
      return { ...previous, messages: [...previous.messages, message] };
    });
    qc.invalidateQueries({ queryKey: ["my-recruitment-chats"] });
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
  const backHref = me?.role === "CANDIDATE" ? "/chat" : "/company/candidates";

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
            <MessageList
              messages={ctx.messages}
              myId={me?.id}
              peerName={peerName}
              peerIsTyping={recruitmentSocket.peerIsTyping}
            />
            <Composer
              peerName={peerName}
              pending={sendMut.isPending}
              onSend={(text) => sendMut.mutate(text)}
              onTyping={recruitmentSocket.notifyTyping}
              onTypingStop={recruitmentSocket.stopTyping}
            />
          </>
        )}
    </ChatWorkspace>
  );
}
