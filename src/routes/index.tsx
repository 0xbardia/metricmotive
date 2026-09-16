import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/chrome";
import { DefineSection } from "@/components/landing/define";
import { EvidenceStorySection } from "@/components/landing/evidence-story";
import { FinalCtaSection } from "@/components/landing/final-cta";
import { GenLayerProofSection } from "@/components/landing/genlayer-proof";
import { LandingHero } from "@/components/landing/hero";
import { LoopholeScanSection } from "@/components/landing/loophole-scan";
import { MotiveLockSection } from "@/components/landing/motive-lock";
import { ReceiptSection } from "@/components/landing/receipt";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <div className="bg-bone text-carbon">
      <SiteHeader invert />
      <main>
        <LandingHero />
        <DefineSection />
        <MotiveLockSection />
        <LoopholeScanSection />
        <EvidenceStorySection />
        <GenLayerProofSection />
        <ReceiptSection />
        <FinalCtaSection />
      </main>
      <SiteFooter />
    </div>
  );
}
