"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { markPasswordChangedAction } from "@/app/auth/actions";

const inputClass =
  "h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

// Shared by /reset-password (forgot-password recovery link) and
// /change-password (forced first-login change for must_change_password
// users) — both end the same way: set the new password, then clear
// must_change_password via the narrow mark_password_changed() RPC (a no-op
// if it was already false).
export function SetNewPasswordForm({
  heading,
  description,
  submitLabel = "Save new password",
}: {
  heading: string;
  description: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }
    const markResult = await markPasswordChangedAction();
    if (!markResult.success) {
      setLoading(false);
      setError(markResult.error ?? "Could not complete the password update.");
      return;
    }
    setLoading(false);
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div>
        <h1 className="text-[17px] font-semibold text-ink">{heading}</h1>
        <p className="text-sm text-ink-muted">{description}</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink-muted">New password</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink-muted">
          Confirm new password
        </span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={inputClass}
        />
      </label>

      {error && (
        <div className="rounded-lg bg-chip-red px-3.5 py-2.5 text-xs font-medium text-chip-red-fg">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="h-11 rounded-lg bg-primary text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:opacity-60"
      >
        {loading ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
