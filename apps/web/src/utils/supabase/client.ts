import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const createClient = () => {
  if (!supabaseUrl || !supabaseKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[supabase/client] NEXT_PUBLIC_SUPABASE_URL or KEY missing — Supabase browser client will be no-op");
    }
    // Return a proxy that throws friendly error only on actual use, preventing page crash on import
    return new Proxy({} as ReturnType<typeof createBrowserClient>, {
      get() {
        throw new Error(
          "Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in apps/web/.env.local (see apps/web/.env.example)"
        );
      },
    });
  }
  return createBrowserClient(supabaseUrl, supabaseKey);
};
