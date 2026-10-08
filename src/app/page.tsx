import { BuiltWith } from "@/components/landing/built-with";
import { ClosingCta } from "@/components/landing/closing-cta";
import { Features } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { landingPageErrorMessage, visitorKind } from "@/lib/auth/demo";
import { getCurrentUser } from "@/lib/auth/session";

export default async function Home({ searchParams }: PageProps<"/">) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const visitor = visitorKind(user);
  const pageError = landingPageErrorMessage(params.error);

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader visitor={visitor} />
      <main className="flex-1">
        <Hero visitor={visitor} pageError={pageError} />
        <BuiltWith />
        <HowItWorks />
        <Features />
        <ClosingCta visitor={visitor} />
      </main>
      <SiteFooter visitor={visitor} />
    </div>
  );
}
