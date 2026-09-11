"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
      });
      if (resetError) throw resetError;
      // Keep the success message independent of whether the account exists.
      setSubmitted(true);
    } catch {
      setError("Could not send the request. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[17px] font-semibold text-ink">Check your email</h1>
        <p className="text-sm text-ink-muted">
          If an account exists for that email, a password reset link has been sent.
        </p>
        <Link
          href="/login"
          className="text-center text-sm font-medium text-primary hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div>
        <h1 className="text-[17px] font-semibold text-ink">Reset your password</h1>
        <p className="text-sm text-ink-muted">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink-muted">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </label>

      {error && <p role="alert" className="text-sm text-chip-red-fg">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="h-11 rounded-lg bg-primary text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:opacity-60"
      >
        {loading ? "Sending…" : "Send reset link"}
      </button>

      <Link
        href="/login"
        className="text-center text-sm font-medium text-primary hover:underline"
      >
        Back to sign in
      </Link>
    </form>
  );
}
