// @vitest-environment jsdom
/**
 * Replay records the chat transcript and code only while the host allows it (the account's "Improve Tau for
 * everyone" value, 2026-11-26 ruling). Otherwise the recorder blocks them. rrweb reads its block selector only when
 * it starts, so a change mid-session restarts the recording, whose new full snapshot follows the new selector.
 */
import { act, render, waitFor } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { PostHog, PostHogConfig } from 'posthog-js';

const baseSelector = 'a[href*="/invitations/"]';
const recording: { current: PostHogConfig['session_recording'] } = { current: { blockSelector: baseSelector } };
const posthog = mock<PostHog>({ __loaded: true });
Object.defineProperty(posthog, 'config', {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- `session_recording` is the SDK's config key.
  get: () => ({ session_recording: recording.current }),
});

vi.mock('posthog-js', () => ({ posthog }));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('@better-auth-ui/react', () => ({
  useSession: () => ({ isPending: true }),
}));
vi.mock('#lib/posthog.lib.js', () => ({
  posthogConfig: { apiKey: 'test' },
  clearPostHogStorage: vi.fn(),
}));

const { PostHogAnalyticsProvider } = await import('#providers/posthog-analytics-provider.js');
const { replayContentSelector } = await import('#lib/replay-content.lib.js');

const options = {};
const blocked = `${baseSelector}, ${replayContentSelector}`;

/** An admitted, replay-enabled host whose content decision is `allowed`, and a way to change it. */
const mount = (allowed: boolean | undefined): ((next: boolean | undefined) => void) => {
  let value = allowed;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const Host = (): React.JSX.Element => {
    const current = useSyncExternalStore(subscribe, () => value);
    return (
      <PostHogAnalyticsProvider isActive options={options} isReplayEnabled isReplayContentAllowed={current}>
        {null}
      </PostHogAnalyticsProvider>
    );
  };
  const router = createMemoryRouter([{ path: '*', element: <Host /> }], {
    initialEntries: ['/projects'],
  });
  render(<RouterProvider router={router} />);
  return (next) => {
    value = next;
    act(() => {
      for (const listener of listeners) {
        listener();
      }
    });
  };
};

describe('session replay content blocking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recording.current = { blockSelector: baseSelector };
    vi.mocked(posthog.has_opted_out_capturing).mockReturnValue(false);
    vi.mocked(posthog.sessionRecordingStarted).mockReturnValue(false);
    vi.mocked(posthog.set_config).mockImplementation((config) => {
      if (config.session_recording !== undefined) {
        recording.current = config.session_recording;
      }
    });
  });

  it('records the chat and code in full while content is allowed', async () => {
    mount(true);
    await waitFor(() => {
      expect(posthog.startSessionRecording).toHaveBeenCalledOnce();
    });
    expect(recording.current.blockSelector).toBe(baseSelector);
  });

  it('blocks the chat and code, keeping what replay always blocks, while content is not allowed', async () => {
    mount(false);
    await waitFor(() => {
      expect(posthog.startSessionRecording).toHaveBeenCalledOnce();
    });
    expect(recording.current.blockSelector).toBe(blocked);
  });

  it('does not start while the decision is unknown', async () => {
    mount(undefined);
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });
    expect(posthog.startSessionRecording).not.toHaveBeenCalled();
  });

  it('restarts the recording when the switch turns off mid-session, and again when it turns back on', async () => {
    const decide = mount(true);
    await waitFor(() => {
      expect(posthog.startSessionRecording).toHaveBeenCalledOnce();
    });
    vi.mocked(posthog.sessionRecordingStarted).mockReturnValue(true);

    decide(false);
    expect(posthog.stopSessionRecording).toHaveBeenCalledOnce();
    expect(recording.current.blockSelector).toBe(blocked);
    await waitFor(() => {
      expect(posthog.startSessionRecording).toHaveBeenCalledTimes(2);
    });

    decide(true);
    expect(posthog.stopSessionRecording).toHaveBeenCalledTimes(2);
    expect(recording.current.blockSelector).toBe(baseSelector);
    await waitFor(() => {
      expect(posthog.startSessionRecording).toHaveBeenCalledTimes(3);
    });
  });
});
