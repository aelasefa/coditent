"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getConversation, getConversations, getMe, sendMessage } from "@/lib/api";
import { PageContainer } from "@/components/shell/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ChatHeader, Composer, MessageList } from "@/components/candidate/chat-view";

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", params.id] }),
    onError: () => toast("Message failed to send", { description: "Retry.", variant: "error" }),
  });

  return (
    <PageContainer variant="full" className="max-w-3xl">
      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
        <ChatHeader title={title} subtitle={subtitle} backHref="/chat" />
        {msgQuery.isLoading ? (
          <div className="space-y-2 p-4" role="status" aria-label="Loading messages">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : msgQuery.isError ? (
          <div role="alert" className="p-6 text-center">
            <p className="text-sm font-semibold text-danger">Conversation unavailable.</p>
            <button type="button" onClick={() => msgQuery.refetch()} className="mt-2 text-sm font-semibold text-danger underline">
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
      </div>
    </PageContainer>
  );
}
