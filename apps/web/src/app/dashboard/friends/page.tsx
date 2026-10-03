"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FiSearch, FiUserPlus, FiUsers } from "react-icons/fi";
import { PageContainer } from "@/components/shell/page-container";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { addFriend, listFriends, removeFriend, searchPeople, sendPresenceHeartbeat } from "@/lib/api";
import type { FriendItem } from "@/lib/types";

function lastSeenLabel(friend: FriendItem): string {
  if (friend.online) return "Online now";
  if (!friend.last_seen) return "Offline";
  return `Last seen ${new Date(friend.last_seen).toLocaleString()}`;
}

export default function FriendsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [sort, setSort] = useState<"name" | "recent">("name");
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim();

  const friends = useQuery({
    queryKey: ["friends", sort],
    queryFn: () => listFriends(sort),
  });
  const people = useQuery({
    queryKey: ["friend-search", normalizedSearch],
    queryFn: () => searchPeople(normalizedSearch),
    enabled: normalizedSearch.length >= 2,
  });

  useEffect(() => {
    void sendPresenceHeartbeat().catch(() => undefined);
    const timer = window.setInterval(() => {
      void sendPresenceHeartbeat().catch(() => undefined);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const add = useMutation({
    mutationFn: addFriend,
    onSuccess: (friend) => {
      void queryClient.invalidateQueries({ queryKey: ["friends"] });
      void queryClient.invalidateQueries({ queryKey: ["friend-search"] });
      toast(`${friend.full_name} added`, { variant: "success" });
    },
    onError: () => toast("Could not add friend", { variant: "error" }),
  });
  const remove = useMutation({
    mutationFn: removeFriend,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["friends"] });
      void queryClient.invalidateQueries({ queryKey: ["friend-search"] });
      toast("Friend removed", { variant: "success" });
    },
    onError: () => toast("Could not remove friend", { variant: "error" }),
  });

  return (
    <PageContainer>
      <div className="space-y-6 py-8">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Your network</p>
          <h1 className="mt-2 text-3xl font-bold text-foreground">Friends</h1>
          <p className="mt-2 text-sm text-muted-foreground">Find approved CODITENT members and see who has been active recently.</p>
        </header>

        <section className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2">
            <FiSearch aria-hidden className="text-muted-foreground" />
            <h2 className="font-bold text-foreground">Find people</h2>
          </div>
          <Input
            className="mt-3"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email"
            helper="Enter at least two characters."
          />
          {people.isFetching ? <p className="mt-3 text-sm text-muted-foreground">Searching…</p> : null}
          {normalizedSearch.length >= 2 && people.data?.friends.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No new people match this search.</p>
          ) : null}
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {(people.data?.friends ?? []).map((person) => (
              <li key={person.id} className="flex items-center gap-3 rounded-xl border border-border-subtle p-3">
                <Avatar name={person.full_name} src={person.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{person.full_name}</p>
                  <p className="text-xs text-muted-foreground">{person.role.replace(/_/g, " ").toLowerCase()}</p>
                </div>
                <Button size="sm" variant="outline" loading={add.isPending} onClick={() => add.mutate(person.id)}>
                  <FiUserPlus aria-hidden /> Add
                </Button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-foreground">My friends</h2>
              <p className="text-sm text-muted-foreground">{friends.data?.total ?? 0} connections</p>
            </div>
            <Select aria-label="Sort friends" value={sort} onChange={(event) => setSort(event.target.value as "name" | "recent")} className="w-44">
              <option value="name">Name</option>
              <option value="recent">Recently online</option>
            </Select>
          </div>
          {friends.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading friends…</p> : null}
          {friends.isError ? <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-background p-4 text-sm text-danger">Friends could not be loaded.</p> : null}
          {friends.data?.friends.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-border bg-surface p-8 text-center">
              <FiUsers aria-hidden className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">Your friend list is empty. Search above to add someone.</p>
            </div>
          ) : null}
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {(friends.data?.friends ?? []).map((friend) => (
              <li key={friend.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
                <span className="relative">
                  <Avatar name={friend.full_name} src={friend.avatar_url} size="lg" />
                  <span aria-label={friend.online ? "Online" : "Offline"} className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface ${friend.online ? "bg-success" : "bg-muted-foreground"}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{friend.full_name}</p>
                  <p className="text-xs text-muted-foreground">{lastSeenLabel(friend)}</p>
                </div>
                <Button size="sm" variant="ghost" loading={remove.isPending} onClick={() => remove.mutate(friend.id)}>Remove</Button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageContainer>
  );
}
