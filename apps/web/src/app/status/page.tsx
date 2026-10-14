import type { Metadata } from "next";
import Link from "next/link";
import { getApiBaseUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "System Status | CODITENT",
  description: "Current CODITENT service availability.",
};

interface ReadinessPayload {
  status?: string;
  components?: Record<string, "ok" | "unavailable">;
}

async function readStatus(): Promise<ReadinessPayload> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/ready`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    return (await response.json()) as ReadinessPayload;
  } catch {
    return { status: "unavailable", components: { platform: "unavailable" } };
  }
}

function componentLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function StatusPage() {
  const status = await readStatus();
  const operational = status.status === "ready";
  const components = Object.entries(status.components ?? { platform: "unavailable" });
  return (
    <main id="main" className="mx-auto min-h-screen w-full max-w-3xl px-5 py-14 sm:px-8">
      <Link href="/" className="text-sm font-semibold text-primary underline underline-offset-4">← CODITENT home</Link>
      <h1 className="mt-8 text-4xl font-bold">System status</h1>
      <div className={`mt-6 rounded-2xl border p-5 ${operational ? "border-success/30 bg-success-background" : "border-warning/40 bg-warning/10"}`} role="status">
        <p className="text-lg font-semibold">{operational ? "All systems operational" : "Some systems are unavailable"}</p>
        <p className="mt-1 text-sm text-muted-foreground">Checked {new Date().toISOString().replace("T", " ").slice(0, 19)} UTC</p>
      </div>
      <h2 className="mt-8 text-xl font-semibold">Components</h2>
      <ul className="mt-3 divide-y divide-border-subtle rounded-2xl border border-border bg-surface">
        {components.map(([name, value]) => (
          <li key={name} className="flex items-center justify-between gap-4 px-5 py-4">
            <span className="font-medium">{componentLabel(name)}</span>
            <span className={value === "ok" ? "text-success" : "text-warning"}>{value === "ok" ? "Operational" : "Unavailable"}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-muted-foreground">If a service is unavailable, retry after a few minutes. Account changes are protected by durable queues and transaction boundaries.</p>
    </main>
  );
}
