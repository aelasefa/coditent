"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/types";

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

export function MessageList({ messages, myId }: { messages: ChatMessage[]; myId?: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (messages.length === 0) {
    return <p className="py-6 text-center text-[13px] text-muted-foreground">No messages yet. Say hello.</p>;
  }

  let lastDay = "";
  let lastSender = "";
  return (
    <div role="log" aria-label="Messages" aria-live="polite" className="space-y-1 overflow-y-auto p-4">
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
              <p className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{day}</p>
            ) : null}
            <div className={cn("flex", mine ? "justify-end" : "justify-start", grouped ? "mt-0.5" : "mt-2")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  mine ? "bg-primary text-primary-foreground" : "bg-surface-secondary text-foreground"
                )}
              >
                <p>{m.content}</p>
                <p className={cn("mt-0.5 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {timeLabel(m.created_at)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
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
}: {
  peerName: string;
  pending: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const text = value.trim();
    if (!text || pending || disabled) return;
    setError(null);
    try {
      onSend(text);
      setValue("");
    } catch {
      setError("Message failed to send. Retry.");
    }
  }

  return (
    <form
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
          id="chat-composer"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={disabled ? disabledReason ?? "Messaging unavailable" : `Message ${peerName}`}
          disabled={disabled || pending}
          rows={1}
          aria-describedby={error ? "chat-composer-error" : undefined}
          className="max-h-28 min-h-11 flex-1 resize-y rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
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
  status,
  backHref,
}: {
  title: string;
  subtitle?: string;
  status?: string;
  backHref: string;
}) {
  return (
    <div className="border-b border-border-subtle bg-surface px-4 py-3">
      <a href={backHref} className="text-xs font-semibold text-primary hover:underline">
        ← Back
      </a>
      <div className="mt-1.5 flex items-center gap-2.5">
        <Avatar name={title} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{title}</p>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
          {status ? <p className="text-[11px] text-muted-foreground">{status}</p> : null}
        </div>
      </div>
    </div>
  );
}
