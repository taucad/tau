import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ constrained: false, replay: [] as boolean[] }));

vi.mock('#hooks/use-cookie-consent.js', () => ({ useCookieConsent: () => 'accepted' }));
vi.mock('#lib/web-posthog.lib.js', () => ({ webPosthogOptions: () => ({}) }));
vi.mock('#lib/device-memory-class.js', () => ({ isMemoryConstrainedDevice: () => state.constrained }));
vi.mock('#providers/posthog-analytics-provider.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- mocks the component's exported name.
  PostHogAnalyticsProvider: ({
    children,
    isReplayEnabled,
  }: {
    readonly children: ReactNode;
    readonly isReplayEnabled: boolean;
  }): React.JSX.Element => {
    state.replay.push(isReplayEnabled);
    return <div>{children}</div>;
  },
}));

const { WebAnalyticsProvider } = await import('#providers/web-analytics-provider.js');

describe('WebAnalyticsProvider session replay (B-19, D-UI-05)', () => {
  it('does not start session replay on a phone or low-memory device', () => {
    state.constrained = true;
    state.replay = [];

    render(<WebAnalyticsProvider>page</WebAnalyticsProvider>);

    expect(state.replay.at(-1)).toBe(false);
  });

  it('keeps session replay on desktop-class browsers', () => {
    state.constrained = false;
    state.replay = [];

    render(<WebAnalyticsProvider>page</WebAnalyticsProvider>);

    expect(state.replay.at(-1)).toBe(true);
  });
});
