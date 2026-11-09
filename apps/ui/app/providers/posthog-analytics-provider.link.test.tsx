// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { PostHog } from 'posthog-js';
import { PostHogAnalyticsProvider } from '#providers/posthog-analytics-provider.js';
import { applyAnalyticsLink } from '#lib/analytics-link.lib.js';
/* eslint-disable @typescript-eslint/naming-convention -- PostHog and Sentry wire names. */

const state = vi.hoisted(() => ({ sdk: undefined as unknown }));
vi.mock('posthog-js', () => ({
  get posthog() {
    return state.sdk;
  },
}));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('@better-auth-ui/react', () => ({ useSession: () => ({ isPending: true }) }));
vi.mock('#lib/posthog.lib.js', () => ({
  posthogConfig: { apiKey: 'test' },
  clearPostHogStorage: vi.fn(),
}));

const options = {};
const tree = (isActive: boolean): React.JSX.Element => (
  <PostHogAnalyticsProvider isActive={isActive} options={options} isReplayEnabled={false}>
    <span />
  </PostHogAnalyticsProvider>
);

describe('PostHog grant and Sentry link (SB7)', () => {
  it('records a grant made in this document, links Sentry events while capturing, and unlinks on withdrawal', async () => {
    let loaded = false;
    let optedOut = false;
    const sdk = mock<PostHog>();
    Object.assign(sdk, {
      config: { token: 'phc_test' },
      requestRouter: { endpointFor: () => 'https://us.posthog.com' },
    });
    Object.defineProperty(sdk, '__loaded', { get: () => loaded });
    sdk.init.mockImplementation(() => {
      loaded = true;
      return sdk;
    });
    sdk.has_opted_out_capturing.mockImplementation(() => optedOut);
    sdk.opt_out_capturing.mockImplementation(() => {
      optedOut = true;
    });
    sdk.get_distinct_id.mockReturnValue('user 1');
    sdk.sessionRecordingStarted.mockReturnValue(true);
    sdk.get_session_replay_url.mockReturnValue('https://us.posthog.com/replay/s1?t=10');
    state.sdk = sdk;

    const view = render(tree(false));
    expect(applyAnalyticsLink({ tags: {} })).toEqual({ tags: {} });

    view.rerender(tree(true));
    await waitFor(() => {
      expect(sdk.capture).toHaveBeenCalledWith('$opt_in');
    });
    expect(applyAnalyticsLink({ tags: { a: 'b' } })).toEqual({
      tags: {
        a: 'b',
        'posthog.person_url': 'https://us.posthog.com/project/phc_test/person/user%201',
        'posthog.replay_url': 'https://us.posthog.com/replay/s1?t=10',
      },
      contexts: {
        posthog: {
          person_url: 'https://us.posthog.com/project/phc_test/person/user%201',
          replay_url: 'https://us.posthog.com/replay/s1?t=10',
        },
      },
    });

    view.rerender(tree(false));
    expect(applyAnalyticsLink({ tags: {} })).toEqual({ tags: {} });

    view.rerender(tree(true));
    await waitFor(() => {
      expect(sdk.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: '$opt_in' });
    });
    view.unmount();
    expect(applyAnalyticsLink({ tags: {} })).toEqual({ tags: {} });
  });

  it('does not record a grant for a visitor who arrives already admitted', async () => {
    const sdk = mock<PostHog>({ __loaded: false });
    sdk.has_opted_out_capturing.mockReturnValue(false);
    state.sdk = sdk;
    vi.resetModules();
    const { PostHogAnalyticsProvider: Fresh } = await import('#providers/posthog-analytics-provider.js');

    const view = render(
      <Fresh isActive options={options} isReplayEnabled={false}>
        <span />
      </Fresh>,
    );
    await waitFor(() => {
      expect(sdk.init).toHaveBeenCalledOnce();
    });
    expect(sdk.capture).not.toHaveBeenCalled();
    expect(sdk.opt_in_capturing).not.toHaveBeenCalled();
    view.unmount();
  });
});
