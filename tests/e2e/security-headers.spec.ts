import { expect, test } from "@playwright/test";

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
