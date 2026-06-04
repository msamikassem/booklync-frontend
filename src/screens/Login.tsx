"use client";

/**
 * Login page — mirrors auth.js login form behaviour exactly:
 *   POST /auth/login → GET /auth/me → isStaffOnlyUser → route.
 * Zero branch check → show friendly message instead of routing to a broken page.
 */

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "../auth/client";
import { storage } from "../auth/storage";
import { isStaffOnlyUser } from "../contexts/AuthContext";
import { formatApiError } from "../lib/errors";
import type { UserMeResponse, AuthTokenResponse, ApiError } from "../api/types";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(formatApiError(data as ApiError, "Invalid email or password."));
        return;
      }

      const tokens = data as AuthTokenResponse;

      // Get identity to decide which dashboard to route to
      const meRes = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });
      const me: UserMeResponse | null = meRes.ok ? await meRes.json() : null;

      if (!me) {
        setError("Logged in, but could not load your account. Please try again.");
        return;
      }

      if (!me.is_owner && (!me.branches || me.branches.length === 0)) {
        setError(
          "Your account isn't assigned to any branch yet. Please contact your administrator to grant access, then try again."
        );
        return;
      }

      const staffOnly = isStaffOnlyUser(me);
      storage.save(tokens, remember, staffOnly ? "staff" : "business");
      router.replace(staffOnly ? "/staff" : "/dashboard");
    } catch {
      setError("Could not reach the server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-soft flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex justify-center mb-8">
          <a href="/" className="flex items-center gap-2.5 font-display font-semibold text-xl text-ink tracking-tight">
            <svg width="32" height="32" viewBox="0 0 100 100" className="flex-shrink-0">
              <rect width="100" height="100" rx="22" fill="#2563EB" />
              <rect x="28" y="28" width="44" height="44" rx="8" fill="none" stroke="white" strokeWidth="6" />
            </svg>
            Booklync
          </a>
        </div>

        <div className="bg-canvas rounded-xl shadow-md p-8">
          <h1 className="font-display text-2xl font-semibold text-ink mb-1">Welcome back</h1>
          <p className="text-muted text-sm mb-6">Sign in to your account</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm mb-4 whitespace-pre-line">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@business.com"
                className="w-full h-10 px-3 border border-hairline rounded-md text-sm bg-canvas text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 px-3 border border-hairline rounded-md text-sm bg-canvas text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="accent-primary"
              />
              Remember me
            </label>

            <button
              type="submit"
              disabled={loading}
              className="h-10 bg-primary hover:bg-primary-hover text-white font-medium text-sm rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
