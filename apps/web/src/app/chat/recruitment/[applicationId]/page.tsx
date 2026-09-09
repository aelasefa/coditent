"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMe,
  getRecruitmentChat,
  getRecruitmentWsUrl,
  sendRecruitmentMessage,
} from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import { AUTH_TOKEN_KEY } from "@/lib/constants";

function stageLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function RecruitmentChatPage({ params }: { params: { applicationId: string } }) {
  const qc = useQueryClient();
  const { applicationId } = params;
  const [content, setContent] = useState("");
  const [wsLive, setWsLive] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const chatQuery = useQuery({
    queryKey: ["recruitment-chat", applicationId],
    queryFn: () => getRecruitmentChat(applicationId),
    // Polling fallback while the socket is not connected (matches existing chat pattern).
    refetchInterval: wsLive ? false : 3000,
    retry: false,
  });
  const ctx = chatQuery.data;
  const backHref = me?.role === "CANDIDATE" ? "/dashboard/applications" : "/company/candidates";

  // Realtime: one socket per application. Auth re-checked server-side per message.
  useEffect(() => {
    if (typeof window === "undefined" || !localStorage.getItem(AUTH_TOKEN_KEY)) return;
    let closed = false;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(getRecruitmentWsUrl(applicationId));
    } catch {
      return;
    }
    wsRef.current = ws;
    ws.onopen = () => {
      if (!closed) setWsLive(true);
    };
    ws.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data as string) as { type: string; message?: ChatMessage };
        if (payload.type === "message" && payload.message) {
          qc.setQueryData(["recruitment-chat", applicationId], (prev: typeof ctx) =>
            prev ? { ...prev, messages: [...prev.messages, payload.message as ChatMessage] } : prev
          );
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      if (!closed) setWsLive(false);
    };
    ws.onerror = () => {
      try {
        ws?.close();
      } catch {
        /* noop */
      }
    };
    return () => {
      closed = true;
      setWsLive(false);
      try {
        ws?.close();
      } catch {
        /* noop */
      }
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ctx?.messages?.length]);

  const sendMut = useMutation({
    mutationFn: async (text: string) => {
      // Prefer the socket; fall back to REST on failure.
      const sock = wsRef.current;
      if (sock && sock.readyState === WebSocket.OPEN && ctx?.chat_enabled) {
        sock.send(JSON.stringify({ content: text }));
        return null;
      }
      return sendRecruitmentMessage(applicationId, text);
    },
    onSuccess: (created) => {
      setContent("");
      if (created) qc.invalidateQueries({ queryKey: ["recruitment-chat", applicationId] });
    },
  });

  const send = () => {
    const text = content.trim();
    if (!text || sendMut.isPending || !ctx?.chat_enabled) return;
    // Optimistic echo only for the REST path is handled by invalidation;
    // socket confirmations arrive as "message" frames.
    sendMut.mutate(text);
    if (!(wsRef.current && wsRef.current.readyState === WebSocket.OPEN)) {
      // REST path clears on success; keep local clear immediate for socket path.
    } else {
      setContent("");
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href={backHref} className="text-xs font-medium text-violet-400 hover:text-violet-300">
        ← Back
      </Link>

      {chatQuery.isLoading && (
        <div className="mt-6 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-zinc-800/60" />
          ))}
        </div>
      )}

      {chatQuery.isError && (
        <div className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
          <p className="text-sm font-semibold text-rose-300">Conversation unavailable</p>
          <p className="mt-1 text-xs text-rose-200/70">
            You don&apos;t have access to this recruitment chat. Only the candidate and the
            responsible HR for this application can participate.
          </p>
        </div>
      )}

      {ctx && (
        <div className="mt-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-sm font-bold text-zinc-100">{ctx.offer_title}</p>
            <p className="mt-0.5 text-xs text-zinc-400">
              {ctx.company_name ?? "Company"} · {stageLabel(ctx.status)}
              {ctx.peer ? ` · ${me?.role === "CANDIDATE" ? "Recruiter" : "Candidate"}: ${ctx.peer.full_name}` : ""}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {wsLive ? "Live connection" : "Live updates via refresh"} · Private recruitment conversation
            </p>
          </div>

          {!ctx.chat_enabled ? (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
              <p className="text-sm font-semibold text-amber-200">Chat not yet available</p>
              <p className="mt-1 text-xs text-amber-100/70">
                Available after your application progresses to the next stage. You&apos;ll be able
                to communicate directly with the responsible recruiter then.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-4 max-h-[55vh] space-y-2 overflow-auto rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                {ctx.messages.map((m) => {
                  const mine = me && m.sender_id === me.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <span
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                          mine ? "bg-violet-600 text-white" : "bg-zinc-800 text-zinc-100"
                        }`}
                      >
                        {m.content}
                      </span>
                    </div>
                  );
                })}
                {ctx.messages.length === 0 && (
                  <p className="text-center text-xs text-zinc-500">
                    Your application has progressed to the next stage. You can now communicate
                    directly with the responsible recruiter. Say hello!
                  </p>
                )}
                <div ref={bottomRef} />
              </div>
              <div className="mt-4 flex gap-2">
                <input
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder={`Message ${ctx.peer?.full_name ?? "recruiter"}`}
                  aria-label="Message"
                  className="flex-1 rounded-full bg-zinc-800 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-600"
                />
                <button
                  onClick={send}
                  disabled={!content.trim() || sendMut.isPending}
                  className="rounded-full bg-violet-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
