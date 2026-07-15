import { Phone } from "lucide-react";
import { logWhatsAppMessageAction } from "@/app/(shell)/communications/actions";
import type { WhatsAppMessageContextType } from "@/lib/types";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="currentColor"
    >
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35ZM12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.73.98 1-3.64-.24-.37a9.86 9.86 0 0 1-1.51-5.26C2.17 6.46 6.6 2.03 12.05 2.03a9.85 9.85 0 0 1 6.99 2.9 9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.43 9.87-9.88 9.87Zm8.41-18.33A11.82 11.82 0 0 0 12.05 0C5.5 0 .18 5.32.18 11.91c0 2.1.55 4.16 1.6 5.97L.08 24l6.25-1.64a11.9 11.9 0 0 0 5.71 1.45h.01c6.55 0 11.88-5.32 11.88-11.89a11.82 11.82 0 0 0-3.47-8.46Z" />
    </svg>
  );
}

export function ContactActions({
  phone,
  message,
  contextType,
  contextId,
  callTitle = "Call Customer",
  whatsappTitle = "WhatsApp Customer",
}: {
  phone: string;
  message: string;
  contextType?: WhatsAppMessageContextType;
  contextId?: string;
  callTitle?: string;
  whatsappTitle?: string;
}) {
  function logWhatsAppOpen() {
    if (!contextType) return;
    void logWhatsAppMessageAction({
      phone,
      message,
      contextType,
      contextId,
      status: "Opened",
    });
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <a
        href={`tel:${phone}`}
        title={callTitle}
        aria-label={callTitle}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <Phone className="h-3.5 w-3.5" />
      </a>
      <a
        href={buildWhatsAppUrl(phone, message)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={logWhatsAppOpen}
        title={whatsappTitle}
        aria-label={whatsappTitle}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <WhatsAppIcon className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
