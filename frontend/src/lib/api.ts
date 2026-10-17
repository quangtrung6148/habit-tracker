export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const result = await fetch(`/api/v1/${path}`, {
    method,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...(method !== "GET" ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  const data = await result.json();
  if (!result.ok || !data.success)
    throw new ApiError(
      data.message || "Có lỗi xảy ra. Vui lòng thử lại.",
      result.status,
      data.error?.code || "ERROR",
    );
  return data.data as T;
}
