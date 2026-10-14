import assert from "node:assert/strict";
import test from "node:test";

import { validateManagedFile, validateManagedFileMetadata } from "../src/lib/file-validation.ts";

function file(bytes: number[], name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

test("accepts supported image and document signatures", async () => {
  assert.equal(await validateManagedFile(file([0x25, 0x50, 0x44, 0x46, 0x2d], "resume.pdf", "application/pdf"), "cv"), null);
  assert.equal(await validateManagedFile(file([0x50, 0x4b, 0x03, 0x04], "resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "cv"), null);
  assert.equal(await validateManagedFile(file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "avatar.png", "image/png"), "avatar"), null);
  assert.equal(await validateManagedFile(file([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], "logo.webp", "image/webp"), "logo"), null);
});

test("rejects mismatched extensions, MIME types, and signatures", async () => {
  assert.match(validateManagedFileMetadata(file([1], "resume.txt", "text/plain"), "cv") ?? "", /Invalid file type/);
  assert.match(validateManagedFileMetadata(file([1], "resume.pdf", "application/octet-stream"), "cv") ?? "", /does not match/);
  assert.match(await validateManagedFile(file([0x50, 0x4b, 0x03, 0x04], "resume.pdf", "application/pdf"), "cv") ?? "", /contents do not match/);
});

test("rejects empty and oversized files before upload", () => {
  assert.match(validateManagedFileMetadata(new File([], "empty.png", { type: "image/png" }), "avatar") ?? "", /empty/);
  const oversized = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" });
  assert.match(validateManagedFileMetadata(oversized, "logo") ?? "", /too large/);
});
