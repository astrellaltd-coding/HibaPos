// Lightweight typed fetch wrapper for the frontend.
export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type FetchOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
};

function buildUrl(path: string, query?: FetchOptions["query"]): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const url = buildUrl(path, opts.query);
  const isFormData = opts.body instanceof FormData;
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers:
      opts.body !== undefined && !isFormData
        ? { "Content-Type": "application/json" }
        : undefined,
    body: opts.body !== undefined ? (isFormData ? (opts.body as FormData) : JSON.stringify(opts.body)) : undefined,
    signal: opts.signal,
    credentials: "same-origin",
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);
  if (!res.ok) {
    const message =
      (isJson && data && typeof data === "object" && "error" in data && String((data as Record<string, unknown>).error)) ||
      res.statusText ||
      "Erreur réseau";
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: FetchOptions["query"]) => apiFetch<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "DELETE", body }),
};
