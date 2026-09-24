// Writes the local Supabase values (`pnpm db:start`) into .env.local.
// Merges instead of overwriting: other variables (e.g. VERCEL_OIDC_TOKEN written by
// `vercel link` / `vercel env pull`) are kept. Local keys are the Supabase CLI's
// development defaults, not production secrets.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const target = ".env.local";
// Ask the local Supabase of this repo, wherever the script is run from.
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

let status;
try {
  status = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json", "--workdir", projectRoot], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
} catch {
  console.error("Local Supabase is not running. Start it with `pnpm db:start`.");
  process.exit(1);
}

const env = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
};

const missing = Object.entries(env).filter(([, value]) => !value);
if (missing.length > 0) {
  console.error(`Missing values from supabase status: ${missing.map(([key]) => key).join(", ")}`);
  process.exit(1);
}

// Keep every existing line except the ones we manage.
const kept = existsSync(target)
  ? readFileSync(target, "utf8")
      .split("\n")
      .filter((line) => !Object.keys(env).some((key) => line.startsWith(`${key}=`)))
      .filter((line) => line !== "# Local Supabase (pnpm env:local)")
  : [];
while (kept.length > 0 && kept.at(-1)?.trim() === "") kept.pop();

const managed = Object.entries(env).map(([key, value]) => `${key}=${value}`);
const content = [
  ...kept,
  ...(kept.length > 0 ? [""] : []),
  "# Local Supabase (pnpm env:local)",
  ...managed,
];

writeFileSync(target, `${content.join("\n")}\n`, { mode: 0o600 });
console.log(
  `✔ ${target} updated for local Supabase at ${env.NEXT_PUBLIC_SUPABASE_URL} (other variables kept)`,
);
