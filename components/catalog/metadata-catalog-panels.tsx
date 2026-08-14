"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Power, Search, X } from "lucide-react";
import type {
  CatalogField,
  CatalogFieldInput,
  CatalogFieldInputType,
  CatalogFieldType,
  CatalogSection,
  CatalogSectionInput,
} from "@/lib/catalog";

const inputClass = "h-10 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";
const fieldTypes: CatalogFieldType[] = ["measurement", "style", "instruction"];
const inputTypes: CatalogFieldInputType[] = ["number", "text", "textarea", "select", "multiselect", "checkbox", "table"];
const defaultTableMetadata = { table: { rows: [{ itemOptions: [{ name: "LINING EDU", tailorAmount: 10, itemPrice: 100, workerStage: "Stitching" }, { name: "LINING 1", tailorAmount: 12, itemPrice: 120, workerStage: "Stitching" }, { name: "LINING 2", tailorAmount: 14, itemPrice: 140, workerStage: "Stitching" }] }, { itemOptions: [{ name: "SHAWL 1", tailorAmount: 10, itemPrice: 200, workerStage: "Stitching" }, { name: "SHAWL 2", tailorAmount: 10, itemPrice: 240, workerStage: "Stitching" }] }], columns: [{ key: "item", label: "Item Name", type: "select", optionsSource: "row.itemOptions" }, { key: "qty", label: "Qty", type: "number" }, { key: "tailorAmount", label: "Tailor Amt", type: "number", readonly: true }, { key: "itemPrice", label: "Item Price", type: "number", readonly: true }, { key: "total", label: "Total", type: "calculated", formula: "qty*itemPrice" }, { key: "display", label: "Display", type: "display", template: "{item} - {qty}" }] } };

function Drawer({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return <><button type="button" aria-label="Close drawer" onClick={onClose} className="fixed inset-0 z-40 cursor-default bg-black/30" /><aside className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-white shadow-xl sm:w-[560px]"><header className="flex items-center justify-between border-b border-border-soft px-6 py-4"><h2 className="text-lg font-semibold text-ink">{title}</h2><button type="button" onClick={onClose} className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted"><X className="h-4 w-4" /></button></header>{children}</aside></>;
}

export function SectionsPanel({ sections, canManage, onSave }: { sections: CatalogSection[]; canManage: boolean; onSave: (id: string | null, input: CatalogSectionInput) => Promise<{ success: boolean; error?: string }> }) {
  const [editing, setEditing] = useState<CatalogSection | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(""); const [order, setOrder] = useState(1); const [icon, setIcon] = useState(""); const [active, setActive] = useState(true);
  function open(section: CatalogSection | null) { setEditing(section); setName(section?.name ?? ""); setOrder(section?.displayOrder ?? (sections.length + 1) * 10); setIcon(section?.icon ?? ""); setActive(section?.isActive ?? true); setError(null); }
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); const result = await onSave(editing?.id ?? null, { name, displayOrder: order, icon: icon || null, isActive: active }); setSaving(false); if (!result.success) { setError(result.error ?? "Could not save section."); return; } setEditing(undefined); }
  return <><div className="mb-4 flex justify-end">{canManage && <button type="button" onClick={() => open(null)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"><Plus className="h-4 w-4" />Add Section</button>}</div><div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft"><table className="w-full text-left text-sm"><thead className="bg-surface-muted text-ink-muted"><tr><th className="px-4 py-3">Section</th><th className="px-4 py-3">Icon</th><th className="px-4 py-3">Order</th><th className="px-4 py-3">Status</th>{canManage && <th className="px-4 py-3 text-right">Actions</th>}</tr></thead><tbody>{sections.map(section => <tr className="border-t border-border-soft" key={section.id}><td className="px-4 py-3 font-semibold text-ink">{section.name}</td><td className="px-4 py-3 text-ink-muted">{section.icon ?? "—"}</td><td className="px-4 py-3">{section.displayOrder}</td><td className="px-4 py-3">{section.isActive ? "Active" : "Inactive"}</td>{canManage && <td className="px-4 py-3 text-right"><button type="button" onClick={() => open(section)} aria-label={`Edit ${section.name}`} className="rounded-lg border border-border p-2 hover:bg-surface-muted"><Pencil className="h-4 w-4" /></button></td>}</tr>)}</tbody></table></div>{editing !== undefined && <Drawer title={editing ? "Edit Section" : "Add Section"} onClose={() => setEditing(undefined)}><form onSubmit={submit} className="space-y-4 p-6">{error && <p className="rounded-lg bg-chip-red p-3 text-sm text-chip-red-fg">{error}</p>}<label className="block text-sm font-medium text-ink">Name<input required value={name} onChange={e => setName(e.target.value)} className={`${inputClass} mt-1.5 w-full`} /></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium text-ink">Display order<input type="number" min={1} value={order} onChange={e => setOrder(Number(e.target.value))} className={`${inputClass} mt-1.5 w-full`} /></label><label className="text-sm font-medium text-ink">Icon<input value={icon} onChange={e => setIcon(e.target.value)} placeholder="e.g. Ruler" className={`${inputClass} mt-1.5 w-full`} /></label></div><label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />Active</label><button disabled={saving} className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save Section"}</button></form></Drawer>}</>;
}

