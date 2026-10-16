import assert from "node:assert/strict";
import test from "node:test";
import { chatWorkspaceIdentity } from "../src/lib/chat-workspace-identity.ts";

test("company members and legacy recruiters use company chat navigation", () => {
  for (const role of ["COMPANY_USER", "RECRUITER"]) {
    const identity = chatWorkspaceIdentity(role);
    assert.equal(identity.isCompany, true);
    assert.equal(identity.findPeopleHref, "/company/candidates");
    assert.equal(identity.conversationDescription, "Keep recruitment conversations in one place.");
  }
});

test("candidates retain candidate chat navigation", () => {
  const identity = chatWorkspaceIdentity("CANDIDATE");
  assert.equal(identity.isCompany, false);
  assert.equal(identity.findPeopleHref, "/dashboard/friends");
  assert.equal(identity.conversationDescription, "Keep friend and application conversations in one place.");
});
