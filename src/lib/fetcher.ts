import type { ApiErrorBody } from "./views";

export class ClientApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** JSON fetch helper for client components with Mongolian error messages. */
export async function apiFetch<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    });
  } catch {
    throw new ClientApiError("Сервертэй холбогдож чадсангүй. Интернэт холболтоо шалгана уу.", 0, "network");
  }
  const data = (await response.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!response.ok) {
    const error = data?.error;
    // Login expired (or the account is gone): sign in again and come back here.
    // A full navigation is intended: this helper has no router and stale client state should reset.
    if (response.status === 401 && typeof window !== "undefined") {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
    throw new ClientApiError(error?.message ?? `Алдаа гарлаа (${response.status}).`, response.status, error?.code ?? "unknown", error?.details);
  }
  return data as T;
}
