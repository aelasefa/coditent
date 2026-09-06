"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getConversation, sendMessage } from "@/lib/api";

export default function ChatRoomPage({ params }: { params: { id: string } }) {
  const qc = useQueryClient();
  const { data: messages } = useQuery({ queryKey: ["chat", params.id], queryFn: () => getConversation(params.id), refetchInterval: 3000 });
  const [content, setContent] = useState("");

  const sendMut = useMutation({
    mutationFn: () => sendMessage(params.id, content),
    onSuccess: () => { setContent(""); qc.invalidateQueries({ queryKey: ["chat", params.id] }); },
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-lg font-semibold">Chat with {params.id.slice(0,8)}…</h1>
      <div className="mt-4 space-y-2 rounded-lg border border-zinc-800 bg-zinc-900 p-4 max-h-[60vh] overflow-auto">
        {messages?.map(m=>(
          <div key={m.id} className={`flex ${m.receiver_id===params.id ? "justify-end" : "justify-start"}`}>
            <span className={`rounded-2xl px-3 py-2 text-sm ${m.receiver_id===params.id ? "bg-violet-600 text-white" : "bg-zinc-800 text-zinc-100"}`}>{m.content}</span>
          </div>
        ))}
        {messages?.length===0 && <p className="text-sm text-zinc-500">No messages yet.</p>}
      </div>
      <div className="mt-4 flex gap-2">
        <input value={content} onChange={e=>setContent(e.target.value)} placeholder="Type a message" className="flex-1 rounded-full bg-zinc-800 px-4 py-2 text-sm" onKeyDown={e=>e.key==="Enter" && content.trim() && sendMut.mutate()} />
        <button onClick={()=>sendMut.mutate()} disabled={!content.trim()} className="rounded-full bg-violet-600 px-5 py-2 text-sm text-white disabled:opacity-50">Send</button>
      </div>
    </main>
  );
}
