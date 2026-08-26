import { Link } from 'react-router';
import { Button } from '#components/ui/button.js';
import { CommunityProjectGrid } from '#components/project-grid.js';
import { galleryProjects } from '#constants/project-examples.js';
import { LazySection } from '#components/ui/lazy-section.js';
import { MarketingTopNav } from '#components/marketing/top-nav.js';
import { PageFooter } from '#components/layout/page-footer.js';
import { ContinueRibbon } from '#routes/_index/continue-ribbon.js';
import { HeroSection } from '#routes/_index/hero-section.js';
import { ProofStrip } from '#routes/_index/proof-strip.js';
import { AgentLoopSection } from '#routes/_index/agent-loop-section.js';
import { LazyLiveDemo } from '#routes/_index/live-demo-gate.js';
import { KernelsBand } from '#routes/_index/kernels-band.js';
import { OwnYourWorkSection } from '#routes/_index/own-your-work-section.js';
import { BillingSection } from '#routes/_index/billing-section.js';
import { VisionSection } from '#routes/_index/vision-section.js';
import { CommunityGridSkeleton, HeroViewerSkeleton } from '#routes/_index/section-skeletons.js';

/**
 * Launch-ready marketing landing for signed-out visitors. Renders its own
 * chrome (marketing top-nav + full footer) since the home route disables the
 * app shell for anonymous viewers (see `Handle.enablePageWrapper`).
 */
export function MarketingLanding(): React.JSX.Element {
  return (
    <div className='flex min-h-dvh flex-col'>
      <MarketingTopNav />
      <ContinueRibbon />

      <main className='flex-1'>
        <HeroSection />
        <ProofStrip />
        <AgentLoopSection />

        {/* Live, in-browser demo (R6): JSCAD gear + live geometry checks, with a
            lazy OpenSCAD QR tab. Viewport-gated so the runtime never loads until
            the section scrolls into view. */}
        <section className='border-b'>
          <div className='container mx-auto px-4 py-20'>
            <LazySection minHeight='560px' fallback={<HeroViewerSkeleton />}>
              <LazyLiveDemo />
            </LazySection>
          </div>
        </section>

        <KernelsBand />
        <OwnYourWorkSection />

        {/* Community gallery */}
        <section className='border-b'>
          <div className='container mx-auto px-4 py-20'>
            <div className='mb-8 flex items-center justify-between'>
              <div>
                <h2 className='text-3xl font-semibold tracking-tight md:text-4xl'>Built with Tau</h2>
                <p className='mt-2 text-muted-foreground'>Starter projects to remix and make your own.</p>
              </div>
              <Button asChild variant='link' size='lg' className='p-0'>
                <Link to='/community'>View all</Link>
              </Button>
            </div>
            <LazySection minHeight='400px' fallback={<CommunityGridSkeleton />}>
              <CommunityProjectGrid projects={galleryProjects} limit={10} />
            </LazySection>
          </div>
        </section>

        <BillingSection />
        <VisionSection />
      </main>

      <PageFooter variant='full' />
    </div>
  );
}
