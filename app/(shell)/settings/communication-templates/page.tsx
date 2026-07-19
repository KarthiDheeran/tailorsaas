"use client";

import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  MessageSquareText,
  Save,
  Smartphone,
} from "lucide-react";
import {
  getCommunicationTemplatesAction,
  saveCommunicationTemplateAction,
} from "@/app/(shell)/settings/communication-templates/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { LoadingState } from "@/components/ui/loading-state";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import {
  COMMUNICATION_TEMPLATE_PLACEHOLDERS,
  DEFAULT_COMMUNICATION_TEMPLATES,
} from "@/lib/communication-templates";
import type { CommunicationTemplate } from "@/lib/types";

function TemplatesContent() {
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission("settings.manageShop");
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getCommunicationTemplatesAction()
      .then((result) => {
        if (cancelled) return;
        setTemplates(result.templates.length > 0 ? result.templates : DEFAULT_COMMUNICATION_TEMPLATES);
        setEnabled(result.enabled);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateTemplate(index: number, patch: Partial<CommunicationTemplate>) {
    setTemplates((current) =>
      current.map((template, templateIndex) =>
        templateIndex === index ? { ...template, ...patch } : template
      )
    );
  }

  async function saveTemplate(template: CommunicationTemplate) {
    setSavingType(template.templateType);
    setMessage(null);
    const result = await saveCommunicationTemplateAction({
      templateType: template.templateType,
      body: template.body,
      active: template.active,
      whatsappEnabled: template.whatsappEnabled,
      smsEnabled: template.smsEnabled,
      emailEnabled: template.emailEnabled,
    });
    setSavingType(null);
    if (!result.success) {
      setMessage(result.error);
      return;
    }
    setMessage("Template saved.");
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <Link
        href="/settings"
        className="mb-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-soft bg-white px-3 text-sm font-semibold text-ink-muted shadow-soft transition-colors hover:border-primary hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Settings
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-tint text-primary">
          <MessageSquareText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Communication Templates</h1>
          <p className="text-sm text-ink-muted">
            Message text used by calendar reminders and customer follow-ups.
          </p>
        </div>
      </div>

      {!enabled && (
        <div className="mb-5 rounded-xl border border-chip-peach bg-chip-peach p-4 text-sm font-medium text-chip-peach-fg">
          Built-in templates are being shown. Apply <span className="font-semibold">supabase/migrations/0019_communication_templates_and_rework.sql</span> to edit and save templates.
          Then apply <span className="font-semibold">supabase/migrations/0020_communication_template_channels.sql</span> to enable channel controls.
        </div>
      )}

      {message && (
        <div className="mb-5 rounded-xl border border-border-soft bg-white p-4 text-sm font-medium text-ink-muted shadow-soft">
          {message}
        </div>
      )}

      <div className="mb-5 rounded-xl border border-border-soft bg-white p-4 text-sm text-ink-muted shadow-soft">
        <div className="font-semibold text-ink">Available placeholders</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {COMMUNICATION_TEMPLATE_PLACEHOLDERS.map((placeholder) => (
            <code
              key={placeholder}
              className="rounded-md bg-surface px-2 py-1 text-xs text-ink-muted"
            >
              {"{{"}{placeholder}{"}}"}
            </code>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Loading templates..." />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {templates.map((template, index) => (
            <section
              key={template.templateType}
              className="rounded-xl border border-border-soft bg-white p-5 shadow-soft"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-ink">{template.title}</h2>
                  <p className="text-xs text-ink-muted">{template.templateType}</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
                  <input
                    type="checkbox"
                    checked={template.active}
                    disabled={!canManage || !enabled}
                    onChange={(event) => updateTemplate(index, { active: event.target.checked })}
                    className="h-4 w-4 accent-primary"
                  />
                  Active
                </label>
              </div>
              <textarea
                value={template.body}
                disabled={!canManage || !enabled}
                onChange={(event) => updateTemplate(index, { body: event.target.value })}
                rows={5}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint disabled:bg-surface disabled:text-ink-muted"
              />
              <div className="mt-4 rounded-lg border border-border-soft bg-surface p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  Channels
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <ChannelToggle
                    label="WhatsApp"
                    icon={WhatsAppIcon}
                    checked={template.whatsappEnabled}
                    disabled={!canManage || !enabled || !template.active}
                    onChange={(checked) => updateTemplate(index, { whatsappEnabled: checked })}
                  />
                  <ChannelToggle
                    label="SMS"
                    icon={Smartphone}
                    checked={template.smsEnabled}
                    disabled={!canManage || !enabled || !template.active}
                    onChange={(checked) => updateTemplate(index, { smsEnabled: checked })}
                  />
                  <ChannelToggle
                    label="Email"
                    icon={Mail}
                    checked={template.emailEnabled}
                    disabled={!canManage || !enabled || !template.active}
                    onChange={(checked) => updateTemplate(index, { emailEnabled: checked })}
                  />
                </div>
                {!template.active && (
                  <p className="mt-2 text-xs text-ink-faint">
                    Enable the template before choosing delivery channels.
                  </p>
                )}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => saveTemplate(template)}
                  disabled={!canManage || !enabled || savingType === template.templateType}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-3.5 w-3.5" />
                  {savingType === template.templateType ? "Saving..." : "Save"}
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelToggle({
  label,
  icon: Icon,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-border-soft bg-white px-3 py-2 text-xs font-semibold text-ink-muted">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-primary"
      />
      <Icon className="h-3.5 w-3.5 text-ink-faint" />
      {label}
    </label>
  );
}

export default function CommunicationTemplatesPage() {
  return (
    <RequirePermission permission="settings.view">
      <TemplatesContent />
    </RequirePermission>
  );
}
