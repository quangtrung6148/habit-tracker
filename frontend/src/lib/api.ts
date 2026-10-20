export class ApiError extends Error {
  public status: number;
  public code: string;
  constructor(
    message: string,
    status: number,
    code: string,
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Envelope = {
  success: boolean;
  data: unknown;
  message: string;
  error?: { code: string };
};

// Shared by the browser and BFF: an unreadable server response is a transport
// failure, never evidence that the user submitted invalid JSON.
export async function readApiResponse(result: Response): Promise<{
  payload: Envelope;
  status: number;
}> {
  try {
    const payload: unknown = await result.json();
    if (
      typeof payload === "object" && payload !== null &&
      "success" in payload && typeof payload.success === "boolean" &&
      "data" in payload && "message" in payload &&
      typeof payload.message === "string" &&
      (payload.success
        ? result.ok
        : !result.ok && "error" in payload &&
          typeof payload.error === "object" && payload.error !== null &&
          "code" in payload.error && typeof payload.error.code === "string")
    ) return { payload: payload as Envelope, status: result.status };
  } catch {
    // Do not expose upstream HTML, parser details or response bodies.
  }
  return {
    status: [408, 502, 503, 504].includes(result.status) ? result.status : 502,
    payload: {
      success: false,
      data: null,
      message: "Kết nối tạm thời gián đoạn. Vui lòng thử lại sau một chút.",
      error: { code: "UPSTREAM_ERROR" },
    },
  };
}

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const readOnly = method === "GET";
  const attempts = readOnly ? 3 : 1;
  const encodedBody = readOnly ? undefined : JSON.stringify(body ?? {});
  for (let attempt = 0; attempt < attempts; attempt++) {
    let failure: ApiError;
    try {
      const result = await fetch(`/api/v1/${path}`, {
        method,
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: encodedBody,
        signal: AbortSignal.timeout(readOnly ? 45000 : 125000),
      });
      const { payload, status } = await readApiResponse(result);
      if (payload.success) return payload.data as T;
      failure = new ApiError(payload.message, status, payload.error?.code || "ERROR");
    } catch {
      failure = new ApiError(
        readOnly
          ? "Chưa thể tải dữ liệu. Vui lòng kiểm tra kết nối và thử lại."
          : "Chưa xác nhận được kết quả thao tác. Hãy tải lại dữ liệu để kiểm tra trước khi thử lại.",
        502,
        "NETWORK_ERROR",
      );
    }
    // A write can commit before a later stats/read step fails. Do not invite a
    // duplicate submission when the server cannot confirm the complete result.
    if (!readOnly && (failure.status >= 500 || failure.status === 408))
      failure = new ApiError(
        "Chưa xác nhận được kết quả thao tác. Hãy tải lại dữ liệu để kiểm tra trước khi thử lại.",
        failure.status,
        "MUTATION_UNCERTAIN",
      );
    if (!readOnly || ![408, 502, 503, 504].includes(failure.status) || attempt === attempts - 1)
      throw failure;
    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw new ApiError("Không thể tải dữ liệu.", 502, "NETWORK_ERROR");
}
