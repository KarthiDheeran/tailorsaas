import { test, expect } from "@playwright/test";
import { readdirSync } from "node:fs";
import path from "node:path";

function routes(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return routes(path.join(directory, entry.name), entry.name.startsWith("(") ? prefix : `${prefix}/${entry.name.startsWith("[") ? "00000000-0000-0000-0000-000000000001" : entry.name}`);
    return entry.name === "page.tsx" ? [prefix || "/"] : [];
  });
}

const publicRoutes = new Set(["/login", "/forgot-password", "/reset-password"]);
for (const route of routes(path.join(process.cwd(), "app")).filter((route) => !publicRoutes.has(route))) {
  test(`signed-out access redirects ${route}`, async ({ request }) => {
    const response = await request.get(route, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toContain("/login");
  });
}
