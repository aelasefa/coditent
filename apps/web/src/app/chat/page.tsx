"use client";
import { useQuery } from "@tanstack/react-query";
import { getConversations } from "@/lib/api";
import Link from "next/link";

export default function ChatListPage() {
  const { data } = useQuery({ queryKey: ["conversations"], queryFn: getConversations });
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Chat</h1>
      <p className="text-sm text-zinc-500">Candidate ↔ Recruiter conversations. Start from a request.</p>
      <div className="mt-6 space-y-2">
        {data?.map(c=>(
          <Link key={c.user.id} href={`/chat/${c.user.id}`} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 hover:border-violet-600">
            <div className="flex items-center gap-3">
              {c.user.avatar_url ? <img src={c.user.avatar_url} alt={c.user.full_name} className="h-8 w-8 rounded-full object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-xs text-white">{c.user.full_name.slice(0,2).toUpperCase()}</span>}
              <div>
                <p className="text-sm font-medium">{c.user.full_name} · {c.user.role}</p>
                <p className="text-xs text-zinc-500 truncate max-w-[260px]">{c.last_message}</p>
              </div>
            </div>
            <span className="text-xs text-zinc-600">{new Date(c.last_at).toLocaleDateString()}</span>
          </Link>
        ))}
        {data?.length===0 && <p className="text-sm text-zinc-500">No conversations yet. Accept a request to start chatting.</p>}
      </div>
    </main>
  );
}
