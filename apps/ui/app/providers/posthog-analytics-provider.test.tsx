// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { PostHog } from 'posthog-js';
import { PostHogAnalyticsProvider } from '#providers/posthog-analytics-provider.js';

const pending = vi.hoisted(() => {
  let resolveModule: (value: { posthog: PostHog }) => void = () => undefined;
  const promise = new Promise<{ posthog: PostHog }>((resolve) => {
    resolveModule = resolve;
  });
  return { promise, resolve: resolveModule, load: vi.fn() };
});
vi.mock('posthog-js', async () => {
  pending.load();
  return pending.promise;
});
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('@better-auth-ui/react', () => ({ useSession: () => ({ isPending: true }) }));
vi.mock('#lib/posthog.lib.js', () => ({
  posthogConfig: { apiKey: 'test' },
  clearPostHogStorage: vi.fn(),
}));
const options = {};
const tree = (isActive: boolean): React.JSX.Element => (
  <PostHogAnalyticsProvider isActive={isActive} options={options} isReplayEnabled={false}>
    <input aria-label='Draft' />
  </PostHogAnalyticsProvider>
);

describe('deferred analytics', () => {
  it('keeps a draft usable without loading the SDK, and ignores a load after consent withdrawal', async () => {
    const sdk = mock<PostHog>({ __loaded: false });
    const view = render(tree(false));
    const input = screen.getByRole('textbox', { name: 'Draft' });
    await userEvent.type(input, 'keep this design');
    expect(pending.load).not.toHaveBeenCalled();
    view.rerender(tree(true));
    await waitFor(() => {
      expect(pending.load).toHaveBeenCalledOnce();
    });
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
    view.rerender(tree(false));
    await act(async () => {
      pending.resolve({ posthog: sdk });
    });
    expect(sdk.init).not.toHaveBeenCalled();
    expect(input).toHaveValue('keep this design');
    view.rerender(tree(true));
    await waitFor(() => {
      expect(sdk.init).toHaveBeenCalledWith('test', options);
    });
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
    view.unmount();
  });
});
