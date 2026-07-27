import fs from "node:fs";
import path from "node:path";

const baseUrl = process.env.BASE_URL;
const cookie = process.env.BENCHMARK_COOKIE;
if (!baseUrl) throw new Error("BASE_URL is required.");

const routes = ["/dashboard", "/orders", "/orders/new", "/customers", "/job-cards", "/job-cards/tally", "/delivery", "/payments", "/reports", "/inventory"];
const runs = 5;
const outputDir = path.resolve("performance-reports");
fs.mkdirSync(outputDir, { recursive: true });
const results = [];

for (const route of routes) {
  for (let run = 1; run <= runs; run += 1) {
    const started = performance.now();
    let response;
    let error = null;
    try {
      response = await fetch(new URL(route, baseUrl), { redirect: "manual", headers: cookie ? { cookie } : {} });
    } catch (cause) {
      error = cause instanceof Error ? cause.name : "FetchError";
    }
    results.push({
      route, run, coldOrWarm: run === 1 ? "cold" : "warm", status: response?.status ?? 0,
      redirect: response?.headers.get("location") ?? "", totalMs: Number((performance.now() - started).toFixed(1)),
      serverTiming: response?.headers.get("server-timing") ?? "", responseBytes: Number(response?.headers.get("content-length") ?? 0),
      error, authenticatedCookieSupplied: Boolean(cookie),
    });
  }
}

fs.writeFileSync(path.join(outputDir, "route-runtime-benchmark.json"), JSON.stringify(results, null, 2));
const columns = Object.keys(results[0] ?? {});
fs.writeFileSync(path.join(outputDir, "route-runtime-benchmark.csv"), [columns.join(","), ...results.map((row) => columns.map((key) => JSON.stringify(row[key] ?? "")).join(","))].join("\n"));
console.log(`Wrote ${results.length} route samples. Authentication cookie supplied: ${Boolean(cookie)}.`);
