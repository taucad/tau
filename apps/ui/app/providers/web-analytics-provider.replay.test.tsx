import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Session = { isPending: boolean; data?: unknown };
type Preferences = { preferences?: { allowsAiTraining: boolean }; isLoading: boolean; error: unknown };
type State = {
  constrained: boolean;
  replay: boolean[];
  content: Array<boolean | undefined>;
  session: Session;
  privacy: Preferences;
  privacyEnabled: boolean[];
};

const signedIn: Session = { isPending: false, data: { user: { id: 'user-1' } } };
const switchOn: Preferences = { preferences: { allowsAiTraining: true }, isLoading: false, error: null };

const state = vi.hoisted(
  (): State => ({
    constrained: false,
    replay: [],
    content: [],
    session: { isPending: false, data: { user: { id: 'user-1' } } },
    privacy: { preferences: { allowsAiTraining: true }, isLoading: false, error: null },
    privacyEnabled: [],
  }),
);

vi.mock('#hooks/use-privacy-choices.js', () => ({ useCookieConsent: () => 'accepted' }));
vi.mock('#lib/web-posthog.lib.js', () => ({ webPosthogOptions: () => ({}) }));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('@better-auth-ui/react', () => ({ useSession: () => state.session }));
vi.mock('#hooks/use-privacy-preferences.js', () => ({
  usePrivacyPreferences: ({ enabled }: { enabled: boolean }) => {
    state.privacyEnabled.push(enabled);
    return state.privacy;
  },
}));
vi.mock('@taucad/ui-core/lib/device-memory-class', () => ({ isMemoryConstrainedDevice: () => state.constrained }));
vi.mock('#providers/posthog-analytics-provider.js', () => ({
  PostHogAnalyticsProvider: ({
    children,
    isReplayEnabled,
    isReplayContentAllowed,
  }: {
    readonly children: ReactNode;
    readonly isReplayEnabled: boolean;
    readonly isReplayContentAllowed: boolean | undefined;
  }): React.JSX.Element => {
    state.replay.push(isReplayEnabled);
    state.content.push(isReplayContentAllowed);
    return <div>{children}</div>;
  },
}));

const { WebAnalyticsProvider } = await import('#providers/web-analytics-provider.js');
const { useMarkReplayForeignContent } = await import('#lib/replay-content.lib.js');

const ForeignProject = (): undefined => {
  useMarkReplayForeignContent(true);
  return undefined;
};

beforeEach(() => {
  state.constrained = false;
  state.replay = [];
  state.content = [];
  state.privacyEnabled = [];
  state.session = signedIn;
  state.privacy = switchOn;
});

describe('WebAnalyticsProvider session replay (B-19, D-UI-05)', () => {
  it('does not start session replay on a phone or low-memory device, nor read the preference there', () => {
    state.constrained = true;

    render(<WebAnalyticsProvider>page</WebAnalyticsProvider>);

    expect(state.replay.at(-1)).toBe(false);
    expect(state.privacyEnabled).not.toContain(true);
  });

  it('keeps session replay on desktop-class browsers', () => {
    render(<WebAnalyticsProvider>page</WebAnalyticsProvider>);

    expect(state.replay.at(-1)).toBe(true);
  });
});

describe('WebAnalyticsProvider replay content follows Improve Tau for everyone (2026-11-26)', () => {
  it.each<[string, Partial<Pick<State, 'session' | 'privacy'>>, boolean | undefined]>([
    ['allows it while the switch is on', {}, true],
    [
      'blocks it while the switch is off',
      { privacy: { preferences: { allowsAiTraining: false }, isLoading: false, error: null } },
      false,
    ],
    [
      'blocks it when the preference failed to load',
      { privacy: { isLoading: false, error: new Error('offline') } },
      false,
    ],
    ['blocks it for a signed-out visitor', { session: { isPending: false, data: null } }, false],
    ['waits while the preference loads', { privacy: { isLoading: true, error: null } }, undefined],
    ['waits while the session loads', { session: { isPending: true } }, undefined],
  ])('%s', (_name, arrange, expected) => {
    Object.assign(state, arrange);

    render(<WebAnalyticsProvider>page</WebAnalyticsProvider>);

    expect(state.content.at(-1)).toBe(expected);
  });

  it('blocks another account’s project whatever the viewer’s switch says, and allows it again on leaving', () => {
    const view = render(
      <WebAnalyticsProvider>
        <ForeignProject />
      </WebAnalyticsProvider>,
    );
    expect(state.content.at(-1)).toBe(false);

    act(() => {
      view.rerender(<WebAnalyticsProvider>page</WebAnalyticsProvider>);
    });
    expect(state.content.at(-1)).toBe(true);
  });
});
