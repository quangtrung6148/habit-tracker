import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function authConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
export function secureCookies() {
  return (
    process.env.NODE_ENV === "production" &&
    !(
      process.env.LOCAL_DOCKER === "true" &&
      process.env.APP_URL === "http://localhost:3000"
    )
  );
}
export async function supabaseServer() {
  if (!authConfigured()) throw new Error("AUTH_NOT_CONFIGURED");
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies(),
        path: "/",
      },
      cookies: {
        getAll: () => store.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) =>
              store.set(name, value, options),
            );
          } catch {
            /* Server Components cannot set cookies; proxy refreshes them. */
          }
        },
      },
    },
  );
}
