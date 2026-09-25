import { type Page, expect, test } from "@playwright/test";

import { ALICE_STORAGE_STATE } from "./support/auth";

// Public and auth pages plus a static asset: the headers apply to every route.
for (const path of ["/", "/login", "/favicon.ico"]) {
  test(`${path} sends the security headers`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);

    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
  });
}

// Rendered pages get a nonce-based script-src from the proxy (ADR 0012).
const NONCE_SCRIPT_SRC = /script-src 'self' 'nonce-([A-Za-z0-9+/=]+)' 'strict-dynamic'/;

for (const path of ["/", "/login"]) {
  test(`${path} allows only scripts with a fresh nonce`, async ({ request }) => {
    const nonces: string[] = [];
    for (let i = 0; i < 2; i++) {
      const response = await request.get(path);
      const csp = response.headers()["content-security-policy"] ?? "";
      const nonce = csp.match(NONCE_SCRIPT_SRC)?.[1];
      expect(nonce).toBeDefined();
      // Every <script> Next.js renders carries this request's nonce.
      const html = await response.text();
      const scripts = html.match(/<script\b[^>]*>/g) ?? [];
      expect(scripts.length).toBeGreaterThan(0);
      for (const script of scripts) expect(script).toContain(`nonce="${nonce}"`);
      nonces.push(nonce!);
    }
    expect(nonces[0]).not.toBe(nonces[1]);
  });
}

/** Records CSP violations from the first script onwards. */
async function recordViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { __cspViolations: violations });
    document.addEventListener("securitypolicyviolation", (event) => {
      violations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return () =>
    page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
}

for (const path of ["/", "/login"]) {
  test(`${path} runs under the strict policy without violations`, async ({ page }) => {
    const violations = await recordViolations(page);
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await violations()).toEqual([]);
  });
}

test.describe("with a session", () => {
  test.use({ storageState: ALICE_STORAGE_STATE });

  test("the board runs under the strict policy without violations", async ({ page }) => {
    const violations = await recordViolations(page);

    await page.goto("/boards");
    // Client-side navigation and interaction work: hydration ran with nonced scripts.
    await page.getByRole("link", { name: "Demo board" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Demo board" })).toBeVisible();
    await page.getByRole("button", { name: "Board actions" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    expect(await violations()).toEqual([]);

    // Injected markup cannot run inline handlers (the XSS vector the policy targets).
    const ran = await page.evaluate(async () => {
      const w = window as unknown as { __injected?: boolean };
      const div = document.createElement("div");
      div.innerHTML = '<img src="/missing.png" onerror="window.__injected = true">';
      document.body.append(div);
      await new Promise((resolve) => setTimeout(resolve, 500));
      div.remove();
      return w.__injected === true;
    });
    expect(ran).toBe(false);
    expect(await violations()).toContainEqual(expect.stringMatching(/^script-src-attr/));
  });
});
