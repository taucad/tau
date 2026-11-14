// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { PostHog } from 'posthog-js';
import { disconnectRemoteFlags, readRemoteFlagStatus } from '#flags/remote-flags.js';
import { PostHogAnalyticsProvider } from '#providers/posthog-analytics-provider.js';

const sdk = vi.hoisted(() => ({ loadsOnInit: false, current: undefined as unknown }));
/* One client for the file: the provider keeps the first SDK module it loads. */
const client = mock<PostHog>({ __loaded: false });
client.init.mockImplementation(() => {
  (client as { __loaded: boolean }).__loaded = sdk.loadsOnInit;
  return client;
});
client.onFeatureFlags.mockReturnValue(() => undefined);
client.has_opted_out_capturing.mockReturnValue(false);
sdk.current = client;
vi.mock('posthog-js', () => ({
  get posthog() {
    return sdk.current;
  },
}));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('@better-auth-ui/react', () => ({ useSession: () => ({ isPending: true }) }));
vi.mock('#lib/posthog.lib.js', () => ({
  posthogConfig: { apiKey: 'test' },
  clearPostHogStorage: vi.fn(),
}));

const options = {};

afterEach(() => {
  disconnectRemoteFlags();
});

/*
 * H2: an admitted SDK that does not initialise (posthog-js leaves `__loaded` false, as `init('')` does) never calls
 * `onFeatureFlags` back, so following it would leave the flag status pending for the life of the page.
 */
describe('flag status on admission', () => {
  it.each([
    ['absent when the SDK did not initialise', false, 'absent'],
    ['pending until PostHog answers when it did', true, 'pending'],
  ] as const)('is %s', async (_label, loadsOnInit, expected) => {
    sdk.loadsOnInit = loadsOnInit;
    (client as { __loaded: boolean }).__loaded = false;
    client.onFeatureFlags.mockClear();
    const view = render(
      <PostHogAnalyticsProvider isActive options={options} isReplayEnabled={false}>
        <span />
      </PostHogAnalyticsProvider>,
    );
    await waitFor(() => {
      expect(client.init).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(readRemoteFlagStatus()).toBe(expected);
    });
    expect(client.onFeatureFlags).toHaveBeenCalledTimes(loadsOnInit ? 1 : 0);
    view.unmount();
  });
});
