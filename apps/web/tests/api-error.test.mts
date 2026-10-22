import assert from "node:assert/strict";
import test from "node:test";

import { getApiErrorMessage } from "../src/lib/api-error.ts";

test("surfaces structured FastAPI error messages", () => {
  const error = {
    response: {
      status: 504,
      data: {
        detail: {
          code: "CV_AI_TIMEOUT",
          message: "Extraction timed out, please retry",
        },
      },
    },
  };

  assert.equal(getApiErrorMessage(error, "Fallback"), "Extraction timed out, please retry");
});

test("supports string details, top-level messages, native errors, and fallbacks", () => {
  assert.equal(getApiErrorMessage({ response: { data: { detail: "No CV uploaded" } } }, "Fallback"), "No CV uploaded");
  assert.equal(getApiErrorMessage({ response: { data: { message: "Unavailable" } } }, "Fallback"), "Unavailable");
  assert.equal(getApiErrorMessage(new Error("Network error"), "Fallback"), "Network error");
  assert.equal(getApiErrorMessage({}, "Fallback"), "Fallback");
});
