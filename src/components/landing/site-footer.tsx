import Link from "next/link";

import { BrandLockup } from "@/components/brand/brand-lockup";
import type { Visitor } from "@/lib/auth/demo";

import { FOOTER_COLUMNS } from "./content";
import { ExternalLink } from "./external-link";
import { SectionContainer } from "./section-container";

const linkClass =
  "rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

export function SiteFooter({ visitor }: { visitor: Visitor }) {
  const columns = FOOTER_COLUMNS.filter(
    ({ signedOutOnly }) => !signedOutOnly || visitor === "signed-out",
  );
  return (
    <footer className="border-t">
      <SectionContainer className="grid gap-10 py-12">
        <div className="grid gap-10 md:grid-cols-[1fr_auto] md:gap-20">
          <div className="grid content-start gap-3">
            <BrandLockup size={22} className="text-[22px]" />
            <p className="text-sm text-muted-foreground">
              The kanban where AI proposes and you decide.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-16">
            {columns.map(({ heading, links }) => (
              <nav key={heading} aria-label={heading} className="grid content-start gap-3">
                <p className="text-sm font-medium text-muted-foreground">{heading}</p>
                <ul className="grid gap-2">
                  {links.map(({ label, href, external }) => (
                    <li key={label}>
                      {external ? (
                        <ExternalLink href={href} className={linkClass}>
                          {label}
                        </ExternalLink>
                      ) : (
                        <Link href={href} className={linkClass}>
                          {label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
      </SectionContainer>
    </footer>
  );
}