export function FieldsPanel({ fields, sections, canManage, onSave, onToggleActive }: { fields: CatalogField[]; sections: CatalogSection[]; canManage: boolean; onSave: (id: string | null, input: CatalogFieldInput) => Promise<{ success: boolean; error?: string }>; onToggleActive: (field: CatalogField) => Promise<void> }) {
  const [search, setSearch] = useState(""); const [type, setType] = useState<"all" | CatalogFieldType>("all"); const [status, setStatus] = useState("all"); const [editing, setEditing] = useState<CatalogField | null | undefined>(undefined);
  const filtered = useMemo(() => fields.filter(field => (type === "all" || field.fieldType === type) && (status === "all" || (status === "active") === field.isActive) && `${field.name} ${field.code}`.toLowerCase().includes(search.toLowerCase())), [fields, search, status, type]);
  function open(field: CatalogField | null) { setEditing(field); }
  return <><div className="mb-4 flex flex-col gap-2 sm:flex-row"><label className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-muted"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search fields" className={`${inputClass} w-full pl-9`} /></label><select value={type} onChange={e => setType(e.target.value as typeof type)} className={inputClass}><option value="all">All types</option>{fieldTypes.map(value => <option value={value} key={value}>{value}</option>)}</select><select value={status} onChange={e => setStatus(e.target.value)} className={inputClass}><option value="all">All status</option><option value="active">Active</option><option value="inactive">Inactive</option></select>{canManage && <button type="button" onClick={() => open(null)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"><Plus className="h-4 w-4" />Add Field</button>}</div><div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft"><table className="w-full text-left text-sm"><thead className="bg-surface-muted text-ink-muted"><tr><th className="px-4 py-3">Field</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Input</th><th className="px-4 py-3">Section</th><th className="px-4 py-3">Status</th>{canManage && <th className="px-4 py-3 text-right">Actions</th>}</tr></thead><tbody>{filtered.map(field => <tr key={field.id} className="border-t border-border-soft"><td className="px-4 py-3"><p className="font-semibold text-ink">{field.name}{field.isSystem && <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-[11px] text-ink-muted">System</span>}</p><code className="text-xs text-ink-muted">{field.code}</code></td><td className="px-4 py-3 capitalize">{field.fieldType}</td><td className="px-4 py-3">{field.inputType}</td><td className="px-4 py-3">{sections.find(s => s.id === field.defaultSectionId)?.name ?? "—"}</td><td className="px-4 py-3">{field.isActive ? "Active" : "Inactive"}</td>{canManage && <td className="px-4 py-3 text-right"><div className="inline-flex gap-1"><button type="button" onClick={() => open(field)} aria-label={`Edit ${field.name}`} className="rounded-lg border border-border p-2 hover:bg-surface-muted"><Pencil className="h-4 w-4" /></button>{!field.isSystem && <button type="button" onClick={() => onToggleActive(field)} aria-label={`${field.isActive ? "Deactivate" : "Activate"} ${field.name}`} className="rounded-lg border border-border p-2 hover:bg-surface-muted"><Power className="h-4 w-4" /></button>}</div></td>}</tr>)}</tbody></table></div>{editing !== undefined && <FieldDrawer field={editing} sections={sections} onClose={() => setEditing(undefined)} onSave={onSave} />}</>;
}

function optionTamilLines(field: CatalogField | null) {
  const labels = field?.uiMetadata?.optionLabelsTa;
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) return "";
  return (field?.options ?? [])
    .map((option) => {
      const value = (labels as Record<string, unknown>)[option];
      return typeof value === "string" ? value : "";
    })
    .join("\n");
}

function optionTamilMap(optionsText: string, tamilText: string) {
  const englishOptions = optionsText.split("\n").map((value) => value.trim()).filter(Boolean);
  const tamilOptions = tamilText.split("\n").map((value) => value.trim());
  return Object.fromEntries(
    englishOptions.flatMap((option, index) => {
      const tamil = tamilOptions[index];
      return tamil ? [[option, tamil]] : [];
    })
  );
}

function FieldDrawer({ field, sections, onClose, onSave }: { field: CatalogField | null; sections: CatalogSection[]; onClose: () => void; onSave: (id: string | null, input: CatalogFieldInput) => Promise<{ success: boolean; error?: string }> }) {
  const [name, setName] = useState(field?.name ?? ""); const [code, setCode] = useState(field?.code ?? ""); const [fieldType, setFieldType] = useState<CatalogFieldType>(field?.fieldType ?? "measurement"); const [inputType, setInputType] = useState<CatalogFieldInputType>(field?.inputType ?? "number"); const [section, setSection] = useState(field?.defaultSectionId ?? ""); const [unit, setUnit] = useState(field?.unit ?? ""); const [placeholder, setPlaceholder] = useState(field?.placeholder ?? ""); const [options, setOptions] = useState(field?.options.join("\n") ?? ""); const [optionLabelsTa, setOptionLabelsTa] = useState(optionTamilLines(field)); const [metadata, setMetadata] = useState(JSON.stringify(field?.inputType === "table" ? field.uiMetadata : defaultTableMetadata, null, 2)); const [min, setMin] = useState(field?.minValue?.toString() ?? ""); const [max, setMax] = useState(field?.maxValue?.toString() ?? ""); const [decimals, setDecimals] = useState(field?.decimalPlaces?.toString() ?? ""); const [required, setRequired] = useState(field?.isRequiredDefault ?? false); const [order, setOrder] = useState(field?.displayOrder ?? 10); const [active, setActive] = useState(field?.isActive ?? true); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false); const isNumber = inputType === "number"; const hasOptions = inputType === "select" || inputType === "multiselect"; const isTable = inputType === "table";
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    let uiMetadata: Record<string, unknown> = {};
    if (isTable) {
      try {
        const parsed = JSON.parse(metadata);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setError("Table metadata must be a JSON object.");
          return;
        }
        uiMetadata = parsed as Record<string, unknown>;
      } catch {
        setError("Table metadata is not valid JSON.");
        return;
      }
    } else if (field?.uiMetadata && typeof field.uiMetadata === "object" && !Array.isArray(field.uiMetadata)) {
      uiMetadata = { ...field.uiMetadata };
    }
    if (hasOptions) {
      const labelsTa = optionTamilMap(options, optionLabelsTa);
      if (Object.keys(labelsTa).length > 0) {
        uiMetadata.optionLabelsTa = labelsTa;
      } else {
        delete uiMetadata.optionLabelsTa;
      }
    }
    setSaving(true);
    const result = await onSave(field?.id ?? null, { name, code, fieldType, defaultSectionId: section || null, inputType, unit: unit || null, placeholder: placeholder || null, options: hasOptions ? options.split("\n").map(value => value.trim()).filter(Boolean) : [], uiMetadata, minValue: isNumber && min !== "" ? Number(min) : null, maxValue: isNumber && max !== "" ? Number(max) : null, decimalPlaces: isNumber && decimals !== "" ? Number(decimals) : null, isRequiredDefault: required, displayOrder: order, isActive: field?.isSystem ? true : active });
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? "Could not save field.");
      return;
    }
    onClose();
  }
  return <Drawer title={field ? "Edit Field" : "Add Field"} onClose={onClose}><form onSubmit={submit} className="space-y-4 p-6">{error && <p className="rounded-lg bg-chip-red p-3 text-sm text-chip-red-fg">{error}</p>}<div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium text-ink">Name<input required value={name} onChange={e => setName(e.target.value)} className={`${inputClass} mt-1.5 w-full`} /></label><label className="text-sm font-medium text-ink">Code<input required disabled={field?.isSystem} value={code} onChange={e => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} className={`${inputClass} mt-1.5 w-full disabled:bg-surface-muted`} /></label></div><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium text-ink">Field type<select value={fieldType} onChange={e => setFieldType(e.target.value as CatalogFieldType)} className={`${inputClass} mt-1.5 w-full`}>{fieldTypes.map(value => <option value={value} key={value}>{value}</option>)}</select></label><label className="text-sm font-medium text-ink">Input type<select value={inputType} onChange={e => setInputType(e.target.value as CatalogFieldInputType)} className={`${inputClass} mt-1.5 w-full`}>{inputTypes.map(value => <option value={value} key={value}>{value}</option>)}</select></label></div><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium text-ink">Default section<select value={section} onChange={e => setSection(e.target.value)} className={`${inputClass} mt-1.5 w-full`}><option value="">No default</option>{sections.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label><label className="text-sm font-medium text-ink">Display order<input type="number" min={1} value={order} onChange={e => setOrder(Number(e.target.value))} className={`${inputClass} mt-1.5 w-full`} /></label></div><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium text-ink">Unit<input value={unit} onChange={e => setUnit(e.target.value)} placeholder="inch" className={`${inputClass} mt-1.5 w-full`} /></label><label className="text-sm font-medium text-ink">Placeholder<input value={placeholder} onChange={e => setPlaceholder(e.target.value)} className={`${inputClass} mt-1.5 w-full`} /></label></div>{isNumber && <div className="grid grid-cols-3 gap-3"><label className="text-sm font-medium text-ink">Minimum<input type="number" value={min} onChange={e => setMin(e.target.value)} className={`${inputClass} mt-1.5 w-full`} /></label><label className="text-sm font-medium text-ink">Maximum<input type="number" value={max} onChange={e => setMax(e.target.value)} className={`${inputClass} mt-1.5 w-full`} /></label><label className="text-sm font-medium text-ink">Decimals<input type="number" min={0} max={6} value={decimals} onChange={e => setDecimals(e.target.value)} className={`${inputClass} mt-1.5 w-full`} /></label></div>}{hasOptions && <div className="space-y-3"><label className="block text-sm font-medium text-ink">Options <span className="font-normal text-ink-muted">(English; customer print)</span><textarea value={options} onChange={e => setOptions(e.target.value)} className="mt-1.5 min-h-28 w-full rounded-lg border border-border p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint" /></label><label className="block text-sm font-medium text-ink">Tamil Options <span className="font-normal text-ink-muted">(same line order; production print)</span><textarea value={optionLabelsTa} onChange={e => setOptionLabelsTa(e.target.value)} className="mt-1.5 min-h-28 w-full rounded-lg border border-border p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint" /><span className="mt-1 block text-xs text-ink-muted">Line 1 English maps to line 1 Tamil. Leave blank if both prints can use the same text.</span></label></div>}{isTable && <label className="block text-sm font-medium text-ink">Table metadata <span className="font-normal text-ink-muted">(JSON; each select column has its own options)</span><textarea value={metadata} onChange={e => setMetadata(e.target.value)} className="mt-1.5 min-h-72 w-full rounded-lg border border-border p-3 font-mono text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint" /><span className="mt-1 block text-xs text-ink-muted">Column types: text, number, select, calculated, display. Example total formula: qty*itemPrice. Display columns can use template: &#123;item&#125; - &#123;qty&#125;. Add workerStage to an item option to pay Tailor Amt only in that stage.</span></label>}<label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} />Required by default</label>{field?.isSystem ? <p className="rounded-lg bg-surface-muted p-3 text-xs text-ink-muted">System field codes and active state are protected.</p> : <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />Active</label>}<button disabled={saving} className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save Field"}</button></form></Drawer>;
}
