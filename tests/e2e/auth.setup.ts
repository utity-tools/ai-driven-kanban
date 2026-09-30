import { expect, test as setup } from "@playwright/test";

import {
  ALICE,
  ALICE_STORAGE_STATE,
  BOB,
  BOB_STORAGE_STATE,
  CAROL,
  CAROL_STORAGE_STATE,
  DEMO_BOARD_PATH,
  signIn,
} from "./support/auth";

// A cold `next dev` compiles routes for a while; the default 30s test timeout is too tight for that.
const WARM_UP_TIMEOUT_MS = 120_000;

// Signs each seeded user in once per run so tests that only need a signed-in
// user don't each hit Supabase Auth (its sign-in endpoint is rate limited per IP).
setup("sign in as Alice", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, ALICE);
  await expect(page).toHaveURL("/boards");
  await page.context().storageState({ path: ALICE_STORAGE_STATE });

  // Warm up the signed-in routes (see "warm up the public routes").
  setup.setTimeout(WARM_UP_TIMEOUT_MS);
  await page.goto(DEMO_BOARD_PATH);
  await expect(page.getByRole("heading", { level: 1, name: "Demo board" })).toBeVisible({
    timeout: WARM_UP_TIMEOUT_MS,
  });
});

// `next dev` compiles a route the first time it is visited, and with many workers that
// first visit can outlast an assertion timeout in whichever test happens to get there
// first. Visiting each route once during setup, before any test runs, moves that cost here.
// Cheap and harmless on a production build.
setup("warm up the public routes", async ({ page }) => {
  setup.setTimeout(WARM_UP_TIMEOUT_MS);
  for (const path of ["/", "/login", "/signup", `/invite/${"A".repeat(43)}`]) {
    await page.goto(path);
  }
});

setup("sign in as Bob", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, BOB);
  await expect(page).toHaveURL("/boards");
  await page.context().storageState({ path: BOB_STORAGE_STATE });
});

setup("sign in as Carol", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, CAROL);
  await expect(page).toHaveURL("/boards");
  await page.context().storageState({ path: CAROL_STORAGE_STATE });
});
