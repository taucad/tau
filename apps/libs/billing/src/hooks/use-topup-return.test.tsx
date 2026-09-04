// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmTopupSettlement, useTopupReturn } from '#hooks/use-topup-return.js';
import { billingQueryClient } from '#hooks/query-client.js';

const onPaymentReceived = vi.fn();

const Probe = (): React.JSX.Element => {
  useTopupReturn({ onPaymentReceived });
  return <div data-testid='probe' />;
};

const renderAt = (path: string): { router: ReturnType<typeof createMemoryRouter> } => {
  const router = createMemoryRouter([{ path: '/', element: <Probe /> }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return { router };
};

describe('useTopupReturn', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('notifies, invalidates billing, and strips the success marker', async () => {
    const invalidateSpy = vi.spyOn(billingQueryClient, 'invalidateQueries').mockResolvedValue();
    const { router } = renderAt('/?topup=success');

    await screen.findByTestId('probe');
    expect(onPaymentReceived).toHaveBeenCalledOnce();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['billing'] });
    await vi.waitFor(() => {
      expect(router.state.location.search).not.toContain('topup');
    });
    invalidateSpy.mockRestore();
  });

  it('does nothing without the marker', () => {
    const invalidateSpy = vi.spyOn(billingQueryClient, 'invalidateQueries').mockResolvedValue();
    renderAt('/');
    expect(onPaymentReceived).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    invalidateSpy.mockRestore();
  });
});

describe('confirmTopupSettlement', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('invalidates billing without owning messaging', () => {
    vi.useFakeTimers();
    const invalidateSpy = vi.spyOn(billingQueryClient, 'invalidateQueries').mockResolvedValue();
    confirmTopupSettlement();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['billing'] });
    vi.advanceTimersByTime(3000);
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
    expect(onPaymentReceived).not.toHaveBeenCalled();
    invalidateSpy.mockRestore();
  });
});
