import Link from "next/link";

import { BrandLockup } from "@/components/brand/brand-lockup";
import { buttonVariants } from "@/components/ui/button";
import type { Visitor } from "@/lib/auth/demo";
import { DEFAULT_AFTER_LOGIN_PATH } from "@/lib/auth/redirect";
import { LOGIN_PATH } from "@/lib/auth/routes";

import { HEADER_NAV } from "./content";
import { DemoLauncher } from "./demo-launcher";
import { ExternalLink } from "./external-link";
import { SectionContainer } from "./section-container";

const focusRing = "rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const navLink = `${focusRing} px-1 text-sm text-muted-foreground hover:text-foreground`;
const compact = "h-8 px-3 text-sm";

function HeaderActions({ visitor }: { visitor: Visitor }) {
  if (visitor === "member") {
    return (
      <Link href={DEFAULT_AFTER_LOGIN_PATH} className={buttonVariants({ className: compact })}>
        Go to your boards
      </Link>
    );
  }
  if (visitor === "demo") return <DemoLauncher hasDemoSession className={compact} />;
  return (
    <>
      <Link href={LOGIN_PATH} className={buttonVariants({ variant: "ghost", className: compact })}>
        Sign in
      </Link>
      <DemoLauncher hasDemoSession={false} className={compact} />
    </>
  );
}

export function SiteHeader({ visitor }: { visitor: Visitor }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SectionContainer className="grid h-14 grid-cols-[auto_1fr] items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
        <Link href="/" className={focusRing}>
          <BrandLockup size={22} className="text-[22px]" />
        </Link>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-6">
            {HEADER_NAV.map(({ label, href, external }) => (
              <li key={href}>
                {external ? (
                  <ExternalLink href={href} className={navLink}>
                    {label}
                  </ExternalLink>
                ) : (
                  <a href={href} className={navLink}>
                    {label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center justify-end gap-2">
          <HeaderActions visitor={visitor} />
        </div>
      </SectionContainer>
    </header>
  );
}
