import { Shirt } from "lucide-react";

// Chrome-free layout for /login, /forgot-password, /reset-password,
// /change-password — no Sidebar/AppShell, same reasoning as the two print
// routes living outside app/(shell). Calm, plain card — no flashy login
// screen, per design brief.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Shirt className="h-6 w-6 text-primary" />
          <div>
            <div className="text-[18px] font-bold leading-tight tracking-tight text-ink">
              NewLook
            </div>
            <div className="text-[11px] leading-tight text-ink-faint">
              Tailoring. Simplified.
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border-soft bg-white p-6 shadow-soft">
          {children}
        </div>
      </div>
    </div>
  );
}
