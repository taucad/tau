/**
 * Plan facts behind the adaptive facades (adaptive app deployment mode charter W4, the consumer table, I3, I4, I15,
 * T-BA24): the commercial features in every wait kind and both resolved outcomes, on the deadline; the routing plan
 * and the credit preflight checked when called, across a demotion, an environment change and an owner change, none of
 * which remounts anything.
 */
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeploymentModeSnapshot } from '#cloud/deployment-mode.types.js';
import { CloudIdentityProvider, cloudIdentityValue } from '#cloud/cloud-identity.js';
import { cloudIdentityKey, cloudPort } from '#cloud/cloud-port.js';
import { askDeadlineMilliseconds } from '#lib/ask-deadline.js';
import type { CloudIdentity } from '#cloud/cloud-port.js';
import type { CloudPlanFacts } from '#cloud/plan-facts.types.js';
import { useCommercialFeatures } from '#cloud/commercial-features.adaptive.js';
import { isKernelRoutable } from '#cloud/kernel-commerce.adaptive.js';
import { preflightCredit } from '#hooks/use-credit-preflight.adaptive.js';

const harness = vi.hoisted(() => ({
  mode: undefined as unknown,
  retried: 0,
  upgraded: 0,
}));

vi.mock('#cloud/use-deployment-mode.js', () => ({
  useDeploymentMode: () => harness.mode,
  useRetryDeploymentMode: () => () => {
    harness.retried += 1;
  },
}));
vi.mock('#hooks/use-settings-dialog.js', () => ({
  useSettingsDialog: () => ({
    open: () => {
      harness.upgraded += 1;
    },
  }),
}));

const alice: CloudIdentity = { apiBaseUrl: 'https://api.test', environment: 'staging', ownerId: 'alice' };
const aliceProduction: CloudIdentity = { ...alice, environment: 'prod-us' };
const bob: CloudIdentity = { ...alice, ownerId: 'bob' };
const proFacts: CloudPlanFacts = {
  commercial: { canCreatePrivateShares: true, canSyncFiles: true, storageLimitBytes: 1024, canUpgradePlan: true },
  kernels: { allowed: ['replicad', 'zoo'] },
  credit: { availableAtoms: '10', minimumHoldAtoms: { route: '100' }, autoReloadEnabled: false },
};

const funded: DeploymentModeSnapshot = { state: 'funded', basis: 'confirmed', environment: 'staging' };

const commercialIn = (mode: DeploymentModeSnapshot, identity: CloudIdentity | undefined) => {
  harness.mode = mode;
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <CloudIdentityProvider value={cloudIdentityValue(identity)}>{children}</CloudIdentityProvider>
  );
  return renderHook(() => useCommercialFeatures(), { wrapper });
};

beforeEach(() => {
  harness.retried = 0;
  harness.upgraded = 0;
  cloudPort.bind(undefined);
  cloudPort.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('commercial features (consumer table)', () => {
  it.each([
    [{ state: 'unknown', problem: 'pending' } as const, 'checking'],
    [{ state: 'unknown', problem: 'unreachable' } as const, 'unavailable'],
    [{ state: 'unknown', problem: 'unsupported' } as const, 'unavailable'],
    [{ state: 'unknown', problem: 'misconfigured' } as const, 'unavailable'],
    [{ state: 'unknown', problem: 'safe-mode' } as const, 'safe-mode'],
  ])('should be unresolved in %o, with no capability to read, as %s (I3)', (mode, wait) => {
    const { result } = commercialIn(mode, undefined);
    expect(result.current).toMatchObject({ isResolved: false, wait });
    expect(result.current).not.toHaveProperty('canSyncFiles');
    if (!result.current.isResolved) {
      result.current.retry();
    }
    expect(harness.retried).toBe(1);
  });

  it('should resolve open with the mode basis when unfunded', () => {
    const { result } = commercialIn({ state: 'unfunded', basis: 'remembered' }, undefined);
    expect(result.current).toMatchObject({
      isResolved: true,
      basis: 'remembered',
      canSyncFiles: true,
      canCreatePrivateShares: true,
      canUpgradePlan: false,
    });
  });

  it('should check for one deadline while funded and no facts arrive, then say it cannot check (I15)', () => {
    vi.useFakeTimers();
    const key = cloudIdentityKey(alice);
    act(() => {
      cloudPort.bind(key);
    });
    const { result } = commercialIn(funded, alice);
    expect(result.current).toMatchObject({ isResolved: false, wait: 'checking' });
    act(() => {
      vi.advanceTimersByTime(askDeadlineMilliseconds);
    });
    expect(result.current).toMatchObject({ isResolved: false, wait: 'unavailable' });
    act(() => {
      cloudPort.publish(key, proFacts);
    });
    expect(result.current).toMatchObject({ isResolved: true, basis: 'confirmed', storageLimitBytes: 1024 });
    if (result.current.isResolved) {
      result.current.requestUpgrade();
    }
    expect(harness.upgraded).toBe(1);
  });

  it("should never read another identity's facts", () => {
    cloudPort.publish(cloudIdentityKey(alice), proFacts);
    const { result } = commercialIn(funded, bob);
    expect(result.current.isResolved).toBe(false);
  });
});

describe('routing plan, checked when called (C6, T-BA24)', () => {
  it('should leave Zoo out while unresolved and follow the identity bound when it is called', () => {
    expect(isKernelRoutable('zoo')).toBe(false);
    expect(isKernelRoutable('replicad')).toBe(true);
    cloudPort.publish(cloudIdentityKey(alice), proFacts);
    cloudPort.bind(cloudIdentityKey(alice));
    expect(isKernelRoutable('zoo')).toBe(true);
    /* Pro funded → unknown: the identity is unbound. */
    cloudPort.bind(undefined);
    expect(isKernelRoutable('zoo')).toBe(false);
    /* → funded in another environment: a new identity with no facts yet. */
    cloudPort.bind(cloudIdentityKey(aliceProduction));
    expect(isKernelRoutable('zoo')).toBe(false);
    /* Account A to B while not funded, then funded: B's facts only. */
    cloudPort.bind(undefined);
    cloudPort.bind(cloudIdentityKey(bob));
    expect(isKernelRoutable('zoo')).toBe(false);
  });
});

describe('credit preflight, checked when called (C7, T-BA24)', () => {
  it('should refuse only against the facts bound when it is called, even after an await spanning a demotion', async () => {
    const preflight = preflightCredit;
    expect(() => {
      preflight('route', 'Model');
    }).not.toThrow();
    cloudPort.publish(cloudIdentityKey(alice), proFacts);
    cloudPort.bind(cloudIdentityKey(alice));
    expect(() => {
      preflight('route', 'Model');
    }).toThrow(/INSUFFICIENT_CREDIT/u);
    /* Captured before an await, called after the mode left funded: the server's admission decides. */
    const captured = preflight;
    await Promise.resolve();
    cloudPort.bind(undefined);
    expect(() => {
      captured('route', 'Model');
    }).not.toThrow();
  });

  it('should fail open when auto-reload is on or the route publishes no floor', () => {
    cloudPort.publish(cloudIdentityKey(alice), {
      credit: { availableAtoms: '1', minimumHoldAtoms: {}, autoReloadEnabled: true },
    });
    cloudPort.bind(cloudIdentityKey(alice));
    expect(() => {
      preflightCredit('route', 'Model');
    }).not.toThrow();
  });
});
