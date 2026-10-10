/** Resolve API paths without prefixing an already resolved proxy URL twice. */
export function resolveAssetUrl(src: string | null | undefined, apiBase: string): string | null {
  if (!src) return null;
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  const base = apiBase.replace(/\/$/, "");
  // Only match complete path segments: /api-proxy-other is not /api-proxy.
  if (base.startsWith("/") && (
    src === base || src.startsWith(`${base}/`) ||
    src.startsWith(`${base}?`) || src.startsWith(`${base}#`)
  )) return src;
  return `${base}${src.startsWith("/") ? "" : "/"}${src}`;
}
