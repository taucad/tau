// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- registers DOM matchers for this test module
import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeferredSettingsContent } from '#components/settings/deferred-settings-content.js';

const pending = vi.hoisted(() => {
  let resolveModule: (value: { SettingsContent: () => React.JSX.Element }) => void = () => undefined;
  let rejectModule: (error: Error) => void = () => undefined;
  const promise = new Promise<{ SettingsContent: () => React.JSX.Element }>((resolve, reject) => {
    resolveModule = resolve;
    rejectModule = reject;
  });
  return { promise, resolve: resolveModule, reject: rejectModule };
});
vi.mock('#components/settings/settings-content.js', async () => pending.promise);

describe('deferred settings controls', () => {
  it('should expose loading, then offer Reload and never an in-place retry when the module fails', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...globalThis.location, reload });
    render(<DeferredSettingsContent section='general' />);
    expect(screen.getByRole('status', { name: 'Loading settings' })).toHaveAttribute('aria-busy', 'true');
    await act(async () => {
      pending.reject(new TypeError('Failed to fetch dynamically imported module'));
    });
    expect(await screen.findByRole('alert', { name: 'Settings unavailable' })).toBeInTheDocument();
    // The page keeps the failed module: asking again would fail the same way (PL7 staging defects FP9).
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
