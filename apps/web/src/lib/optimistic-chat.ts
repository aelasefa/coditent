import type { ChatMessage } from "@/lib/types";

export function createOptimisticMessage({
  applicationId,
  content,
  receiverId,
  senderId,
}: {
  applicationId: string;
  content: string;
  receiverId: string;
  senderId: string;
}): ChatMessage {
  return {
    id: `optimistic:${crypto.randomUUID()}`,
    sender_id: senderId,
    receiver_id: receiverId,
    application_id: applicationId,
    content,
    created_at: new Date().toISOString(),
    read_at: null,
    delivery_status: "sending",
  };
}

export function confirmOptimisticMessage(
  messages: ChatMessage[],
  optimisticId: string,
  confirmed: ChatMessage,
): ChatMessage[] {
  const withoutOptimistic = messages.filter((message) => message.id !== optimisticId);
  return withoutOptimistic.some((message) => message.id === confirmed.id)
    ? withoutOptimistic
    : [...withoutOptimistic, confirmed];
}

export function removeOptimisticMessage(messages: ChatMessage[], optimisticId: string): ChatMessage[] {
  return messages.filter((message) => message.id !== optimisticId);
}
