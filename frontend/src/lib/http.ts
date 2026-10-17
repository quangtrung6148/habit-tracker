import "server-only";
import { NextRequest, NextResponse } from "next/server";
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}
export function failure(message: string, status: number, code: string) {
  return json({ success: false, data: null, message, error: { code } }, status);
}
export function trustedOrigin(request: NextRequest) {
  const expected =
    process.env.APP_URL ||
    (process.env.NODE_ENV !== "production" ? request.nextUrl.origin : "");
  try {
    return (
      Boolean(expected) &&
      request.headers.get("origin") === new URL(expected).origin
    );
  } catch {
    return false;
  }
}
export async function readBody(request: NextRequest) {
  const text = await request.text();
  if (text.length > 16384) throw new Error("BODY_TOO_LARGE");
  return JSON.parse(text || "{}") as Record<string, unknown>;
}
export function appOrigin(request: NextRequest) {
  return new URL(process.env.APP_URL || request.nextUrl.origin).origin;
}
