// src/lib/api/client.ts
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiRequestOptions = {
  method?: HttpMethod;
  query?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string | undefined>;
  body?: unknown; // JSON by default unless BodyInit-like
  signal?: AbortSignal;
  timeoutMs?: number;
  parseAs?: "json" | "text";
  /** Retry transient failures (timeout, network error). Default 0 = no retry. */
  retries?: number;
  /** Base delay between retries in ms. Exponential backoff applied. Default 1000. */
  retryDelayMs?: number;
};

export class ApiError extends Error {
  status: number;
  url: string;
  details?: unknown;

  constructor(args: { status: number; url: string; message: string; details?: unknown }) {
    super(args.message);
    this.name = "ApiError";
    this.status = args.status;
    this.url = args.url;
    this.details = args.details;
  }
}

function isBodyInitLike(v: unknown): v is BodyInit {
  return (
    typeof v === "string" ||
    v instanceof Blob ||
    v instanceof ArrayBuffer ||
    v instanceof FormData ||
    v instanceof URLSearchParams ||
    v instanceof ReadableStream
  );
}

function buildQueryString(
  query?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

function getApiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE;
  if (!base) return "";
  return base.replace(/\/+$/, "");
}

/** Remove undefined header values so the result is Record<string,string>. */
function sanitizeHeaders(input?: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function toNiceMessage(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/** Whether an error is transient and worth retrying */
function isTransient(err: unknown): boolean {
  // Abort due to timeout
  if (err instanceof DOMException && err.name === "AbortError") return true;
  // Network failures (DNS, connection refused, etc.)
  if (err instanceof TypeError && /fetch|network|failed/i.test(err.message)) return true;
  // Server errors that are typically transient
  if (err instanceof ApiError && (err.status === 502 || err.status === 503 || err.status === 504 || err.status === 429)) return true;
  return false;
}

export class ApiClient {
  private base: string;

  constructor(base?: string) {
    this.base = (base ?? getApiBase()).replace(/\/+$/, "");
  }

  async http<T>(path: string, opts: ApiRequestOptions = {}): Promise<T> {
    const retries = opts.retries ?? 0;
    const retryDelay = opts.retryDelayMs ?? 1_000;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this._doFetch<T>(path, opts, attempt);
      } catch (err) {
        lastError = err;

        // Don't retry if caller explicitly aborted
        if (opts.signal?.aborted) throw err;
        // Don't retry non-transient errors
        if (!isTransient(err)) throw err;
        // Don't retry if we've exhausted attempts
        if (attempt >= retries) throw err;

        const delay = retryDelay * Math.pow(2, attempt); // 1s, 2s, 4s...
        console.warn(
          `[api] ${opts.method ?? "GET"} ${path} attempt ${attempt + 1} failed (${err instanceof Error ? err.message : err}), retrying in ${delay}ms…`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw lastError;
  }

  private async _doFetch<T>(path: string, opts: ApiRequestOptions, attempt: number): Promise<T> {
    const method = opts.method ?? "GET";
    const url = this.base
      ? `${this.base}${path}${buildQueryString(opts.query)}`
      : `${path}${buildQueryString(opts.query)}`;

    const headers: Record<string, string> = sanitizeHeaders(opts.headers);

    let body: BodyInit | undefined;

    if (opts.body !== undefined && opts.body !== null && method !== "GET") {
      if (isBodyInitLike(opts.body)) {
        body = opts.body;
      } else {
        if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
        body = JSON.stringify(opts.body);
      }
    }

    const timeoutMs = opts.timeoutMs ?? 120_000;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    // Bridge an external abort signal into our controller
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    // ── Timing ────────────────────────────────────────────────────
    const t0 = performance.now();
    const tag = `[api] ${method} ${path}${attempt > 0 ? ` (retry #${attempt})` : ""}`;

    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        cache: "no-store",
      });

      const elapsed = Math.round(performance.now() - t0);

      const parseAs = opts.parseAs ?? "json";
      const contentType = res.headers.get("content-type") || "";

      let payload: unknown = null;
      try {
        if (parseAs === "text") {
          payload = await res.text();
        } else if (contentType.includes("application/json")) {
          payload = await res.json();
        } else {
          const txt = await res.text();
          payload = txt ? txt : null;
        }
      } catch {
        payload = null;
      }

      if (!res.ok) {
        const detail =
          payload && typeof payload === "object" && payload !== null && "detail" in payload
            ? (payload as any).detail
            : null;

        const message =
          detail != null
            ? toNiceMessage(detail)
            : typeof payload === "string"
              ? payload
              : `HTTP ${res.status}`;

        console.warn(`${tag} → ${res.status} in ${elapsed}ms`, message);

        throw new ApiError({
          status: res.status,
          url,
          message,
          details: payload,
        });
      }

      // Log timing — warn if slow (>5s)
      if (elapsed > 5_000) {
        console.warn(`${tag} → ${res.status} in ${elapsed}ms ⚠ SLOW`);
      } else {
        console.debug(`${tag} → ${res.status} in ${elapsed}ms`);
      }

      return payload as T;
    } catch (err) {
      const elapsed = Math.round(performance.now() - t0);

      // Enrich timeout errors with a clearer message
      if (err instanceof DOMException && err.name === "AbortError") {
        console.error(`${tag} → TIMEOUT after ${elapsed}ms (limit: ${timeoutMs}ms)`);
        const timeoutErr = new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s: ${method} ${path}`);
        timeoutErr.name = "TimeoutError";
        (timeoutErr as any).elapsed = elapsed;
        (timeoutErr as any).url = url;
        throw timeoutErr;
      }

      // Network error logging
      if (err instanceof TypeError) {
        console.error(`${tag} → NETWORK ERROR after ${elapsed}ms:`, err.message);
      }

      throw err;
    } finally {
      clearTimeout(t);
    }
  }

  get<T>(path: string, opts: Omit<ApiRequestOptions, "method" | "body"> = {}) {
    return this.http<T>(path, { ...opts, method: "GET" });
  }

  post<T>(path: string, body?: unknown, opts: Omit<ApiRequestOptions, "method" | "body"> = {}) {
    return this.http<T>(path, { ...opts, method: "POST", body });
  }

  put<T>(path: string, body?: unknown, opts: Omit<ApiRequestOptions, "method" | "body"> = {}) {
    return this.http<T>(path, { ...opts, method: "PUT", body });
  }

  patch<T>(path: string, body?: unknown, opts: Omit<ApiRequestOptions, "method" | "body"> = {}) {
    return this.http<T>(path, { ...opts, method: "PATCH", body });
  }

  delete<T>(path: string, opts: Omit<ApiRequestOptions, "method" | "body"> = {}) {
    return this.http<T>(path, { ...opts, method: "DELETE" });
  }
}

export const api = new ApiClient();