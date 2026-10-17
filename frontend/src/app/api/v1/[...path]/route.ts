import { NextRequest } from "next/server";
import { authConfigured, supabaseServer } from "@/lib/auth";
import { failure, json, readBody, trustedOrigin } from "@/lib/http";
export const dynamic = "force-dynamic";
async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  if (
    !/^(auth\/me|profile|habits(?:\/[0-9a-f-]{36}(?:\/checkins?)?)?|dashboard\/(?:summary|progress))$/.test(
      path,
    )
  )
    return failure("Không tìm thấy trang.", 404, "NOT_FOUND");
  if (request.method !== "GET" && !trustedOrigin(request))
    return failure("Yêu cầu không hợp lệ.", 403, "ORIGIN_REJECTED");
  if (!authConfigured() || !process.env.API_INTERNAL_URL)
    return failure(
      "Ứng dụng chưa được kết nối. Vui lòng thử lại sau.",
      503,
      "NOT_CONFIGURED",
    );
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user)
      return failure("Vui lòng đăng nhập lại.", 401, "UNAUTHORIZED");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session)
      return failure("Vui lòng đăng nhập lại.", 401, "UNAUTHORIZED");
    const base = new URL(process.env.API_INTERNAL_URL);
    const localDocker =
      process.env.LOCAL_DOCKER === "true" &&
      base.origin === "http://backend:5000";
    if (
      process.env.NODE_ENV === "production" &&
      base.protocol !== "https:" &&
      !localDocker
    )
      return failure(
        "Kết nối tạm thời gián đoạn.",
        503,
        "INVALID_CONFIGURATION",
      );
    const upstream = new URL(`/api/v1/${path}`, base);
    upstream.search = request.nextUrl.search;
    const body = ["POST", "PATCH", "DELETE"].includes(request.method)
      ? JSON.stringify(await readBody(request))
      : undefined;
    const result = await fetch(upstream, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(120000),
    });
    if (result.status >= 300 && result.status < 400)
      return failure("Kết nối tạm thời gián đoạn.", 502, "UPSTREAM_ERROR");
    const payload = await result.json();
    return json(payload, result.status);
  } catch (error) {
    if (error instanceof Error && error.message === "BODY_TOO_LARGE")
      return failure("Dữ liệu gửi lên quá lớn.", 413, "BODY_TOO_LARGE");
    if (error instanceof SyntaxError)
      return failure("Dữ liệu không hợp lệ.", 400, "INVALID_JSON");
    return failure(
      "Không thể kết nối máy chủ. Vui lòng thử lại.",
      502,
      "UPSTREAM_ERROR",
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
