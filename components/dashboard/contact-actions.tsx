import { Phone } from "lucide-react";
import { logWhatsAppMessageAction } from "@/app/(shell)/communications/actions";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import type { WhatsAppMessageContextType } from "@/lib/types";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

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
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
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
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
      >
        <WhatsAppIcon className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
