export type ManagedFileKind = "avatar" | "logo" | "cv";

const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const CV_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const CV_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function extension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

export function validateManagedFileMetadata(file: File, kind: ManagedFileKind): string | null {
  const ext = extension(file.name);
  const allowed = kind === "cv" ? CV_TYPES : IMAGE_TYPES;
  const label = kind === "cv" ? "PDF or DOCX" : "PNG, JPG, or WebP";
  const maxBytes = kind === "cv" ? CV_MAX_BYTES : IMAGE_MAX_BYTES;
  const maxLabel = kind === "cv" ? "5 MB" : "2 MB";

  if (!allowed[ext]) return `Invalid file type. Choose a ${label} file.`;
  if (file.type !== allowed[ext]) return `File type does not match its .${ext} extension.`;
  if (file.size <= 0) return "The selected file is empty.";
  if (file.size > maxBytes) return `File is too large. Maximum size is ${maxLabel}.`;
  return null;
}

function hasBytes(bytes: Uint8Array, expected: number[], offset = 0): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function signatureMatches(bytes: Uint8Array, ext: string): boolean {
  if (ext === "pdf") return hasBytes(bytes, [0x25, 0x50, 0x44, 0x46]);
  if (ext === "docx") return hasBytes(bytes, [0x50, 0x4b, 0x03, 0x04]);
  if (ext === "png") return hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (ext === "jpg" || ext === "jpeg") return hasBytes(bytes, [0xff, 0xd8, 0xff]);
  if (ext === "webp") {
    return hasBytes(bytes, [0x52, 0x49, 0x46, 0x46]) && hasBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8);
  }
  return false;
}

export async function validateManagedFile(file: File, kind: ManagedFileKind): Promise<string | null> {
  const metadataError = validateManagedFileMetadata(file, kind);
  if (metadataError) return metadataError;
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!signatureMatches(bytes, extension(file.name))) {
    return "File contents do not match the selected format.";
  }
  return null;
}
