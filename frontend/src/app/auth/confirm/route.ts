import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/auth";
import { appOrigin } from "@/lib/http";
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    const supabase = await supabaseServer();
    const code = params.get("code");
    const token = params.get("token_hash");
    const result = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : token && params.get("type") === "email"
        ? await supabase.auth.verifyOtp({ token_hash: token, type: "email" })
        : null;
    if (result && !result.error)
      return NextResponse.redirect(new URL("/", appOrigin(request)), {
        headers: { "Cache-Control": "no-store" },
      });
  } catch {
    /* Show a safe recovery link; never echo authentication tokens. */
  }
  return NextResponse.redirect(
    new URL("/login?error=confirmation", appOrigin(request)),
    { headers: { "Cache-Control": "no-store" } },
  );
}
