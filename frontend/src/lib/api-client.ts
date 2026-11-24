export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string; details: { path?: string; message?: string }[] };

/** Calls a RelayNest API route and unwraps the `{ data }` / `{ error }` envelope. Never throws. */
export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
      headers: { "content-type": "application/json" },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, status: res.status, message: json?.error?.message ?? "Request failed.", details: json?.error?.details ?? [] };
    return { ok: true, data: json.data as T };
  } catch {
    return { ok: false, status: 0, message: "Network error. Please try again.", details: [] };
  }
}
