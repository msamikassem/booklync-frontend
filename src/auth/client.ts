/**
 * Typed API client — mirrors apiFetch + tryRefresh from auth.js.
 *
 * Every request gets an Authorization: Bearer header. On 401:
 *   1. POST /auth/refresh with the stored refresh_token.
 *   2. Update the stored access_token.
 *   3. Retry the original request once.
 *   4. On refresh failure, clear storage and redirect to /login.
 */

import { storage } from "./storage";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api/v1";

let _refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refresh_token = storage.getRefresh();
  if (!refresh_token) return false;

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token }),
  });

  if (!res.ok) {
    storage.clear();
    return false;
  }

  const data = await res.json();
  storage.updateAccessToken(data.access_token);
  return true;
}

/** Shared refresh — collapses concurrent 401s into one refresh call. */
async function ensureRefresh(): Promise<boolean> {
  if (!_refreshPromise) {
    _refreshPromise = tryRefresh().finally(() => { _refreshPromise = null; });
  }
  return _refreshPromise;
}

export type FetchOptions = RequestInit & { skipAuth?: boolean };

export async function apiFetch(path: string, options: FetchOptions = {}): Promise<Response> {
  const token = storage.getAccess();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token && !options.skipAuth) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res = await fetch(API_BASE + path, { ...options, headers });

  if (res.status === 401 && !options.skipAuth) {
    const refreshed = await ensureRefresh();
    if (!refreshed) {
      window.location.href = "/login";
      return res;
    }
    headers["Authorization"] = `Bearer ${storage.getAccess()}`;
    res = await fetch(API_BASE + path, { ...options, headers });
  }

  return res;
}

export { API_BASE };
