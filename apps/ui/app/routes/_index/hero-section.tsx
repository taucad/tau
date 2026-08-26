import { NavLink } from 'react-router';
import { InteractiveHoverButton } from '#components/magicui/interactive-hover-button.js';
import { Loader } from '#components/ui/loader.js';
import { MarketingComposer } from '#routes/_index/marketing-composer.js';
import { HeroVisual } from '#routes/_index/hero-visual.js';

/**
 * Marketing hero: verification-led headline, the live chat composer as the
 * primary CTA, and the signature point-cloud visual. Per OQ1 the homepage never
 * names "GeoSpec" — verification reads as a plain outcome ("measured, not
 * guessed").
 */
export function HeroSection(): React.JSX.Element {
  return (
    <section className='relative overflow-hidden border-b'>
      <div className='container mx-auto grid gap-10 px-4 py-16 md:py-24 lg:grid-cols-2 lg:items-center'>
        <div className='space-y-8'>
          <div className='space-y-4'>
            <div className='inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground'>
              <span className='size-1.5 rounded-full bg-primary' />
              AI-native CAD, in your browser
            </div>
            <h1 className='max-w-[18ch] text-4xl font-semibold tracking-tight text-balance md:text-6xl'>
              AI CAD you can trust.
            </h1>
            <p className='max-w-[52ch] text-lg text-muted-foreground'>
              Describe a part in plain language. Tau writes real parametric CAD, then verifies the geometry — measured,
              not guessed. Export anywhere, own everything.
            </p>
          </div>

          {/* Primary CTA: describe a part, land in a live project. */}
          <div id='start-building' className='scroll-mt-20 space-y-4'>
            <MarketingComposer />
            <div className='flex items-center gap-3 text-sm text-muted-foreground'>
              <span>or</span>
              <NavLink to='/projects/new' tabIndex={-1}>
                {({ isPending }) => (
                  <InteractiveHoverButton className='flex items-center gap-2 font-light [&_svg]:size-4 [&_svg]:stroke-1'>
                    {isPending ? <Loader /> : 'Build from code'}
                  </InteractiveHoverButton>
                )}
              </NavLink>
            </div>
          </div>
        </div>

        <HeroVisual className='aspect-square w-full lg:aspect-auto lg:h-[520px]' />
      </div>
    </section>
  );
}
