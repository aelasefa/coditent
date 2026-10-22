"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { getConversationPage, getMe, markFriendMessagesRead, sendMessage, type ChatMessagePage } from "@/lib/api";
import type { ChatMessage, ConversationSummary, FriendChatContext } from "@/lib/types";
import { ChatWorkspace } from "@/components/candidate/chat-workspace";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ChatHeader, Composer, MessageList } from "@/components/candidate/chat-view";
import styles from "@/components/candidate/chat-workspace.module.css";
import { useFriendChatSocket } from "@/hooks/use-friend-chat-socket";
import { confirmOptimisticMessage, createOptimisticMessage, markOptimisticMessageFailed, retryOptimisticMessage } from "@/lib/optimistic-chat";
import { clearConversationUnread } from "@/lib/friend-ui";

type FriendChatPage = ChatMessagePage & Pick<FriendChatContext, "peer" | "can_message" | "relationship_state" | "conversation_type">;

export default function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const markingReadRef = useRef(false);
  const [pendingSendCount, setPendingSendCount] = useState(0);
  const { id } = use(params);
  const meQuery = useQuery({ queryKey: ["me"], queryFn: getMe });

  const updatePages = useCallback((updater: (page: FriendChatPage) => FriendChatPage) => {
    qc.setQueryData<InfiniteData<FriendChatPage, string | null>>(["chat", id], (previous) => previous ? {
      ...previous,
      pages: previous.pages.map(updater),
    } : previous);
  }, [id, qc]);

  const clearUnreadBadge = useCallback(() => {
    qc.setQueryData<ConversationSummary[]>(["conversation-inbox"], (previous) => (
      clearConversationUnread(previous, `/chat/${id}`)
    ));
  }, [id, qc]);

  const handleRealtimeMessage = useCallback((message: ChatMessage, clientMessageId?: string) => {
    qc.setQueryData<InfiniteData<FriendChatPage, string | null>>(["chat", id], (previous) => {
      if (!previous) return previous;
      const optimisticId = clientMessageId ? `optimistic:${clientMessageId}` : null;
      const alreadyConfirmed = previous.pages.some((page) => page.messages.some((item) => item.id === message.id));
      if (alreadyConfirmed && !optimisticId) return previous;
      return {
        ...previous,
        pages: previous.pages.map((page, index) => index === 0 ? {
          ...page,
          messages: optimisticId
            ? confirmOptimisticMessage(page.messages, optimisticId, message)
            : [...page.messages, message],
        } : page),
      };
    });
    void qc.invalidateQueries({ queryKey: ["conversation-inbox"] });
  }, [id, qc]);

  const handleMessagesRead = useCallback((messageIds: string[], readAt: string) => {
    const ids = new Set(messageIds);
    updatePages((page) => ({ ...page, messages: page.messages.map((message) => ids.has(message.id) ? { ...message, read_at: readAt } : message) }));
    void qc.invalidateQueries({ queryKey: ["conversation-inbox"] });
  }, [qc, updatePages]);

  const handleRevoked = useCallback(() => {
    updatePages((page) => ({ ...page, can_message: false, relationship_state: "NONE" }));
    void qc.invalidateQueries({ queryKey: ["conversation-inbox"] });
    toast("Friendship changed", { description: "This conversation is now read-only." });
  }, [qc, toast, updatePages]);

  const { live, markMessagesRead: markRealtimeMessagesRead, sendMessage: sendRealtimeMessage } = useFriendChatSocket({
    peerId: id,
    onMessage: handleRealtimeMessage,
    onMessagesRead: handleMessagesRead,
    onRevoked: handleRevoked,
    onReady: () => {
      if (pendingSendCount === 0) void qc.invalidateQueries({ queryKey: ["chat", id] });
      void qc.invalidateQueries({ queryKey: ["conversation-inbox"] });
    },
  });

  const msgQuery = useInfiniteQuery({
    queryKey: ["chat", id],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => getConversationPage(id, pageParam),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    refetchInterval: live || pendingSendCount > 0 ? false : 3000,
    refetchOnReconnect: !live && pendingSendCount === 0,
    refetchOnWindowFocus: !live && pendingSendCount === 0,
    retry: false,
  });

  const context = msgQuery.data?.pages[0];
  const messages = Array.from(new Map(
    (msgQuery.data?.pages ?? []).slice().reverse().flatMap((page) => page.messages).map((message) => [message.id, message]),
  ).values()).sort((left, right) => {
    const byTime = new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    return byTime || left.id.localeCompare(right.id);
  });
  const unreadIncomingKey = messages.filter((message) => message.receiver_id === meQuery.data?.id && !message.read_at).map((message) => message.id).join(",");

  useEffect(() => {
    const markVisibleMessagesRead = async () => {
      if (!context?.can_message || !unreadIncomingKey || document.visibilityState !== "visible" || markingReadRef.current) return;
      markingReadRef.current = true;
      clearUnreadBadge();
      try {
        if (markRealtimeMessagesRead()) return;
        const receipt = await markFriendMessagesRead(id);
        if (receipt.read_at) handleMessagesRead(receipt.message_ids, receipt.read_at);
      } catch {
        void qc.invalidateQueries({ queryKey: ["conversation-inbox"] });
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
  }, [clearUnreadBadge, context?.can_message, handleMessagesRead, id, markRealtimeMessagesRead, qc, unreadIncomingKey]);

  const sendMut = useMutation({
    mutationFn: async ({ text, clientMessageId }: { text: string; clientMessageId: string }) => {
      const realtime = context?.can_message ? sendRealtimeMessage(text, clientMessageId) : null;
      return realtime ?? sendMessage(id, text);
    },
    onMutate: async ({ text, clientMessageId }) => {
      setPendingSendCount((count) => count + 1);
      await qc.cancelQueries({ queryKey: ["chat", id], exact: true });
      const optimistic = createOptimisticMessage({
        clientMessageId,
        content: text,
        receiverId: context?.peer?.id ?? id,
        senderId: meQuery.data?.id ?? "optimistic-self",
      });
      qc.setQueryData<InfiniteData<FriendChatPage, string | null>>(["chat", id], (previous) => previous ? {
        ...previous,
        pages: previous.pages.map((page, index) => index === 0 ? {
          ...page,
          messages: page.messages.some((message) => message.id === optimistic.id)
            ? retryOptimisticMessage(page.messages, optimistic.id)
            : [...page.messages, optimistic],
        } : page),
      } : previous);
      return { optimisticId: optimistic.id };
    },
    onSuccess: (created, _variables, mutationContext) => {
      if (mutationContext) {
        qc.setQueryData<InfiniteData<FriendChatPage, string | null>>(["chat", id], (previous) => previous ? {
          ...previous,
          pages: previous.pages.map((page, index) => index === 0 ? {
            ...page,
            messages: confirmOptimisticMessage(page.messages, mutationContext.optimisticId, created),
          } : page),
        } : previous);
      } else {
        handleRealtimeMessage(created);
      }
      void qc.invalidateQueries({ queryKey: ["conversation-inbox"] });
    },
    onError: (_error, _variables, mutationContext) => {
      if (mutationContext) {
        qc.setQueryData<InfiniteData<FriendChatPage, string | null>>(["chat", id], (previous) => previous ? {
          ...previous,
          pages: previous.pages.map((page, index) => index === 0 ? {
            ...page,
            messages: markOptimisticMessageFailed(page.messages, mutationContext.optimisticId),
          } : page),
        } : previous);
      }
      toast("Message failed to send", { description: "Retry from the message bubble.", variant: "error" });
    },
    onSettled: () => setPendingSendCount((count) => Math.max(0, count - 1)),
  });

  const retryMessage = (message: ChatMessage) => {
    const clientMessageId = message.id.startsWith("optimistic:")
      ? message.id.slice("optimistic:".length)
      : crypto.randomUUID();
    sendMut.mutate({ text: message.content, clientMessageId });
  };

  const peer = context?.peer;
  return (
    <ChatWorkspace activeHref={`/chat/${id}`} profile={peer ? { id: peer.id, name: peer.full_name, avatarUrl: peer.avatar_url, role: "CANDIDATE" } : null}>
      <ChatHeader title={peer?.full_name ?? "Friend conversation"} subtitle={peer?.headline ?? "Candidate"} avatarSrc={peer?.avatar_url} status={context ? `Friend · ${peer?.is_online ? "Online" : live ? "Live" : "Offline"}` : undefined} backHref="/chat" />
      {msgQuery.isLoading ? (
        <div className={styles.threadLoading} role="status" aria-label="Loading messages">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : msgQuery.isError ? (
        <div role="alert" className={styles.threadNotice}><strong>Conversation unavailable.</strong><p>Only accepted friends can start a direct conversation.</p><button type="button" onClick={() => msgQuery.refetch()}>Retry</button></div>
      ) : (
        <>
          {msgQuery.hasNextPage ? <div className="border-b border-border-subtle px-4 py-2 text-center"><button type="button" className="text-xs font-semibold text-primary underline disabled:opacity-60" disabled={msgQuery.isFetchingNextPage} onClick={() => void msgQuery.fetchNextPage()}>{msgQuery.isFetchingNextPage ? "Loading…" : "Load earlier messages"}</button></div> : null}
          <MessageList messages={messages} myId={meQuery.data?.id} onRetry={retryMessage} />
          {context?.can_message ? <Composer peerName={peer?.full_name ?? "friend"} pending={false} onSend={(text) => sendMut.mutate({ text, clientMessageId: crypto.randomUUID() })} /> : <div className={styles.threadNotice} role="status"><strong>Read-only conversation</strong><p>You can send new messages only while this candidate is your friend.</p></div>}
        </>
      )}
    </ChatWorkspace>
  );
}
