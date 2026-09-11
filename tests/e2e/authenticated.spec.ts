import { test, expect, type BrowserContext } from "@playwright/test";

const paths = [
  "/dashboard", "/accounts", "/calendar", "/orders", "/orders/new", "/customers", "/customers/new",
  "/job-cards", "/job-cards/tally", "/job-cards/work-assignment", "/job-cards/production-print",
  "/delivery", "/payments", "/inventory", "/staff", "/staff/new", "/staff/quick-advance",
  "/reports", "/catalog", "/communications", "/settings", "/settings/shops",
  "/settings/billing", "/settings/order-preferences", "/settings/communication-templates", "/users-access",
];
const shop = process.env.E2E_SHOP;
const email = shop ? process.env[`E2E_${shop.toUpperCase()}_EMAIL`] : process.env.E2E_EMAIL;
const password = shop ? process.env[`E2E_${shop.toUpperCase()}_PASSWORD`] : process.env.E2E_PASSWORD;

test.describe("authenticated read-only route review", () => {
  test.skip(!email || !password, "Test account has not been supplied; this is not a passed workflow check.");
  let context: BrowserContext;

  test.beforeAll(async ({ browser, baseURL }) => {
    context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(email!);
    await page.getByLabel("Password", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 30000 });
    if (new URL(page.url()).pathname === "/change-password") {
      throw new Error("The test account requires a password change. Finish account setup before testing.");
    }
    await page.close();
  });
  test.afterAll(async () => { await context?.close(); });

  for (const route of paths) {
    test(`authenticated page ${route}`, async ({}, testInfo) => {
      const page = await context.newPage();
      const errors: string[] = [];
      const failedRequests: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        if (response.status() >= 500) failedRequests.push(`${response.status()} ${new URL(response.url()).pathname}`);
      });
      const started = Date.now();
      try {
        await page.goto(route);
        if (route === "/accounts") await expect(page).toHaveURL(/\/payments(?:\?|$)/);
        if (route === "/calendar") await expect(page).toHaveURL(/\/orders(?:\?|$)/);
        await expect(page).not.toHaveURL(/\/(login|change-password)(?:\?|$)/);
        await expect(page.locator("main")).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId("request-loading-mask")).toBeHidden({ timeout: 45000 });
        await expect(page.getByText(/Loading (workspace|dashboard|orders|customers|catalog|report|staff|inventory|delivery|payments)/).first()).toBeHidden({ timeout: 45000 });
        const text = await page.locator("main").innerText();
        const accessDenied = /access denied|don't have permission|do not have permission/i.test(text);
        await testInfo.attach("route-result", {
          body: JSON.stringify({ route, elapsedMs: Date.now() - started, accessDenied, errors, failedRequests }, null, 2),
          contentType: "application/json",
        });
        expect(errors).toEqual([]);
        expect(failedRequests).toEqual([]);
        if (accessDenied) test.skip(true, "This test account cannot access this route; another role is required.");
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text).not.toMatch(/Failed to load|Application error|Internal Server Error/i);
        expect(errors).toEqual([]);
        expect(failedRequests).toEqual([]);
      } finally {
        await testInfo.attach("navigation-diagnostics", {
          body: JSON.stringify({ route, finalPath: new URL(page.url()).pathname, errors, failedRequests }),
          contentType: "application/json",
        });
        if (errors.length) console.log(JSON.stringify({ route, errors }));
        await page.close();
      }
    });
  }
});
