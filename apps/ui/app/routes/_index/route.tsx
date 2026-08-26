import type { MetaFunction } from 'react-router';
import { ProjectLibrary } from '#components/project-library/project-library.js';
import { HomepageChatHero } from '#routes/_index/homepage-chat-hero.js';
import { LegacyLanding } from '#routes/_index/legacy-landing.js';
import { MarketingLanding } from '#routes/_index/marketing-landing.js';
import { useResolvedAuth } from '#hooks/use-resolved-auth.js';
import { useFeature } from '#flags/use-feature.js';
import type { Handle } from '#types/matches.types.js';
import { metaConfig } from '#constants/meta.constants.js';
import { cacheTag, cdnBackedSsrRouteHeaders } from '#lib/react-router.lib.js';

export function headers(): Record<string, string> {
  return cdnBackedSsrRouteHeaders(cacheTag.homepage, 'short');
}

const landingTitle = 'Tau — AI CAD you can trust';
const landingDescription =
  'Describe a part in plain language. Tau writes real parametric CAD, then verifies the geometry — measured, not guessed. Browser-native, open source, export anywhere.';
const landingUrl = `https://${metaConfig.appDomain}/`;
// Ponytail: reuse the existing app icon as the social card until a dedicated
// 1200×630 OG banner is designed. Real asset beats a broken reference.
const ogImageUrl = `https://${metaConfig.appDomain}/android-chrome-512x512.png`;

/**
 * Homepage meta. Rendered in `<head>` on the server regardless of the client
 * auth gate, so social cards and search snippets are stable and cacheable.
 */
export const meta: MetaFunction = () => [
  { title: landingTitle },
  { name: 'description', content: landingDescription },
  { property: 'og:type', content: 'website' },
  { property: 'og:title', content: landingTitle },
  { property: 'og:description', content: landingDescription },
  { property: 'og:url', content: landingUrl },
  { property: 'og:image', content: ogImageUrl },
  { name: 'twitter:card', content: 'summary_large_image' },
  { name: 'twitter:title', content: landingTitle },
  { name: 'twitter:description', content: landingDescription },
  { name: 'twitter:image', content: ogImageUrl },
  {
    'script:ld+json': {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: metaConfig.name,
      applicationCategory: 'DesignApplication',
      operatingSystem: 'Web',
      description: landingDescription,
      url: landingUrl,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  },
];

export const handle: Handle = {
  enableOverflowY: true,
  enablePageFooter: true,
  // App shell: off only for confirmed anonymous visitors once the marketing
  // landing is enabled. Unresolved auth defaults to the local-first workspace.
  enablePageWrapper: ({ authState, flags }) => (flags.marketingLanding ? authState !== 'anonymous' : true),
};

/**
 * Home route. Session-aware and flag-gated:
 *
 * - `marketingLanding` off → the legacy homepage (unchanged), in the app shell.
 * - flag on + confirmed signed out → marketing (own chrome, no app shell).
 * - flag on + signed in or unresolved → local projects inside the app shell.
 *
 * SSR output stays session-neutral so `/` remains CDN-cacheable. An unresolved
 * session changes presentation only; protected operations still use real auth.
 */
export default function Home(): React.JSX.Element {
  const marketingLanding = useFeature('marketingLanding');
  const resolvedAuth = useResolvedAuth();

  if (!marketingLanding) {
    return <LegacyLanding />;
  }

  if (resolvedAuth === 'anonymous') {
    return <MarketingLanding />;
  }

  return (
    <>
      <HomepageChatHero />
      <ProjectLibrary />
    </>
  );
}
