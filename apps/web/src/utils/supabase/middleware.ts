import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const createClient = (request: NextRequest) => {
  // Create an unmodified response
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Gracefully handle missing env (e.g. build without Supabase keys) — app uses custom JWT as primary auth
  if (!supabaseUrl || !supabaseKey) {
    // Return a no-op supabase client that won't throw
    const noopSupabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    } as unknown as ReturnType<typeof createServerClient>;
    if (process.env.NODE_ENV !== "production") {
      console.warn("[supabase/middleware] NEXT_PUBLIC_SUPABASE_URL or KEY missing — skipping Supabase session refresh");
    }
    return { supabase: noopSupabase, supabaseResponse };
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    },
  );

  return { supabase, supabaseResponse }
};
