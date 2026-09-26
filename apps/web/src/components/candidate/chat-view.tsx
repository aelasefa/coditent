"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/types";
import styles from "./chat-workspace.module.css";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageList({
  messages,
  myId,
  peerName = "Someone",
  peerIsTyping = false,
}: {
  messages: ChatMessage[];
  myId?: string;
  peerName?: string;
  peerIsTyping?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, peerIsTyping]);

  if (messages.length === 0 && !peerIsTyping) {
    return <div role="log" aria-label="Messages" className="flex min-h-[240px] flex-1 flex-col items-center justify-center p-6 text-center">
      <p className="text-sm font-semibold text-foreground">No messages yet</p>
      <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-muted-foreground">Start the conversation with a message.</p>
    </div>;
  }

  let lastDay = "";
  let lastSender = "";
  return (
    <div role="log" aria-label="Messages" aria-live="polite" aria-relevant="additions text" className="space-y-1 overflow-y-auto p-4">
      {messages.map((m) => {
        const day = dayLabel(m.created_at);
        const showDay = day && day !== lastDay;
        const mine = myId ? m.sender_id === myId : false;
        const grouped = !showDay && lastSender === m.sender_id;
        lastDay = day;
        lastSender = m.sender_id;
        return (
          <div key={m.id}>
            {showDay ? (
              <p suppressHydrationWarning className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{day}</p>
            ) : null}
            <div className={cn("flex", mine ? "justify-end" : "justify-start", grouped ? "mt-0.5" : "mt-2")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  mine ? "bg-primary text-primary-foreground" : "bg-surface-secondary text-foreground"
                )}
              >
                <p>{m.content}</p>
                <p suppressHydrationWarning className={cn("mt-0.5 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {timeLabel(m.created_at)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      {peerIsTyping ? (
        <div className={styles.typingRow}>
          <div className={styles.typingBubble}>
            <span className="sr-only">{peerName} is typing</span>
            <span aria-hidden="true" className={styles.typingDots}>
              <span />
              <span />
              <span />
            </span>
          </div>
        </div>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}

export function Composer({
  peerName,
  pending,
  disabled,
  disabledReason,
  onSend,
  onTyping,
  onTypingStop,
}: {
  peerName: string;
  pending: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onSend: (text: string) => void;
  onTyping?: (value: string) => void;
  onTypingStop?: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const field = composerRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 112)}px`;
  }, [value]);

  function submit() {
    const text = value.trim();
    if (!text || pending || disabled) return;
    setError(null);
    try {
      onTypingStop?.();
      onSend(text);
      setValue("");
    } catch {
      setError("Message failed to send. Retry.");
    }
  }

  return (
    <form
      noValidate
      className="border-t border-border-subtle bg-surface p-3"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="chat-composer" className="sr-only">
        Message {peerName}
      </label>
      <div className="flex items-end gap-2">
        <textarea
          ref={composerRef}
          id="chat-composer"
          value={value}
          onChange={(e) => {
            const nextValue = e.target.value;
            setValue(nextValue);
            onTyping?.(nextValue);
          }}
          onBlur={() => onTypingStop?.()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={disabled ? disabledReason ?? "Messaging unavailable" : `Message ${peerName}`}
          disabled={disabled || pending}
          rows={2}
          aria-describedby={error ? "chat-composer-error" : undefined}
          className="max-h-28 min-h-14 flex-1 resize-none overflow-y-auto rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
        />
        <Button type="submit" disabled={disabled || pending || !value.trim()} loading={pending}>
          Send
        </Button>
      </div>
      {error ? (
        <p id="chat-composer-error" role="alert" className="mt-1.5 text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
      <p className="mt-1 text-[11px] text-muted-foreground">Enter sends · Shift+Enter newline</p>
    </form>
  );
}

export function ChatHeader({
  title,
  subtitle,
  context,
  status,
  avatarSrc,
  backHref,
}: {
  title: string;
  subtitle?: string;
  context?: string;
  status?: string;
  avatarSrc?: string | null;
  backHref: string;
}) {
  return (
    <div className={styles.chatHeader}>
      <Link href={backHref} className={styles.chatBack}>← All messages</Link>
      <div className={styles.chatHeaderMain}>
        <Avatar name={title} src={avatarSrc} size="md" />
        <div className={styles.chatHeaderText}>
          <span className={styles.eyebrow}>In conversation with</span>
          <h2>{title}</h2>
          {subtitle ? <p className={styles.chatSubtitle}>{subtitle}</p> : null}
          {context ? <p className={styles.chatContext}>{context}</p> : null}
        </div>
        {status ? <span className={styles.chatStatus}>{status}</span> : null}
      </div>
    </div>
  );
}
