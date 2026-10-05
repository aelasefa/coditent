"use client";
import { use } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getConversationPage, getConversations, getMe, sendMessage } from "@/lib/api";
import { ChatWorkspace } from "@/components/candidate/chat-workspace";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ChatHeader, Composer, MessageList } from "@/components/candidate/chat-view";
import { getChatRoleLabel } from "@/components/candidate/chat-participant-profile";
import styles from "@/components/candidate/chat-workspace.module.css";

export default function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { id } = use(params);
  const meQuery = useQuery({ queryKey: ["me"], queryFn: getMe });
  const convQuery = useQuery({ queryKey: ["conversations"], queryFn: getConversations, staleTime: 60_000 });
  const msgQuery = useInfiniteQuery({
    queryKey: ["chat", id],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => getConversationPage(id, pageParam),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    refetchInterval: 3000,
  });

  const messages = Array.from(
    new Map(
      (msgQuery.data?.pages ?? [])
        .slice()
        .reverse()
        .flatMap((page) => page.messages)
        .map((message) => [message.id, message]),
    ).values(),
  ).sort((left, right) => {
    const byTime = new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    return byTime || left.id.localeCompare(right.id);
  });

  const peer = (convQuery.data ?? []).find((c) => c.user.id === id)?.user ?? null;
  const title = peer?.full_name ?? "Conversation";
  const subtitle = peer ? getChatRoleLabel(peer.role, peer.company_role) : undefined;

  const sendMut = useMutation({
    mutationFn: (text: string) => sendMessage(id, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: () => toast("Message failed to send", { description: "Retry.", variant: "error" }),
  });

  return (
    <ChatWorkspace activeHref={`/chat/${id}`} profile={peer ? {
      id: peer.id,
      name: peer.full_name,
      avatarUrl: peer.avatar_url,
      role: peer.role,
      companyRole: peer.company_role,
      companyId: peer.company_id,
      email: peer.email,
    } : null}>
        <ChatHeader title={title} subtitle={subtitle} avatarSrc={peer?.avatar_url} backHref="/chat" />
        {msgQuery.isLoading ? (
          <div className={styles.threadLoading} role="status" aria-label="Loading messages">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : msgQuery.isError ? (
          <div role="alert" className={styles.threadNotice}>
            <strong>Conversation unavailable.</strong>
            <button type="button" onClick={() => msgQuery.refetch()}>
              Retry
            </button>
          </div>
        ) : (
          <>
            {msgQuery.hasNextPage ? (
              <div className="border-b border-border-subtle px-4 py-2 text-center">
                <button
                  type="button"
                  className="text-xs font-semibold text-primary underline disabled:opacity-60"
                  disabled={msgQuery.isFetchingNextPage}
                  onClick={() => void msgQuery.fetchNextPage()}
                >
                  {msgQuery.isFetchingNextPage ? "Loading…" : "Load earlier messages"}
                </button>
              </div>
            ) : null}
            <MessageList messages={messages} myId={meQuery.data?.id} />
          </>
        )}
        <Composer
          peerName={peer?.full_name ?? "recruiter"}
          pending={sendMut.isPending}
          onSend={(text) => sendMut.mutate(text)}
        />
    </ChatWorkspace>
  );
}
