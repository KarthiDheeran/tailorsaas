"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { getProductionPrintLayoutBootstrapAction, resetProductionPrintLayoutAction, saveProductionPrintLayoutAction, setProductionPrintLayoutActiveAction, type ProductionPrintLayoutBootstrap } from "./actions";
import { DEFAULT_PRODUCTION_PRINT_COLUMNS, isProductionPrintSpacerCode, parseProductionPrintWorkDetailRowCode, PRODUCTION_PRINT_BLANK_SPACE_CODE, PRODUCTION_PRINT_COLUMN_OPTIONS, PRODUCTION_PRINT_EMPTY_BOX_CODE, type ProductionPrintLayoutCell, type ProductionPrintLayoutDefinition } from "@/lib/production-print-layout";
import type { GarmentSection } from "@/lib/catalog";

const inputClass = "h-10 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

function previewStyleClass(style: ProductionPrintLayoutCell["style"]) {
  if (style === "emphasis") return "border-[3px] border-slate-950 font-black";
  if (style === "double-border") return "border-4 border-double border-slate-950";
  if (style === "shaded") return "border-slate-950 bg-slate-200 font-black";
  if (style === "dashed") return "border-2 border-dashed border-slate-950";
  return "border border-slate-500";
}

function isWorkDetailsField(code: string, fields: Array<{ code: string; name: string }>) {
  if (parseProductionPrintWorkDetailRowCode(code)) return false;
  const name = fields.find((field) => field.code === code)?.name ?? "";
  return /work[\s_-]*details/i.test(`${code} ${name}`);
}

function previewCellContent(cell: ProductionPrintLayoutCell, fields: Array<{ code: string; name: string }>) {
  const row = cell.fieldCodes.length === 1 ? parseProductionPrintWorkDetailRowCode(cell.fieldCodes[0]) : null;
  if (row) return { heading: "", items: [`Sample work item ${row.rowNumber} · 1`] };
  const workDetails = cell.fieldCodes.some((code) => isWorkDetailsField(code, fields));
  if (workDetails) {
    return {
      heading: "Work Details",
      items: ["Lining · 1", "Shawl · 1", "Neck piping · 1", "Hand work · 1", "Button · 1", "Lace · 1"],
    };
  }
  if (cell.fieldCodes.includes("__addons__")) {
    return { heading: "Order add-ons", items: ["Hook · 1", "Zip · 1", "Lace · 1"] };
  }
  return {
    heading: "",
    items: [cell.fieldCodes.map((code) => isProductionPrintSpacerCode(code) ? "" : fields.find((field) => field.code === code)?.name ?? code).join(cell.separator === "slash" ? " / " : "\n")],
  };
}

