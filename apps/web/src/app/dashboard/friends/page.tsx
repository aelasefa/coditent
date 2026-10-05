"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FiCheck, FiMessageCircle, FiSearch, FiUserPlus, FiUsers, FiX } from "react-icons/fi";
import { PageContainer } from "@/components/shell/page-container";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  acceptFriendRequest,
  blockCandidate,
  cancelFriendRequest,
  declineFriendRequest,
  getPublicCandidateProfile,
  listFriends,
  listBlockedCandidates,
  listIncomingFriendRequests,
  listSentFriendRequests,
  removeFriend,
  searchPeople,
  sendFriendRequest,
  sendPresenceHeartbeat,
  unblockCandidate,
} from "@/lib/api";
import type { FriendItem } from "@/lib/types";
import { friendActionFor } from "@/lib/friend-ui";

function lastSeenLabel(friend: FriendItem): string {
  if (friend.is_online) return "Online now";
  if (!friend.last_seen) return "Offline";
  return `Last seen ${new Date(friend.last_seen).toLocaleString()}`;
}

export default function FriendsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [sort, setSort] = useState<"name" | "recent">("name");
  const [search, setSearch] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const normalizedSearch = search.trim();
  const presenceId = useRef<string>("");
  if (!presenceId.current && typeof crypto !== "undefined") {
    presenceId.current = crypto.randomUUID();
  }

  const friends = useQuery({ queryKey: ["friends", sort], queryFn: () => listFriends(sort) });
  const incoming = useQuery({ queryKey: ["friend-requests", "incoming"], queryFn: listIncomingFriendRequests });
  const sent = useQuery({ queryKey: ["friend-requests", "sent"], queryFn: listSentFriendRequests });
  const blocked = useQuery({ queryKey: ["friends", "blocked"], queryFn: listBlockedCandidates });
  const people = useQuery({
    queryKey: ["friend-search", normalizedSearch],
    queryFn: () => searchPeople(normalizedSearch),
    enabled: normalizedSearch.length >= 2,
  });
  const profile = useQuery({
    queryKey: ["friend-profile", profileId],
    queryFn: () => getPublicCandidateProfile(profileId!),
    enabled: Boolean(profileId),
  });

  useEffect(() => {
    const connectionId = presenceId.current;
    if (!connectionId) return;
    void sendPresenceHeartbeat(connectionId).catch(() => undefined);
    const timer = window.setInterval(() => {
      void sendPresenceHeartbeat(connectionId).catch(() => undefined);
    }, 45_000);
    return () => window.clearInterval(timer);
  }, []);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["friends"] });
    void queryClient.invalidateQueries({ queryKey: ["friend-search"] });
    void queryClient.invalidateQueries({ queryKey: ["friend-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["conversation-inbox"] });
  };
  const send = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: () => { refresh(); toast("Friend request sent", { variant: "success" }); },
    onError: () => toast("Friend request could not be sent", { variant: "error" }),
  });
  const accept = useMutation({
    mutationFn: acceptFriendRequest,
    onSuccess: () => { refresh(); toast("Friend request accepted", { variant: "success" }); },
    onError: () => toast("Friend request could not be accepted", { variant: "error" }),
  });
  const decline = useMutation({
    mutationFn: declineFriendRequest,
    onSuccess: () => { refresh(); toast("Friend request declined", { variant: "success" }); },
    onError: () => toast("Friend request could not be declined", { variant: "error" }),
  });
  const cancel = useMutation({
    mutationFn: cancelFriendRequest,
    onSuccess: () => { refresh(); toast("Friend request canceled", { variant: "success" }); },
    onError: () => toast("Friend request could not be canceled", { variant: "error" }),
  });
  const remove = useMutation({
    mutationFn: removeFriend,
    onSuccess: () => { refresh(); toast("Friend removed", { variant: "success" }); },
    onError: () => toast("Friend could not be removed", { variant: "error" }),
  });
  const block = useMutation({
    mutationFn: blockCandidate,
    onSuccess: () => { refresh(); toast("Candidate blocked", { variant: "success" }); },
    onError: () => toast("Candidate could not be blocked", { variant: "error" }),
  });
  const unblock = useMutation({
    mutationFn: unblockCandidate,
    onSuccess: () => { refresh(); toast("Candidate unblocked", { variant: "success" }); },
    onError: () => toast("Candidate could not be unblocked", { variant: "error" }),
  });
  const incomingByCandidate = new Map((incoming.data?.requests ?? []).map((request) => [request.candidate.id, request]));

  return (
    <PageContainer>
      <div className="space-y-6 py-8">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Your network</p>
          <h1 className="mt-2 text-3xl font-bold text-foreground">Friends</h1>
          <p className="mt-2 text-sm text-muted-foreground">Find verified candidates, approve requests, and keep career conversations together.</p>
        </header>

        {incoming.isError || sent.isError || friends.isError ? (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-4 text-sm text-danger">Your network could not be loaded. Retry the page.</div>
        ) : null}

        {(incoming.data?.requests.length ?? 0) > 0 ? (
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-bold text-foreground">Incoming requests</h2>
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {incoming.data?.requests.map((request) => (
                <li key={request.id} className="flex items-center gap-3 rounded-xl border border-border-subtle p-3">
                  <Avatar name={request.candidate.full_name} src={request.candidate.avatar_url} />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{request.candidate.full_name}</p><p className="text-xs text-muted-foreground">Wants to connect</p></div>
                  <Button size="sm" loading={accept.isPending && accept.variables === request.id} disabled={decline.isPending} onClick={() => accept.mutate(request.id)}><FiCheck aria-hidden /> Accept</Button>
                  <Button size="sm" variant="ghost" loading={decline.isPending && decline.variables === request.id} disabled={accept.isPending} onClick={() => decline.mutate(request.id)}>Decline</Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {(sent.data?.requests.length ?? 0) > 0 ? (
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-bold text-foreground">Sent requests</h2>
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {sent.data?.requests.map((request) => (
                <li key={request.id} className="flex items-center gap-3 rounded-xl border border-border-subtle p-3">
                  <Avatar name={request.candidate.full_name} src={request.candidate.avatar_url} />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{request.candidate.full_name}</p><p className="text-xs text-muted-foreground">Awaiting response</p></div>
                  <Button size="sm" variant="ghost" loading={cancel.isPending && cancel.variables === request.id} onClick={() => cancel.mutate(request.id)}>Cancel</Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2"><FiSearch aria-hidden className="text-muted-foreground" /><h2 className="font-bold text-foreground">Find candidates</h2></div>
          <Input className="mt-3" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search candidates by name or email" helper="Enter at least two characters." />
          {people.isFetching ? <p className="mt-3 text-sm text-muted-foreground">Searching…</p> : null}
          {people.isError ? <p role="alert" className="mt-3 text-sm text-danger">Search failed. Try again.</p> : null}
          {normalizedSearch.length >= 2 && people.data?.friends.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No candidates match this search.</p> : null}
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {(people.data?.friends ?? []).map((person) => {
              const request = incomingByCandidate.get(person.id);
              const action = friendActionFor(person.relationship_state, Boolean(request));
              return (
                <li key={person.id} className="flex items-center gap-3 rounded-xl border border-border-subtle p-3">
                  <Avatar name={person.full_name} src={person.avatar_url} />
                  <button type="button" onClick={() => setProfileId(person.id)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-semibold text-foreground">{person.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{person.headline || person.masked_email || "Candidate"}</p>
                  </button>
                  {action === "REQUEST" ? (
                    <Button size="sm" variant="outline" loading={send.isPending && send.variables === person.id} onClick={() => send.mutate(person.id)}><FiUserPlus aria-hidden /> Request</Button>
                  ) : action === "ACCEPT" && request ? (
                    <Button size="sm" loading={accept.isPending && accept.variables === request.id} onClick={() => accept.mutate(request.id)}>Accept</Button>
                  ) : action === "MESSAGE" ? (
                    <Link className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-medium text-foreground hover:bg-surface-secondary" href={`/chat/${person.id}`}><FiMessageCircle aria-hidden /> Message</Link>
                  ) : (
                    <Button size="sm" variant="ghost" disabled>{action === "BLOCKED" ? "Blocked" : "Requested"}</Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-xl font-bold text-foreground">My friends</h2><p className="text-sm text-muted-foreground">{friends.data?.total ?? 0} accepted friends</p></div>
            <Select aria-label="Sort friends" value={sort} onChange={(event) => setSort(event.target.value as "name" | "recent")} className="w-44"><option value="name">Name</option><option value="recent">Recently online</option></Select>
          </div>
          {friends.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading friends…</p> : null}
          {friends.data?.friends.length === 0 ? <div className="mt-4 rounded-2xl border border-border bg-surface p-8 text-center"><FiUsers aria-hidden className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">No accepted friends yet.</p></div> : null}
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {(friends.data?.friends ?? []).map((friend) => (
              <li key={friend.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
                <span className="relative"><Avatar name={friend.full_name} src={friend.avatar_url} size="lg" /><span aria-label={friend.is_online ? "Online" : "Offline"} className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface ${friend.is_online ? "bg-success" : "bg-muted-foreground"}`} /></span>
                <button type="button" onClick={() => setProfileId(friend.id)} className="min-w-0 flex-1 text-left"><p className="truncate font-semibold text-foreground">{friend.full_name}</p><p className="text-xs text-muted-foreground">{lastSeenLabel(friend)}</p></button>
                <Link className="inline-flex h-8 items-center justify-center rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-medium text-foreground hover:bg-surface-secondary" href={`/chat/${friend.id}`}>Message</Link>
                <Button size="sm" variant="ghost" loading={remove.isPending && remove.variables === friend.id} onClick={() => remove.mutate(friend.id)}>Remove</Button>
                <Button size="sm" variant="ghost" loading={block.isPending && block.variables === friend.id} onClick={() => block.mutate(friend.id)}>Block</Button>
              </li>
            ))}
          </ul>
        </section>

        {(blocked.data?.friends.length ?? 0) > 0 ? (
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-bold text-foreground">Blocked candidates</h2>
            <p className="mt-1 text-sm text-muted-foreground">Blocked candidates cannot find or message you.</p>
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {blocked.data?.friends.map((candidate) => (
                <li key={candidate.id} className="flex items-center gap-3 rounded-xl border border-border-subtle p-3">
                  <Avatar name={candidate.full_name} src={candidate.avatar_url} />
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold">{candidate.full_name}</p>
                  <Button size="sm" variant="outline" loading={unblock.isPending && unblock.variables === candidate.id} onClick={() => unblock.mutate(candidate.id)}>Unblock</Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {profileId ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Candidate public profile">
            <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3"><Avatar name={profile.data?.full_name ?? "Candidate"} src={profile.data?.avatar_url} size="lg" /><div><h2 className="text-xl font-bold">{profile.data?.full_name ?? "Candidate profile"}</h2><p className="text-sm text-muted-foreground">{profile.data?.headline ?? "Candidate"}</p></div></div>
                <button type="button" aria-label="Close profile" onClick={() => setProfileId(null)}><FiX aria-hidden /></button>
              </div>
              {profile.isLoading ? <p className="mt-5 text-sm text-muted-foreground">Loading profile…</p> : null}
              {profile.isError ? <p role="alert" className="mt-5 text-sm text-danger">Profile is unavailable.</p> : null}
              {profile.data ? <div className="mt-5 space-y-3 text-sm"><p>{profile.data.bio || "No public bio yet."}</p><p className="text-muted-foreground">{profile.data.skills || "No public skills yet."}</p><p className="text-xs text-muted-foreground">{lastSeenLabel(profile.data)}</p></div> : null}
            </div>
          </div>
        ) : null}
      </div>
    </PageContainer>
  );
}
