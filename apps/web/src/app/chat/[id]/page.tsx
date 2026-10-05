"use client";

import { use, useCallback, useEffect, useRef } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { getConversationPage, getMe, markFriendMessagesRead, sendMessage, type ChatMessagePage } from "@/lib/api";
import type { ChatMessage, FriendChatContext } from "@/lib/types";
import { ChatWorkspace } from "@/components/candidate/chat-workspace";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ChatHeader, Composer, MessageList } from "@/components/candidate/chat-view";
import styles from "@/components/candidate/chat-workspace.module.css";
import { useFriendChatSocket } from "@/hooks/use-friend-chat-socket";

type FriendChatPage = ChatMessagePage & Pick<FriendChatContext, "peer" | "can_message" | "relationship_state" | "conversation_type">;

export default function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const markingReadRef = useRef(false);
  const { id } = use(params);
  const meQuery = useQuery({ queryKey: ["me"], queryFn: getMe });

  const updatePages = useCallback((updater: (page: FriendChatPage) => FriendChatPage) => {
    qc.setQueryData<InfiniteData<FriendChatPage, string | null>>(["chat", id], (previous) => previous ? {
      ...previous,
      pages: previous.pages.map(updater),
    } : previous);
  }, [id, qc]);

  const handleRealtimeMessage = useCallback((message: ChatMessage) => {
    qc.setQueryData<InfiniteData<FriendChatPage, string | null>>(["chat", id], (previous) => {
      if (!previous || previous.pages.some((page) => page.messages.some((item) => item.id === message.id))) return previous;
      return { ...previous, pages: previous.pages.map((page, index) => index === 0 ? { ...page, messages: [...page.messages, message] } : page) };
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
  });

  const msgQuery = useInfiniteQuery({
    queryKey: ["chat", id],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => getConversationPage(id, pageParam),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    refetchInterval: live ? false : 3000,
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
      if (!context?.can_message || !unreadIncomingKey || document.visibilityState !== "visible" || !document.hasFocus() || markingReadRef.current) return;
      markingReadRef.current = true;
      try {
        if (markRealtimeMessagesRead()) return;
        const receipt = await markFriendMessagesRead(id);
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
  }, [context?.can_message, handleMessagesRead, id, markRealtimeMessagesRead, unreadIncomingKey]);

  const sendMut = useMutation({
    mutationFn: async (text: string) => context?.can_message && sendRealtimeMessage(text) ? null : sendMessage(id, text),
    onSuccess: (created) => {
      if (created) handleRealtimeMessage(created);
      void qc.invalidateQueries({ queryKey: ["conversation-inbox"] });
    },
    onError: () => toast("Message failed to send", { description: "Retry.", variant: "error" }),
  });

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
          <MessageList messages={messages} myId={meQuery.data?.id} />
          {context?.can_message ? <Composer peerName={peer?.full_name ?? "friend"} pending={sendMut.isPending} onSend={(text) => sendMut.mutate(text)} /> : <div className={styles.threadNotice} role="status"><strong>Read-only conversation</strong><p>You can send new messages only while this candidate is your friend.</p></div>}
        </>
      )}
    </ChatWorkspace>
  );
}
