"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MessageCircle, Search } from "lucide-react";
import { getWhatsAppMessagesAction } from "@/app/(shell)/communications/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";
import type { WhatsAppMessage } from "@/lib/types";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function contextHref(message: WhatsAppMessage): string | null {
  if (!message.contextId) return null;
  if (message.contextType === "Order" || message.contextType === "Calendar") {
    return `/orders?view=${message.contextId}`;
  }
  if (message.contextType === "Job Card") return `/job-cards?view=${message.contextId}`;
  if (message.contextType === "Customer") return `/customers/${message.contextId}`;
  return null;
}

function CommunicationsContent() {
  const [messages, setMessages] = useState<WhatsAppMessage[] | null>([]);
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getWhatsAppMessagesAction()
      .then((result) => {
        if (cancelled) return;
        setMessages(result);
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, "Failed to load communications."));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredMessages = useMemo(() => {
    const rows = messages ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((message) =>
      [
        message.phone,
        message.message,
        message.contextType,
        message.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [messages, query]);

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink">Communications</h1>
        <p className="text-sm text-ink-muted">
          Manual WhatsApp reminder and customer-message log.
        </p>
      </div>

      {loadError && (
        <div className="mb-5">
          <LoadError message={loadError} />
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading communications..." />
      ) : messages === null ? (
        <div className="rounded-xl border border-border-soft bg-white p-4 text-sm text-ink-muted shadow-soft">
          WhatsApp message logging is ready in the app, but the database migration has not been applied yet.
          Apply <span className="font-semibold text-ink">supabase/migrations/0015_whatsapp_messages.sql</span> to start saving the log.
        </div>
      ) : (
        <>
          <div className="mb-5 rounded-xl border border-border-soft bg-white p-4 shadow-soft">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search phone, message, context, or status"
                className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="text-[13px] font-semibold text-ink-muted">
                <tr className="border-b border-border-soft">
                  <th className="px-5 py-3">Time</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Context</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Message</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {filteredMessages.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-ink-muted">
                      No WhatsApp messages match this view.
                    </td>
                  </tr>
                ) : (
                  filteredMessages.map((message) => {
                    const href = contextHref(message);
                    return (
                      <tr key={message.id} className="align-top hover:bg-surface">
                        <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                          {formatDateTime(message.sentAt)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 font-medium text-ink">
                          {message.phone}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                          {message.contextType}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3">
                          <span className="rounded-full bg-chip-mint px-2.5 py-1 text-xs font-semibold text-chip-mint-fg">
                            {message.status}
                          </span>
                        </td>
                        <td className="max-w-xl px-5 py-3 text-ink-muted">
                          <div className="line-clamp-2">{message.message}</div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-right">
                          {href ? (
                            <Link
                              href={href}
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-primary hover:bg-primary-tint"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              Open
                            </Link>
                          ) : (
                            <span className="text-xs text-ink-faint">No link</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function CommunicationsPage() {
  return (
    <RequirePermission anyOf={["calendar.view", "orders.view", "customers.view"]}>
      <CommunicationsContent />
    </RequirePermission>
  );
}
