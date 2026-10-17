import { NextRequest } from "next/server";
import { authConfigured, supabaseServer } from "@/lib/auth";
import { appOrigin, failure, json, readBody, trustedOrigin } from "@/lib/http";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ action: string }> },
) {
  if (!trustedOrigin(request))
    return failure("Yêu cầu không hợp lệ.", 403, "ORIGIN_REJECTED");
  if (!authConfigured())
    return failure(
      "Ứng dụng chưa được kết nối. Vui lòng thử lại sau.",
      503,
      "NOT_CONFIGURED",
    );
  const { action } = await context.params;
  if (!["login", "register", "logout"].includes(action))
    return failure("Không tìm thấy.", 404, "NOT_FOUND");
  try {
    const supabase = await supabaseServer();
    if (action === "logout") {
      const { error } = await supabase.auth.signOut();
      if (error)
        return failure("Chưa thể đăng xuất. Thử lại nhé.", 503, "AUTH_ERROR");
      return json({ success: true, data: {}, message: "Đã đăng xuất." });
    }
    const { email, password } = await readBody(request);
    if (
      typeof email !== "string" ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    )
      return failure(
        "Nhập email hợp lệ và mật khẩu từ 8 đến 128 ký tự.",
        400,
        "VALIDATION_ERROR",
      );
    const result =
      action === "login"
        ? await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          })
        : await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: `${appOrigin(request)}/auth/confirm` },
          });
    if (result.error)
      return failure(
        action === "login"
          ? "Email hoặc mật khẩu chưa đúng, hoặc email chưa được xác nhận."
          : "Chưa thể đăng ký. Kiểm tra thông tin hoặc thử lại sau.",
        400,
        "AUTH_ERROR",
      );
    return json({
      success: true,
      data: { confirmationRequired: !result.data.session },
      message: "Thành công.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "BODY_TOO_LARGE")
      return failure("Dữ liệu gửi lên quá lớn.", 413, "BODY_TOO_LARGE");
    return failure(
      "Chưa thể xử lý yêu cầu. Vui lòng thử lại.",
      400,
      "AUTH_ERROR",
    );
  }
}
