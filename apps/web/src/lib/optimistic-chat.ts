import type { ChatMessage } from "@/lib/types";

export function createOptimisticMessage({
  applicationId,
  clientMessageId,
  content,
  receiverId,
  senderId,
}: {
  applicationId?: string | null;
  clientMessageId?: string;
  content: string;
  receiverId: string;
  senderId: string;
}): ChatMessage {
  return {
    id: `optimistic:${clientMessageId ?? crypto.randomUUID()}`,
    sender_id: senderId,
    receiver_id: receiverId,
    application_id: applicationId ?? null,
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
  if (messages.some((message) => message.id === confirmed.id)) {
    return messages.filter((message) => message.id !== optimisticId);
  }
  if (messages.some((message) => message.id === optimisticId)) {
    return messages.map((message) => message.id === optimisticId ? confirmed : message);
  }
  return [...messages, confirmed];
}

export function markOptimisticMessageFailed(messages: ChatMessage[], optimisticId: string): ChatMessage[] {
  return messages.map((message) => message.id === optimisticId ? { ...message, delivery_status: "failed" } : message);
}

export function retryOptimisticMessage(messages: ChatMessage[], optimisticId: string): ChatMessage[] {
  return messages.map((message) => message.id === optimisticId ? { ...message, delivery_status: "sending" } : message);
}
