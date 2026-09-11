import { run } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const output = path.resolve("test-results/full-review");
mkdirSync(output, { recursive: true });
for (const config of ["tsconfig.garment-runtime-tests.json", "tsconfig.request-tests.json"]) {
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", config], { stdio: "inherit", windowsHide: true });
}
const files = [
  ".runtime-test-dist/tests/garment-form-runtime.test.js",
  ".request-test-dist/tests/request-activity.test.js",
  "tests/order-deletion.test.mjs",
  "tests/database-workflows.test.mjs",
  "tests/business-rules.test.mjs",
  "tests/report-audit.test.mjs",
];
const results = [];
for await (const event of run({ files, concurrency: 1 })) {
  if (event.type !== "test:pass" && event.type !== "test:fail") continue;
  const data = event.data;
  const error = data.details?.error;
  const row = {
    name: data.name,
    file: data.file ? path.relative(process.cwd(), data.file).replaceAll("\\", "/") : "",
    status: event.type === "test:pass" ? "passed" : "failed",
    durationMs: Math.round(data.details?.duration_ms ?? 0),
    error: error?.cause?.message ?? error?.message ?? "",
  };
  results.push(row);
  console.log(`${row.status.toUpperCase()} ${row.name}${row.error ? ` — ${row.error}` : ""}`);
}
const counts = { passed: results.filter((row) => row.status === "passed").length, failed: results.filter((row) => row.status === "failed").length };
const report = { createdAt: new Date().toISOString(), scope: "Local runtime, synthetic report boundaries, and full-schema disposable PostgreSQL. Authenticated browser workflows and live data are not covered.", counts, results };
writeFileSync(path.join(output, "results.json"), JSON.stringify(report, null, 2));
const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const rows = results.map((row) => `<tr><td class="${row.status}">${row.status}</td><td>${escape(row.name)}<small>${escape(row.file)}</small>${row.error ? `<p>${escape(row.error)}</p>` : ""}</td><td>${row.durationMs}</td></tr>`).join("");
writeFileSync(path.join(output, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TailorSaaS test review</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:0 20px;color:#172b37;background:#f7fafc}h1{font-size:30px}table{width:100%;border-collapse:collapse;background:white}td,th{padding:12px;text-align:left;border-bottom:1px solid #dce3e8;vertical-align:top}small{display:block;color:#5a6b79;margin-top:5px}.passed{color:#176747}.failed{color:#b32222;font-weight:700}p{line-height:1.6}td p{font-size:13px;margin:5px 0}.summary{padding:20px;border:1px solid #dce3e8;border-radius:10px;background:white}</style><h1>TailorSaaS test review</h1><p>${escape(report.createdAt)}</p><div class="summary"><strong>${counts.passed} passed · ${counts.failed} failed</strong><p>${escape(report.scope)}</p><p>Failed checks remain visible. This report is not a release sign-off. See docs/full-testing-report.md for defect severity, reproduction steps, and outstanding staging access.</p></div><h2>Case results</h2><table><thead><tr><th>Result</th><th>Case and evidence</th><th>Time (ms)</th></tr></thead><tbody>${rows}</tbody></table></html>`);
console.log(JSON.stringify({ ...counts, report: path.join(output, "index.html") }));
process.exitCode = counts.failed ? 1 : 0;
