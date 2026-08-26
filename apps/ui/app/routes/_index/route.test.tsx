// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ResolvedAuth } from '#hooks/use-resolved-auth.js';
import Home, { handle, meta } from '#routes/_index/route.js';
import type { PageChromeContext } from '#types/matches.types.js';
import { featureFlagDefaults } from '#flags/flag.constants.js';

const { mockUseFeature, mockUseResolvedAuth } = vi.hoisted(() => ({
  mockUseFeature: vi.fn<() => boolean>(),
  mockUseResolvedAuth: vi.fn<() => ResolvedAuth>(),
}));

vi.mock('#flags/use-feature.js', () => ({
  useFeature: () => mockUseFeature(),
}));

vi.mock('#hooks/use-resolved-auth.js', () => ({
  useResolvedAuth: () => mockUseResolvedAuth(),
}));

vi.mock('#routes/_index/legacy-landing.js', () => ({
  LegacyLanding: () => <div data-testid='legacy-landing' />,
}));

vi.mock('#routes/_index/marketing-landing.js', () => ({
  MarketingLanding: () => <div data-testid='marketing-landing' />,
}));

vi.mock('#components/project-library/project-library.js', () => ({
  ProjectLibrary: () => <div data-testid='project-library' />,
}));

vi.mock('#routes/_index/homepage-chat-hero.js', () => ({
  HomepageChatHero: () => <div data-testid='homepage-chat-hero' />,
}));

/** Resolve the function-form `enablePageWrapper` handle for a given context. */
function resolveWrapper(context: PageChromeContext): boolean {
  const { enablePageWrapper } = handle;
  if (typeof enablePageWrapper !== 'function') {
    throw new TypeError('expected enablePageWrapper to be a function');
  }

  return enablePageWrapper(context);
}

describe('Home route gate', () => {
  beforeEach(() => {
    mockUseFeature.mockReset();
    mockUseResolvedAuth.mockReset();
    mockUseResolvedAuth.mockReturnValue('anonymous');
  });

  it.each(['authed', 'anonymous', 'indeterminate'] as const)(
    'should render the legacy landing when the marketing flag is off for %s auth',
    (authState) => {
      mockUseFeature.mockReturnValue(false);
      mockUseResolvedAuth.mockReturnValue(authState);

      render(<Home />);

      expect(screen.getByTestId('legacy-landing')).toBeInTheDocument();
      expect(screen.queryByTestId('marketing-landing')).not.toBeInTheDocument();
      expect(screen.queryByTestId('project-library')).not.toBeInTheDocument();
    },
  );

  it('should render the marketing landing when the flag is on and the viewer is anonymous', () => {
    mockUseFeature.mockReturnValue(true);
    mockUseResolvedAuth.mockReturnValue('anonymous');

    render(<Home />);

    expect(screen.getByTestId('marketing-landing')).toBeInTheDocument();
    expect(screen.queryByTestId('project-library')).not.toBeInTheDocument();
    expect(screen.queryByTestId('legacy-landing')).not.toBeInTheDocument();
  });

  it.each(['authed', 'indeterminate'] as const)(
    'should render the chat hero above the project library for %s auth',
    (authState) => {
      mockUseFeature.mockReturnValue(true);
      mockUseResolvedAuth.mockReturnValue(authState);

      render(<Home />);

      expect(screen.getByTestId('homepage-chat-hero')).toBeInTheDocument();
      expect(screen.getByTestId('project-library')).toBeInTheDocument();
      expect(screen.queryByTestId('marketing-landing')).not.toBeInTheDocument();
      expect(screen.queryByTestId('legacy-landing')).not.toBeInTheDocument();
    },
  );
});

describe('Home route chrome (enablePageWrapper)', () => {
  const flagsOn: PageChromeContext['flags'] = { ...featureFlagDefaults, marketingLanding: true };
  const flagsOff: PageChromeContext['flags'] = { ...featureFlagDefaults, marketingLanding: false };

  it('should drop the app shell for anonymous visitors when the marketing flag is on', () => {
    expect(resolveWrapper({ authState: 'anonymous', flags: flagsOn })).toBe(false);
  });

  it.each(['authed', 'indeterminate'] as const)(
    'should keep the app shell for %s auth when the marketing flag is on',
    (authState) => {
      expect(resolveWrapper({ authState, flags: flagsOn })).toBe(true);
    },
  );

  it('should keep the app shell for everyone when the marketing flag is off', () => {
    for (const authState of ['authed', 'anonymous', 'indeterminate'] as const) {
      expect(resolveWrapper({ authState, flags: flagsOff })).toBe(true);
    }
  });
});

describe('Home route meta', () => {
  // MetaFunction args are unused by the homepage meta.
  const descriptors = meta({} as Parameters<typeof meta>[0]) as Array<Record<string, unknown>>;

  const findByKey = (key: string): Record<string, unknown> | undefined =>
    descriptors.find((descriptor) => key in descriptor);

  it('should provide a title and description', () => {
    expect(findByKey('title')?.['title']).toContain('Tau');
    const description = descriptors.find((d) => d['name'] === 'description');
    expect(typeof description?.['content']).toBe('string');
  });

  it('should provide OpenGraph and Twitter card tags with an image', () => {
    expect(descriptors.some((d) => d['property'] === 'og:title')).toBe(true);
    expect(descriptors.some((d) => d['property'] === 'og:image')).toBe(true);
    expect(descriptors.some((d) => d['name'] === 'twitter:card')).toBe(true);
  });

  it('should emit valid SoftwareApplication JSON-LD', () => {
    const jsonLd = findByKey('script:ld+json')?.['script:ld+json'] as Record<string, unknown> | undefined;
    expect(jsonLd).toBeDefined();
    // Round-trip through JSON to prove it is serialisable structured data.
    const serialised = JSON.stringify(jsonLd);
    const parsed = JSON.parse(serialised) as Record<string, unknown>;
    expect(parsed['@type']).toBe('SoftwareApplication');
    expect(parsed['@context']).toBe('https://schema.org');
  });
});
