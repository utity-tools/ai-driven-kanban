import { ClosingCta } from "@/components/landing/closing-cta";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { HowItsBuilt } from "@/components/landing/how-its-built";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Problem } from "@/components/landing/problem";
import { PromoVideo } from "@/components/landing/promo-video";
import { ReviewSpotlight } from "@/components/landing/review-spotlight";
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
        <Problem />
        <HowItWorks />
        <ReviewSpotlight />
        <Features />
        <PromoVideo />
        <HowItsBuilt />
        <Faq />
        <ClosingCta visitor={visitor} />
      </main>
      <SiteFooter visitor={visitor} />
    </div>
  );
}
