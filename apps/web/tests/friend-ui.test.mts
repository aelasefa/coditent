import assert from "node:assert/strict";
import test from "node:test";

import { filterInbox, friendActionFor, mapCombinedInbox } from "../src/lib/friend-ui.ts";
import type { ConversationSummary } from "../src/lib/types.ts";

test("friend request controls follow the server relationship state", () => {
  assert.equal(friendActionFor("NONE", false), "REQUEST");
  assert.equal(friendActionFor("PENDING_RECEIVED", true), "ACCEPT");
  assert.equal(friendActionFor("PENDING_SENT", false), "PENDING");
  assert.equal(friendActionFor("ACCEPTED", false), "MESSAGE");
  assert.equal(friendActionFor("BLOCKED", false), "BLOCKED");
});

test("combined inbox preserves badges, links, unread counts, and latest-first sorting", () => {
  const conversations: ConversationSummary[] = [
    {
      conversation_type: "FRIEND",
      conversation_id: "friend:b",
      href: "/chat/b",
      badge: "Friend",
      context: "Friend conversation",
      detail: "Direct message",
      last_message: "hello",
      last_at: "2026-10-05T10:00:00Z",
      unread_count: 2,
      can_message: true,
      peer: { id: "b", full_name: "Candidate B", relationship_state: "ACCEPTED", is_online: true, online: true },
    },
    {
      conversation_type: "RECRUITMENT",
      conversation_id: "recruitment:application-1",
      href: "/chat/recruitment/application-1",
      badge: "Recruiter",
      context: "Software Engineer",
      detail: "Coditent",
      last_message: "Interview confirmed",
      last_at: "2026-10-05T11:00:00Z",
      unread_count: 1,
      can_message: true,
      peer: { id: "hr", full_name: "Hiring Manager" },
    },
  ];

  const items = mapCombinedInbox(conversations);
  assert.deepEqual(items.map((item) => item.badge), ["Recruiter", "Friend"]);
  assert.deepEqual(items.map((item) => item.href), ["/chat/recruitment/application-1", "/chat/b"]);
  assert.deepEqual(items.map((item) => item.unreadCount), [1, 2]);
  assert.deepEqual(filterInbox(items, "friend", "candidate").map((item) => item.badge), ["Friend"]);
  assert.deepEqual(filterInbox(items, "recruitment", "software").map((item) => item.badge), ["Recruiter"]);
  assert.deepEqual(filterInbox(items, "all", "missing"), []);
});
