import assert from "node:assert/strict";
import test from "node:test";

import { confirmOptimisticMessage, removeOptimisticMessage } from "../src/lib/optimistic-chat.ts";
import type { ChatMessage } from "../src/lib/types.ts";

const optimistic: ChatMessage = {
  id: "optimistic:one",
  sender_id: "sender",
  receiver_id: "receiver",
  application_id: "application",
  content: "Hello",
  created_at: "2026-10-22T12:00:00Z",
  delivery_status: "sending",
};

const confirmed: ChatMessage = {
  ...optimistic,
  id: "confirmed-one",
  delivery_status: undefined,
};

test("confirmed messages replace their optimistic placeholder", () => {
  assert.deepEqual(confirmOptimisticMessage([optimistic], optimistic.id, confirmed), [confirmed]);
});

test("confirmation does not duplicate a message delivered over the socket first", () => {
  assert.deepEqual(confirmOptimisticMessage([optimistic, confirmed], optimistic.id, confirmed), [confirmed]);
});

test("failed sends remove their optimistic placeholder", () => {
  assert.deepEqual(removeOptimisticMessage([optimistic], optimistic.id), []);
});
