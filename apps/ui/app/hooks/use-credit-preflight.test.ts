import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { WireBalanceExplanation, WireModelEstimates } from '@taucad/billing';
import { useCreditPreflight } from '#hooks/use-credit-preflight.js';

const billing = vi.hoisted(() => ({
  explanation: undefined as WireBalanceExplanation | undefined,
  estimates: undefined as WireModelEstimates | undefined,
  autoReloadEnabled: false,
}));

vi.mock('@taucad/billing/hooks/use-credits', () => ({ useCredits: () => billing.explanation }));
vi.mock('@taucad/billing/hooks/use-model-estimates', () => ({ useModelEstimates: () => billing.estimates }));
vi.mock('#hooks/use-auto-reload-enabled.js', () => ({ useAutoReloadEnabled: () => billing.autoReloadEnabled }));

/** Only `balance.eligibleAvailableCreditAtoms` is read; the rest is envelope. */
const withAvailable = (atoms: string): WireBalanceExplanation =>
  ({
    availability: { state: 'available', reason: null },
    balance: { eligibleAvailableCreditAtoms: atoms },
  }) as unknown as WireBalanceExplanation;

/* The API's own development numbers: a representative 120 KB turn reserves
 * 3,084,332 atoms, while the floor no Astra turn can be admitted below is
 * 1,133,877 — the live probe's real turn authorized 1,134,234 between them. */
const astraEstimates: WireModelEstimates = {
  environment: 'development',
  ownerId: 'user',
  routes: [
    {
      routeId: 'openai-gpt-6-astra',
      modelId: 'gpt-6-astra',
      typicalHoldAtoms: '3084332',
      minimumHoldAtoms: '1133877',
      tier: 'base',
    },
  ],
};

const preflight = (
  explanation: WireBalanceExplanation | undefined,
  estimates: WireModelEstimates | undefined,
  autoReloadEnabled = false,
) => {
  billing.autoReloadEnabled = autoReloadEnabled;
  billing.explanation = explanation;
  billing.estimates = estimates;
  return renderHook(() => useCreditPreflight()).result.current;
};

describe('useCreditPreflight', () => {
  it('leaves a short balance to the server while automatic reload is enabled, since its denial wakes the reload', () => {
    const admit = preflight(withAvailable('0'), astraEstimates, true);
    expect(() => {
      admit('openai-gpt-6-astra', 'GPT-6 Astra');
    }).not.toThrow();
  });

  it('refuses a turn below the route floor and reports the real shortfall', () => {
    const refuse = preflight(withAvailable('1000000'), astraEstimates);

    let thrown: unknown;
    try {
      refuse('openai-gpt-6-astra', 'GPT-6 Astra');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(JSON.parse((thrown as Error).message)).toEqual({
      category: 'credits',
      title: 'Credit Limit Reached',
      message: 'Add credits to start a turn on GPT-6 Astra.',
      code: 'INSUFFICIENT_CREDIT',
      httpStatus: 402,
      details: {
        /* The floor, not the representative hold: the card must not tell a reader
         * they are ~208 credits short when the turn needs ~13 more. */
        requiredCreditAtoms: '1133877',
        availableCreditAtoms: '1000000',
        routeId: 'openai-gpt-6-astra',
      },
    });
  });

  it('admits a balance that covers exactly the route floor', () => {
    const refuse = preflight(withAvailable('1133877'), astraEstimates);

    expect(() => {
      refuse('openai-gpt-6-astra', 'GPT-6 Astra');
    }).not.toThrow();
  });

  /*
   * Finding F3: the ledger authorized 1,134,234 atoms for a real Astra turn while
   * the representative estimate published 3,084,332, so every balance between the
   * two was refused a turn the server would have funded.
   */
  it('admits a balance the server funds but one representative turn exceeds', () => {
    const refuse = preflight(withAvailable('1200000'), astraEstimates);

    expect(() => {
      refuse('openai-gpt-6-astra', 'GPT-6 Astra');
    }).not.toThrow();
  });

  /*
   * Failing open is the invariant: the server's admission is the authority, and
   * a read this client could not make must never be the reason a turn is lost.
   */
  it.each([
    ['no estimates were read', withAvailable('1'), undefined],
    ['no balance was read', undefined, astraEstimates],
    [
      'the balance authority is unavailable',
      {
        availability: { state: 'unavailable', reason: 'authority_unavailable' },
        balance: null,
      } as unknown as WireBalanceExplanation,
      astraEstimates,
    ],
    [
      'the route publishes no estimate',
      withAvailable('1'),
      { ...astraEstimates, routes: [] } satisfies WireModelEstimates,
    ],
  ])('fails open to the server when %s', (_case, explanation, estimates) => {
    const refuse = preflight(explanation, estimates);

    expect(() => {
      refuse('openai-gpt-6-astra', 'GPT-6 Astra');
    }).not.toThrow();
  });
});
