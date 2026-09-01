import { Link } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { CommunityProjectGrid } from '#components/project-grid.js';
import { sampleProjects } from '#constants/project-examples.js';
import { LazySection } from '#components/ui/lazy-section.js';
import { LazyHeroViewer } from '#routes/_index/hero-viewer-gate.js';
import { HeroImage } from '#routes/_index/hero-image.js';
import { KernelsSection } from '#routes/_index/kernels-section.js';
import { IntegrationSection } from '#routes/_index/integration-section.js';
import { ComingSoonSection } from '#routes/_index/coming-soon-section.js';
import { CtaSection } from '#routes/_index/cta-section.js';
import {
  CommunityGridSkeleton,
  HeroImageSkeleton,
  KernelsSkeleton,
  IntegrationSkeleton,
  ComingSoonSkeleton,
  CtaSkeleton,
} from '#routes/_index/section-skeletons.js';
import { HomepageChatHero } from '#routes/_index/homepage-chat-hero.js';

/**
 * The original technical homepage. Retained behind the `marketingLanding`
 * feature flag while the marketing revamp is dark-shipped; deleted at the
 * launch flip (see docs/research/landing-page-marketing-revamp.md).
 */
export function LegacyLanding(): React.JSX.Element {
  return (
    <>
      <HomepageChatHero />

      {/* Community Projects */}
      <LazySection minHeight='400px' fallback={<CommunityGridSkeleton />}>
        <div className='container mx-auto px-4 py-8'>
          <div className='mb-2 flex flex-row items-center justify-between'>
            <h1 className='text-lg font-medium tracking-tight'>From the Community</h1>
            <Button asChild variant='link' size='lg' className='p-0'>
              <Link to='/community'>View All</Link>
            </Button>
          </div>
          <CommunityProjectGrid projects={sampleProjects} limit={10} />
        </div>
      </LazySection>

      {/* Hero Image with Features */}
      <LazySection minHeight='600px' fallback={<HeroImageSkeleton />}>
        <HeroImage />
      </LazySection>

      {/* Kernels Section */}
      <LazySection minHeight='400px' fallback={<KernelsSkeleton />}>
        <KernelsSection />
      </LazySection>

      {/* Interactive Demo */}
      <div className='container mx-auto px-4 py-16'>
        <LazyHeroViewer />
      </div>

      {/* Integration Section */}
      <LazySection minHeight='300px' fallback={<IntegrationSkeleton />}>
        <IntegrationSection />
      </LazySection>

      {/* Coming Soon Section */}
      <LazySection minHeight='200px' fallback={<ComingSoonSkeleton />}>
        <ComingSoonSection />
      </LazySection>

      {/* Final CTA Section */}
      <LazySection minHeight='200px' fallback={<CtaSkeleton />}>
        <CtaSection />
      </LazySection>
    </>
  );
}
