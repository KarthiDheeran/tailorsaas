import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  // A client interaction ensures the provider has hydrated.
  await page.getByLabel("Email", { exact: true }).fill("loading-test@example.invalid");
});

test("slow overlapping API calls retain the mask until both finish", async ({ page }) => {
  let finishFirst!: () => void;
  let finishSecond!: () => void;
  const first = new Promise<void>((resolve) => { finishFirst = resolve; });
  const second = new Promise<void>((resolve) => { finishSecond = resolve; });
  await page.route("**/api/loading-test/*", async (route) => {
    await (route.request().url().endsWith("first") ? first : second);
    await route.fulfill({ json: { ok: true } });
  });
  await page.evaluate(() => {
    void fetch("/api/loading-test/first");
    void fetch("/api/loading-test/second");
  });
  await expect(page.getByTestId("request-loading-mask")).toBeVisible();
  // Search/form focus must remain usable under the visual mask.
  await page.getByLabel("Email", { exact: true }).fill("still-typing@example.invalid");
  finishFirst();
  await expect(page.getByTestId("request-loading-mask")).toBeVisible();
  finishSecond();
  await expect(page.getByTestId("request-loading-mask")).toBeHidden();
});

test("failed requests clear the loading mask", async ({ page }) => {
  let fail!: () => void;
  const wait = new Promise<void>((resolve) => { fail = resolve; });
  await page.route("**/api/loading-test/fail", async (route) => { await wait; await route.abort(); });
  await page.evaluate(() => { void fetch("/api/loading-test/fail").catch(() => undefined); });
  await expect(page.getByTestId("request-loading-mask")).toBeVisible();
  fail();
  await expect(page.getByTestId("request-loading-mask")).toBeHidden();
});

test("speculative navigation does not display a mask", async ({ page }) => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/loading-test-prefetch", async (route) => { await wait; await route.fulfill({ body: "prefetch" }); });
  await page.evaluate(() => { void fetch("/loading-test-prefetch", { headers: { RSC: "1", "Next-Router-Prefetch": "1" } }); });
  await page.waitForTimeout(350);
  await expect(page.getByTestId("request-loading-mask")).toBeHidden();
  release();
});

test("mobile login fits the viewport and password recovery navigation works", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password/);
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
});

test("sign-in disables duplicate submission and recovers from a rejected request", async ({ page }) => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  let requests = 0;
  await page.route("**/auth/v1/token?*", async (route) => {
    requests += 1;
    await wait;
    await route.fulfill({ status: 400, json: { code: "invalid_credentials", msg: "Invalid login credentials" } });
  });
  await page.getByLabel("Password", { exact: true }).fill("fake-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: /Signing in/ })).toBeDisabled();
  await expect(page.getByTestId("request-loading-mask")).toBeVisible();
  release();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await expect(page.getByTestId("request-loading-mask")).toBeHidden();
  expect(requests).toBe(1);
});

test("password recovery errors allow retry instead of claiming success", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.route("**/auth/v1/recover*", (route) => route.fulfill({ status: 400, json: { msg: "Request rejected" } }));
  await page.getByLabel("Email", { exact: true }).fill("test@example.invalid");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Could not send the request. Please try again.");
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeEnabled();
});

test("password validation prevents invalid update requests", async ({ page }) => {
  await page.goto("/reset-password");
  await page.getByLabel("New password", { exact: true }).fill("short");
  await page.getByLabel("Confirm new password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Password must be at least 8 characters.")).toBeVisible();
});

test("an aborted API call releases the mask", async ({ page }) => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/loading-test/abort", async (route) => {
    await wait;
    await route.fulfill({ json: { ok: true } }).catch(() => undefined);
  });
  await page.evaluate(() => {
    const controller = new AbortController();
    Reflect.set(window, "qaAbort", () => controller.abort());
    void fetch("/api/loading-test/abort", { signal: controller.signal }).catch(() => undefined);
  });
  await expect(page.getByTestId("request-loading-mask")).toBeVisible();
  await page.evaluate(() => Reflect.get(window, "qaAbort")());
  await expect(page.getByTestId("request-loading-mask")).toBeHidden();
  release();
});

test("the loading mask is excluded from printed output", async ({ page }) => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/loading-test/print", async (route) => { await wait; await route.fulfill({ json: {} }); });
  await page.evaluate(() => { void fetch("/api/loading-test/print"); });
  await expect(page.getByTestId("request-loading-mask")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("request-loading-mask")).toBeHidden();
  release();
});
