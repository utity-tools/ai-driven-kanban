import Link from "next/link";

import { BrandMark } from "@/components/brand/brand-mark";
import { SITE_NAME } from "@/lib/brand/site";

type AuthHeadingProps = {
  title: string;
  /** Shown as a muted second line under the title. */
  description: string;
};

/** Top of every auth page: the mark (back to the home page), the title and a muted subtitle. */
export function AuthHeading({ title, description }: AuthHeadingProps) {
  return (
    <div className="grid justify-items-center gap-6 text-center">
      <Link
        href="/"
        aria-label={`${SITE_NAME} home`}
        className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <BrandMark size={40} />
      </Link>
      <div className="grid gap-1">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-balance">{title}</h1>
        {/* break-words: the reset page's subtitle can hold a long email address. */}
        <p className="font-heading text-xl font-medium text-pretty break-words text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