function ProductionTicketPreview({
  layout,
  fields,
}: {
  layout: ProductionPrintLayoutDefinition;
  fields: Array<{ code: string; name: string }>;
}) {
  return (
    <aside className="xl:sticky xl:top-4 xl:self-start">
      <div className="mb-2 flex items-end justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Print preview</h2>
          <p className="text-xs text-slate-500">Field names are shown as sample values.</p>
        </div>
        <span className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
          {layout.columnsPerRow} columns
        </span>
      </div>
      <div className="overflow-x-auto rounded border border-slate-300 bg-slate-100 p-4 shadow-inner">
        <div className="mx-auto min-w-[520px] max-w-[720px] bg-white p-3 font-serif text-black shadow-md ring-1 ring-slate-400">
          <div className="grid grid-cols-[1fr_1fr_150px] gap-x-4 gap-y-0.5 border-b border-slate-400 pb-2 text-[13px] leading-tight">
            <strong className="text-[17px]">Stitching · Ord 25</strong>
            <strong>SAMPLE CUSTOMER</strong>
            <div className="row-span-3 flex flex-col items-center justify-center">
              <div className="h-8 w-32 bg-[repeating-linear-gradient(90deg,#111_0,#111_2px,transparent_2px,transparent_4px,#111_4px,#111_5px,transparent_5px,transparent_8px)]" />
              <span className="mt-0.5 font-sans text-[10px] font-bold tracking-wide">CH-2026-00025</span>
            </div>
            <span>9876543210</span>
            <span>Delivery: 20-09-2026</span>
            <strong>Chudidar - 1</strong>
          </div>
          <div
            className="mt-1 grid gap-1"
            style={{ gridTemplateColumns: `repeat(${layout.columnsPerRow}, minmax(0, 1fr))` }}
          >
            {layout.cells.map((cell) => {
              const content = previewCellContent(cell, fields);
              const legacyCollection = Boolean(content.heading) && cell.contentColumns === undefined;
              return (
                <div
                  key={cell.id}
                  className={`flex min-w-0 items-center justify-center overflow-hidden whitespace-pre-line p-1 text-center font-semibold leading-tight ${content.heading ? "flex-col" : ""} ${cell.height === "tall" ? "min-h-16" : "min-h-10"} ${cell.textSize === "small" ? "text-xs" : "text-sm"} ${cell.fieldCodes[0] === PRODUCTION_PRINT_BLANK_SPACE_CODE ? "border border-transparent" : previewStyleClass(cell.style)}`}
                  style={{ gridColumn: `span ${legacyCollection ? layout.columnsPerRow : cell.columnSpan}` }}
                  title={cell.fieldCodes.map((code) => fields.find((field) => field.code === code)?.name ?? code).join(" / ")}
                >
                  {content.heading && <span className="w-full border-b border-slate-400 pb-0.5 text-[9px] font-bold uppercase">{content.heading}</span>}
                  <span className="grid w-full" style={{ gridTemplateColumns: `repeat(${cell.contentColumns ?? (content.heading ? 3 : 1)}, minmax(0, 1fr))` }}>
                    {content.items.map((item, index) => <span key={`${cell.id}-${index}`} className="min-w-0 overflow-hidden p-1 [overflow-wrap:anywhere]">{item}</span>)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}

function Content() {
  const { hasPermission } = useCurrentUser(); const canManage = hasPermission("settings.manageShop") && hasPermission("shops.viewAll");
  const [data, setData] = useState<ProductionPrintLayoutBootstrap | null>(null);
  const [section, setSection] = useState<GarmentSection | "">(""); const [garmentTypeId, setGarmentTypeId] = useState("");
  const [layout, setLayout] = useState<ProductionPrintLayoutDefinition | null>(null);
  const [layoutActive, setLayoutActive] = useState(true);
  const [inherited, setInherited] = useState(false);
  const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  useEffect(() => { getProductionPrintLayoutBootstrapAction().then((result) => { if (!result.success) return setError(result.error); setData(result.data); setSection(result.data.sections[0] ?? ""); }).catch(() => setError("Could not load production print layouts.")); }, []);
  const garments = useMemo(() => data?.garments.filter((item) => item.section === section) ?? [], [data, section]);
  const fields = useMemo(() => { const relevant = garmentTypeId ? garments.filter((item) => item.id === garmentTypeId) : garments; const values = new Map(relevant.flatMap((item) => item.fields).map((field) => [field.code, field])); return [{ code: PRODUCTION_PRINT_EMPTY_BOX_CODE, name: "Empty box" }, { code: PRODUCTION_PRINT_BLANK_SPACE_CODE, name: "Blank space" }, { code: "__addons__", name: "Order add-ons" }, ...Array.from(values.values())]; }, [garmentTypeId, garments]);
  useEffect(() => { if (!data || !section) return; const saved = data.layouts.find((item) => item.orderSection === section && (item.garmentTypeId ?? "") === garmentTypeId); const parent = garmentTypeId ? data.layouts.find((item) => item.orderSection === section && !item.garmentTypeId) : undefined; const source = saved ?? parent; setLayout(source ? { columnsPerRow: source.columnsPerRow, cells: source.cells } : null); setLayoutActive(source?.isActive ?? true); setInherited(!saved && !!parent); setError(""); setMessage(""); }, [data, section, garmentTypeId]);
  const editable = canManage && !inherited;
  function begin(base?: ProductionPrintLayoutDefinition) { setLayout(base ?? { columnsPerRow: DEFAULT_PRODUCTION_PRINT_COLUMNS, cells: fields.filter((field) => field.code !== "__addons__" && !isProductionPrintSpacerCode(field.code) && !parseProductionPrintWorkDetailRowCode(field.code)).map((field, index) => { const workDetails = isWorkDetailsField(field.code, fields); return { id: `cell-${Date.now()}-${index}`, fieldCodes: [field.code], columnSpan: workDetails ? DEFAULT_PRODUCTION_PRINT_COLUMNS : 1, height: "normal", textSize: workDetails ? "small" : "normal", separator: "new-line", style: "normal", contentColumns: workDetails ? 3 : 1 }; }) }); setLayoutActive(true); setInherited(false); }
  function update(index: number, change: Partial<ProductionPrintLayoutCell>) { setLayout((current) => current ? { ...current, cells: current.cells.map((cell, i) => i === index ? { ...cell, ...change } : cell) } : current); }
  function move(index: number, offset: number) { setLayout((current) => { if (!current || index + offset < 0 || index + offset >= current.cells.length) return current; const cells = [...current.cells]; const [cell] = cells.splice(index, 1); cells.splice(index + offset, 0, cell); return { ...current, cells }; }); }
  async function save() { if (!layout || !section) return; setSaving(true); setError(""); const result = await saveProductionPrintLayoutAction({ orderSection: section, garmentTypeId: garmentTypeId || undefined, layout }); setSaving(false); if (!result.success) return setError(result.error); setData((current) => current ? { ...current, layouts: [...current.layouts.filter((item) => item.orderSection !== section || (item.garmentTypeId ?? "") !== garmentTypeId), { id: "saved", orderSection: section, garmentTypeId: garmentTypeId || undefined, isActive: layoutActive, updatedAt: new Date().toISOString(), ...layout }] } : current); setMessage(`Layout saved. It ${layoutActive ? "applies" : "remains inactive"} across all shops.`); }
  async function toggleActive() { if (!layout || !section) return; const next = !layoutActive; setSaving(true); setError(""); const result = await setProductionPrintLayoutActiveAction({ orderSection: section, garmentTypeId: garmentTypeId || undefined, isActive: next }); setSaving(false); if (!result.success) return setError(result.error); setLayoutActive(next); setData((current) => current ? { ...current, layouts: current.layouts.map((item) => item.orderSection === section && (item.garmentTypeId ?? "") === garmentTypeId ? { ...item, isActive: next } : item) } : current); setMessage(next ? "Layout activated for all shops." : "Layout deactivated. Printing now uses the available fallback format."); }
  async function restore() { if (!section || !window.confirm("Restore the built-in layout for this selection?")) return; setSaving(true); const result = await resetProductionPrintLayoutAction({ orderSection: section, garmentTypeId: garmentTypeId || undefined }); setSaving(false); if (!result.success) return setError(result.error); setData((current) => current ? { ...current, layouts: current.layouts.filter((item) => item.orderSection !== section || (item.garmentTypeId ?? "") !== garmentTypeId) } : current); setLayout(null); setMessage("Built-in layout restored."); }
  return <div className="mx-auto max-w-[1600px] p-3 sm:p-5"><div className="rounded-lg border border-slate-300 bg-white shadow-sm"><div className="flex flex-wrap items-center gap-3 px-4 py-3"><Link href="/settings" aria-label="Back to Settings" className="inline-flex h-9 w-9 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></Link><div><h1 className="text-xl font-bold text-slate-950">Production Print Layout</h1><p className="text-sm text-slate-600">Arrange print boxes and identify important measurements for each Order Details category.</p></div></div></div>{error && <p role="alert" className="mt-3 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="mt-3 border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
    <section className="mt-3 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm"><div className="flex flex-wrap items-end gap-3 border-b border-slate-300 bg-slate-50 px-4 py-3"><label className="text-sm font-semibold">Order Details<select value={section} onChange={(e) => { setSection(e.target.value as GarmentSection); setGarmentTypeId(""); }} className={`${inputClass} mt-1 block min-w-48`}><option value="">Select</option>{data?.sections.map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-semibold">Applies to<select value={garmentTypeId} onChange={(e) => setGarmentTypeId(e.target.value)} className={`${inputClass} mt-1 block min-w-56`}><option value="">All {section || "category"} garments</option>{garments.map((item) => <option key={item.id} value={item.id}>{item.name} only</option>)}</select></label>{layout && <label className="text-sm font-semibold">Columns per row<select disabled={!editable} value={layout.columnsPerRow} onChange={(e) => { const columns = Number(e.target.value) as ProductionPrintLayoutDefinition["columnsPerRow"]; setLayout({ ...layout, columnsPerRow: columns, cells: layout.cells.map((cell) => ({ ...cell, columnSpan: Math.min(cell.columnSpan, columns) })) }); }} className={`${inputClass} mt-1 block`}>{PRODUCTION_PRINT_COLUMN_OPTIONS.map((value) => <option key={value} value={value}>{value} columns</option>)}</select></label>}{layout && <div className="ml-auto flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${layoutActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{layoutActive ? "Active · All shops" : "Inactive · Fallback format"}</span>{canManage && !inherited && <button type="button" disabled={saving} onClick={() => void toggleActive()} className={`h-10 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50 ${layoutActive ? "border-red-300 bg-white text-red-700" : "border-emerald-600 bg-emerald-600 text-white"}`}>{layoutActive ? "Deactivate setup" : "Activate setup"}</button>}</div>}</div>
    {!layout ? <div className="m-4 border border-dashed border-slate-400 bg-slate-50 p-8 text-center"><p className="font-semibold">Built-in current layout is active</p>{canManage && section && <button type="button" onClick={() => begin()} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Customize layout</button>}</div> : <>{inherited && <div className="m-4 flex items-center justify-between border border-blue-200 bg-blue-50 p-3 text-sm"><span>This garment inherits the saved {section} layout.</span>{canManage && <button type="button" onClick={() => { const valid = new Set(fields.map((field) => field.code)); begin({ columnsPerRow: layout.columnsPerRow, cells: layout.cells.map((cell) => ({ ...cell, id: `${cell.id}-override`, fieldCodes: cell.fieldCodes.filter((code) => valid.has(code)) })).filter((cell) => cell.fieldCodes.length > 0) }); }} className="font-semibold text-primary">Create garment override</button>}</div>}<div className="m-4 grid gap-4 xl:grid-cols-[minmax(560px,0.95fr)_minmax(560px,1.05fr)]"><div className="space-y-2"><div className="flex items-center justify-between border-b border-slate-300 pb-2"><div><h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Configured boxes</h2><p className="text-xs text-slate-500">Boxes print from top-left in this order. For Work Details, use Full row, Small text, and 3 items per row.</p></div>{editable && <button type="button" onClick={() => setLayout({ ...layout, cells: [...layout.cells, { id: `cell-${Date.now()}`, fieldCodes: [fields[0]?.code ?? "__addons__"], columnSpan: 1, height: "normal", textSize: "normal", separator: "new-line", style: "normal", contentColumns: 1 }] })} className="inline-flex items-center gap-1 text-sm font-semibold text-primary"><Plus className="h-4 w-4" />Add box</button>}</div>{layout.cells.map((cell, index) => <div key={cell.id} className="border border-slate-300 bg-slate-50 p-3"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><label className="text-xs font-semibold">First value<select disabled={!editable} value={cell.fieldCodes[0]} onChange={(e) => { const value = e.target.value; const fieldCodes = isProductionPrintSpacerCode(value) ? [value] : [value, ...cell.fieldCodes.slice(1).filter((code) => !isProductionPrintSpacerCode(code))]; update(index, isWorkDetailsField(value, fields) ? { fieldCodes, columnSpan: layout.columnsPerRow, height: "normal", textSize: "small", contentColumns: 3 } : { fieldCodes }); }} className={`${inputClass} mt-1 w-full`}>{fields.map((field) => <option key={field.code} value={field.code}>{field.name}</option>)}</select></label><label className="text-xs font-semibold">Second value<select disabled={!editable || isProductionPrintSpacerCode(cell.fieldCodes[0])} value={cell.fieldCodes[1] ?? ""} onChange={(e) => update(index, { fieldCodes: e.target.value ? [cell.fieldCodes[0], e.target.value] : [cell.fieldCodes[0]] })} className={`${inputClass} mt-1 w-full`}><option value="">None</option>{fields.filter((field) => field.code !== cell.fieldCodes[0] && !isProductionPrintSpacerCode(field.code)).map((field) => <option key={field.code} value={field.code}>{field.name}</option>)}</select></label><label className="text-xs font-semibold">Box width<select disabled={!editable} value={cell.columnSpan} onChange={(e) => update(index, { columnSpan: Number(e.target.value) })} className={`${inputClass} mt-1 w-full`}>{Array.from({ length: layout.columnsPerRow }, (_, i) => i + 1).map((value) => <option key={value} value={value}>{value === layout.columnsPerRow ? "Full row" : `${value} column${value > 1 ? "s" : ""}`}</option>)}</select></label><div className="flex items-end gap-1"><button type="button" disabled={!editable || index === 0} onClick={() => move(index, -1)} aria-label="Move box up" className="h-10 rounded border p-2 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button><button type="button" disabled={!editable || index === layout.cells.length - 1} onClick={() => move(index, 1)} aria-label="Move box down" className="h-10 rounded border p-2 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button><button type="button" disabled={!editable} onClick={() => setLayout({ ...layout, cells: layout.cells.filter((_, i) => i !== index) })} aria-label="Remove box" className="h-10 rounded border p-2 text-red-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></div></div><div className="mt-2 flex flex-wrap gap-4"><label className="text-xs">Height <select disabled={!editable} value={cell.height} onChange={(e) => update(index, { height: e.target.value as ProductionPrintLayoutCell["height"] })} className="rounded border p-1"><option value="normal">Normal</option><option value="tall">Tall</option></select></label><label className="text-xs">Text <select disabled={!editable} value={cell.textSize} onChange={(e) => update(index, { textSize: e.target.value as ProductionPrintLayoutCell["textSize"] })} className="rounded border p-1"><option value="normal">Normal</option><option value="small">Small</option></select></label><label className="text-xs">Items per row <select disabled={!editable || isProductionPrintSpacerCode(cell.fieldCodes[0])} value={cell.contentColumns ?? 1} onChange={(e) => update(index, { contentColumns: Number(e.target.value) as ProductionPrintLayoutCell["contentColumns"] })} className="rounded border p-1"><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label><label className="text-xs">Style <select disabled={!editable || cell.fieldCodes[0] === PRODUCTION_PRINT_BLANK_SPACE_CODE} value={cell.style ?? "normal"} onChange={(e) => update(index, { style: e.target.value as ProductionPrintLayoutCell["style"] })} className="rounded border p-1"><option value="normal">Normal</option><option value="emphasis">Emphasis</option><option value="double-border">Double border</option><option value="shaded">Shaded</option><option value="dashed">Dashed</option></select></label>{cell.fieldCodes.length === 2 && <label className="text-xs">Combine <select disabled={!editable} value={cell.separator} onChange={(e) => update(index, { separator: e.target.value as ProductionPrintLayoutCell["separator"] })} className="rounded border p-1"><option value="new-line">Two lines</option><option value="slash">With slash</option></select></label>}</div></div>)}</div><ProductionTicketPreview layout={layout} fields={fields} /></div>{editable && <div className="flex justify-end gap-3 border-t border-slate-300 bg-slate-50 px-4 py-3"><button disabled={saving} onClick={() => void restore()} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-100">Reset to built-in</button><button disabled={saving || !layout.cells.length} onClick={() => void save()} className="inline-flex items-center gap-2 rounded bg-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Saving..." : "Save layout"}</button></div>}</>}
    </section></div>;
}

export default function Page() { return <RequirePermission permission="settings.view"><Content /></RequirePermission>; }
