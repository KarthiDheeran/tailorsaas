import { Phone, MessageCircle } from "lucide-react";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

export function ContactActions({
  phone,
  message,
}: {
  phone: string;
  message: string;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <a
        href={`tel:${phone}`}
        title="Call"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <Phone className="h-3.5 w-3.5" />
      </a>
      <a
        href={buildWhatsAppUrl(phone, message)}
        target="_blank"
        rel="noopener noreferrer"
        title="WhatsApp"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <MessageCircle className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
