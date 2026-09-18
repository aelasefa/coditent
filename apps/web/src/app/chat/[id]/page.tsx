"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getConversation, getConversations, getMe, sendMessage } from "@/lib/api";
import { ChatWorkspace } from "@/components/candidate/chat-workspace";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ChatHeader, Composer, MessageList } from "@/components/candidate/chat-view";
import styles from "@/components/candidate/chat-workspace.module.css";

export default function ChatRoomPage({ params }: { params: { id: string } }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const meQuery = useQuery({ queryKey: ["me"], queryFn: getMe });
  const convQuery = useQuery({ queryKey: ["conversations"], queryFn: getConversations, staleTime: 60_000 });
  const msgQuery = useQuery({
    queryKey: ["chat", params.id],
    queryFn: () => getConversation(params.id),
    refetchInterval: 3000,
  });

  const peer = (convQuery.data ?? []).find((c) => c.user.id === params.id)?.user ?? null;
  const title = peer?.full_name ?? "Conversation";
  const subtitle = peer ? peer.role : undefined;

  const sendMut = useMutation({
    mutationFn: (text: string) => sendMessage(params.id, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", params.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: () => toast("Message failed to send", { description: "Retry.", variant: "error" }),
  });

  return (
    <ChatWorkspace activeHref={`/chat/${params.id}`}>
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
          <MessageList messages={msgQuery.data ?? []} myId={meQuery.data?.id} />
        )}
        <Composer
          peerName={peer?.full_name ?? "recruiter"}
          pending={sendMut.isPending}
          onSend={(text) => sendMut.mutate(text)}
        />
    </ChatWorkspace>
  );
}
