/**
 * Accept-invite onboarding (unauthenticated). Ports accept-invite.html:
 *   read ?token= → set a password → POST /users/accept-invite → auto-login →
 *   land on the right dashboard (staff own-calendar vs full dashboard).
 *
 * The post-activation redirect is a HARD navigation so AuthProvider remounts and
 * picks up the freshly-saved tokens (mirrors the legacy behaviour).
 */

import { useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { API_BASE } from "../auth/client";
import { storage } from "../auth/storage";
import { isStaffOnlyUser } from "../contexts/AuthContext";
import { formatApiError } from "../lib/errors";
import type { UserMeResponse, AuthTokenResponse, ApiError } from "../api/types";

const Brand = () => (
  <div className="flex justify-center mb-8">
    <span className="flex items-center gap-2.5 font-display font-semibold text-xl text-ink tracking-tight">
      <svg width="32" height="32" viewBox="0 0 100 100" className="flex-shrink-0">
        <rect width="100" height="100" rx="22" fill="#2563EB" />
        <rect x="28" y="28" width="44" height="44" rx="8" fill="none" stroke="white" strokeWidth="6" />
      </svg>
      Booklync
    </span>
  </div>
);

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/accept-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(formatApiError(data as ApiError, "Could not activate your account. The link may have expired."));
        return;
      }

      const tokens = data as AuthTokenResponse;

      // Identify the new account so we land on the right dashboard.
      const meRes = await fetch(`${API_BASE}/auth/me`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens.access_token}` },
      });
      const me: UserMeResponse | null = meRes.ok ? await meRes.json() : null;
      const staffOnly = isStaffOnlyUser(me);

      storage.save(tokens, true, staffOnly ? "staff" : "business");
      setDone(true);
      setTimeout(() => { window.location.href = staffOnly ? "/staff" : "/dashboard"; }, 1200);
    } catch {
      setError("Could not reach the server. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full h-10 px-3 border border-hairline rounded-md text-sm bg-canvas text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors";

  return (
    <div className="min-h-screen bg-surface-soft flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Brand />
        <div className="bg-canvas rounded-xl shadow-md p-8">
          {/* No token */}
          {!token && (
            <>
              <h1 className="font-display text-2xl font-semibold text-ink mb-1">Invalid link</h1>
              <p className="text-muted text-sm mb-6">This invitation link is missing or malformed. Ask your administrator to resend the invite.</p>
              <Link to="/login" className="text-primary text-sm font-medium hover:underline">Go to sign in</Link>
            </>
          )}

          {/* Success */}
          {token && done && (
            <div className="text-center py-4">
              <div className="mx-auto mb-4 grid place-items-center h-12 w-12 rounded-full bg-green-100">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <h1 className="font-display text-2xl font-semibold text-ink mb-1">You're all set!</h1>
              <p className="text-muted text-sm">Taking you to your dashboard…</p>
            </div>
          )}

          {/* Form */}
          {token && !done && (
            <>
              <h1 className="font-display text-2xl font-semibold text-ink mb-1">Create your password</h1>
              <p className="text-muted text-sm mb-6">You've been invited to Booklync. Set a password to activate your account.</p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm mb-4 whitespace-pre-line">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">Password</label>
                  <input id="password" type="password" required minLength={8} autoComplete="new-password"
                    value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" className={inputCls} />
                </div>
                <div>
                  <label htmlFor="confirm" className="block text-sm font-medium text-ink mb-1.5">Confirm password</label>
                  <input id="confirm" type="password" required autoComplete="new-password"
                    value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter your password" className={inputCls} />
                </div>
                <button type="submit" disabled={loading}
                  className="h-10 bg-primary hover:bg-primary-hover text-white font-medium text-sm rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                  {loading ? "Activating…" : "Activate account"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
