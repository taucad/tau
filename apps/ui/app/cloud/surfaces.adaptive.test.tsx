/**
 * The adaptive surfaces (adaptive app deployment mode charter W5, the surface table, T-BA18, T-BA19): each facade in
 * the three modes. An unfunded or unknown render never asks the loader for the Cloud chunk; the Billing section and
 * `/usage` say which wait they are, bounded, with Retry; Close account needs a confirmed basis; the payment return is
 * left alone until the mode is funded.
 */
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import type { DeploymentModeSnapshot } from '#cloud/deployment-mode.types.js';
import { cloudSurfaces } from '#cloud/cloud-entries.js';
import { CloudAccountClosure, CloudBillingSettings, billingWaitCopy } from '#cloud/settings-billing.adaptive.js';
import { NavBillingItem, NavCreditsMeter, useBillingNavRoutes } from '#cloud/nav-billing.adaptive.js';
import { ZooUpgradeBanner } from '#cloud/zoo-upgrade-banner.adaptive.js';
import { CloudPaymentReturn } from '#cloud/root-billing.adaptive.js';
import { ChatErrorCredits } from '#routes/w.$workspace.$project/chat-error-credits.adaptive.js';

const harness = vi.hoisted(() => ({ mode: undefined as unknown, retried: 0 }));

vi.mock('#cloud/use-deployment-mode.js', async () => {
  const { useSyncExternalStore } = await import('react');
  const listeners = new Set<() => void>();
  (globalThis as { setTestMode?: (mode: unknown) => void }).setTestMode = (mode) => {
    harness.mode = mode;
    for (const listener of listeners) {
      listener();
    }
  };
  return {
    useDeploymentMode: () =>
      useSyncExternalStore(
        (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => harness.mode,
      ),
    useRetryDeploymentMode: () => () => {
      harness.retried += 1;
    },
  };
});
vi.mock('#hooks/use-chat.js', () => ({ useChatActions: () => ({ regenerate: vi.fn() }) }));

const setMode = (mode: DeploymentModeSnapshot): void => {
  act(() => {
    (globalThis as unknown as { setTestMode: (next: unknown) => void }).setTestMode(mode);
  });
};

const surfaces = (): React.JSX.Element => (
  <MemoryRouter>
    <NavBillingItem />
    <NavCreditsMeter />
    <CloudBillingSettings />
    <CloudAccountClosure />
    <ZooUpgradeBanner message='Your plan on this server does not include Zoo.' onRetry={vi.fn()} />
    <ChatErrorCredits resumable />
    <CloudPaymentReturn />
  </MemoryRouter>
);

let load: MockInstance<() => void>;
beforeEach(() => {
  harness.retried = 0;
  harness.mode = { state: 'unknown', problem: 'pending' };
  load = vi.spyOn(cloudSurfaces, 'load').mockImplementation(() => undefined);
});
afterEach(() => {
  load.mockRestore();
});

describe('adaptive surfaces (the surface table)', () => {
  it.each([
    [{ state: 'unfunded', basis: 'confirmed' } as const],
    [{ state: 'unknown', problem: 'pending' } as const],
    [{ state: 'unknown', problem: 'unreachable' } as const],
    [{ state: 'unknown', problem: 'safe-mode' } as const],
  ])('never asks for the Cloud chunk in %o (T-BA18: the payment return stays untouched)', (mode) => {
    harness.mode = mode;
    render(surfaces());
    expect(load).not.toHaveBeenCalled();
  });

  it('asks for the Cloud chunk once funded, and keeps Close account for a confirmed basis (I6)', () => {
    harness.mode = { state: 'funded', basis: 'remembered', environment: 'staging' };
    const { unmount } = render(<CloudAccountClosure />);
    expect(load).not.toHaveBeenCalled();
    unmount();
    harness.mode = { state: 'funded', basis: 'confirmed', environment: 'staging' };
    render(<CloudAccountClosure />);
    expect(load).toHaveBeenCalled();
  });

  it('says which wait the Billing section is, with Retry where it helps, and nothing when unfunded (I15, BA19)', () => {
    const view = render(<CloudBillingSettings />);
    expect(screen.getByRole('status')).toHaveTextContent(billingWaitCopy.pending);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    setMode({ state: 'unknown', problem: 'unreachable' });
    expect(screen.getByRole('status')).toHaveTextContent(billingWaitCopy.unreachable);
    act(() => {
      screen.getByRole('button', { name: 'Retry' }).click();
    });
    expect(harness.retried).toBe(1);
    setMode({ state: 'unknown', problem: 'unsupported' });
    expect(screen.getByRole('status')).toHaveTextContent(billingWaitCopy.unsupported);
    setMode({ state: 'unknown', problem: 'misconfigured' });
    expect(screen.getByRole('status')).toHaveTextContent(billingWaitCopy.misconfigured);
    setMode({ state: 'unfunded', basis: 'confirmed' });
    expect(view.container).toBeEmptyDOMElement();
  });

  it('shows a neutral credits card while unknown: no purchase and no claim about charging', () => {
    render(<ChatErrorCredits resumable />);
    expect(screen.getByText('Tau could not run this turn')).toBeInTheDocument();
    expect(screen.queryByText(/credits|charged|Pro/iu)).not.toBeInTheDocument();
  });

  it('offers the Usage link only on a funded desktop', async () => {
    const { renderHook } = await import('@testing-library/react');
    harness.mode = { state: 'funded', basis: 'confirmed', environment: 'staging' };
    /* Unit tests build for the web: the adaptive web build has no `/usage` (D8). */
    expect(renderHook(() => useBillingNavRoutes()).result.current).toEqual([]);
  });
});

describe('/usage guarded by mode (T-BA19)', () => {
  it('renders the not-found when unfunded and a bounded wait while unknown', async () => {
    const { default: UsagePage } = await import('#routes/usage/route.js');
    harness.mode = { state: 'unfunded', basis: 'confirmed' };
    const view = render(
      <MemoryRouter>
        <UsagePage />
      </MemoryRouter>,
    );
    expect(view.container).toHaveTextContent(/not found/iu);
    setMode({ state: 'unknown', problem: 'pending' });
    expect(screen.getByRole('status')).toHaveTextContent('Checking this server');
    setMode({ state: 'unknown', problem: 'unreachable' });
    act(() => {
      screen.getByRole('button', { name: 'Retry' }).click();
    });
    expect(harness.retried).toBe(1);
  }, 60_000);
});
