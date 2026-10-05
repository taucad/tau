import { render, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BetterAuthUi from '@better-auth-ui/react';
import { BillingSessionProvider, useBillingSession } from '@taucad/billing/hooks/billing-session';
import type { BillingSession } from '@taucad/billing/hooks/billing-session';
import { CloudRootBoundary, useCloudPaymentActionReturn } from '#cloud/root-billing.cloud.js';
import type { ClientEnvironment } from '#environment.config.js';
import { FinancialSessionScope } from '#providers/financial-session-provider.js';
import type * as FinancialSessionModule from '#providers/financial-session-provider.js';

const getPaymentAction = vi.hoisted(() => vi.fn());
vi.mock('#lib/billing-payment-client.js', () => ({
  getPaymentAction,
  followPaymentRedirect: vi.fn(),
  recoverPaymentAction: vi.fn(),
}));
const currentSession = vi.hoisted((): { userId: string | undefined } => ({ userId: undefined }));
vi.mock('@better-auth-ui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof BetterAuthUi>();
  return {
    ...actual,
    useSession: () => ({
      data: currentSession.userId === undefined ? null : { user: { id: currentSession.userId } },
      isPending: false,
    }),
  };
});
const financial = vi.hoisted(() => ({
  capture: () => ({ generation: 1, signal: new AbortController().signal, isCurrent: () => true }),
}));
vi.mock('#providers/financial-session-provider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof FinancialSessionModule>();
  return {
    ...actual,
    useFinancialSession: () => financial,
    FinancialSessionScope: vi.fn(actual.FinancialSessionScope),
  };
});
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));

const paymentSession: BillingSession = {
  apiBaseUrl: 'https://api.tau.new',
  environment: 'development',
  userId: 'user-a',
};
const originalClientEnvironment = globalThis.window.ENV;

describe('CloudRootBoundary billing binding', () => {
  beforeEach(() => {
    currentSession.userId = undefined;
    vi.mocked(FinancialSessionScope).mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    globalThis.window.ENV = originalClientEnvironment;
  });

  const bootstrap = () => {
    let observed: BillingSession | undefined;
    const Probe = (): React.JSX.Element => {
      observed = useBillingSession();
      return <output>Billing child</output>;
    };
    const markup = renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <CloudRootBoundary>
            <Probe />
          </CloudRootBoundary>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return { markup, observed, identity: vi.mocked(FinancialSessionScope).mock.lastCall?.[0].identity };
  };

  it.each([undefined, 'user-a'])('should retain an absent desktop billing binding for session %s', (userId) => {
    currentSession.userId = userId;
    vi.stubEnv('TAU_TARGET', 'desktop');
    vi.stubGlobal('window', undefined);
    const result = bootstrap();
    expect(result.markup).toContain('Billing child');
    expect(result.observed).toEqual({ apiBaseUrl: undefined, environment: undefined, userId });
    expect(result.identity).toBeUndefined();
  });

  it.each([undefined, 'user-a'])('should retain configured API and financial identity for session %s', (userId) => {
    currentSession.userId = userId;
    globalThis.window.ENV = {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- host-injected environment keys use CONSTANT_CASE.
      TAU_BILLING_ENVIRONMENT: 'development',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- host-injected environment keys use CONSTANT_CASE.
      TAU_API_URL: 'https://api.tau.new/',
    } satisfies Partial<ClientEnvironment>;
    const result = bootstrap();
    expect(result.markup).toContain('Billing child');
    expect(result.observed).toEqual({ apiBaseUrl: 'https://api.tau.new', environment: 'development', userId });
    expect(result.identity).toEqual(
      userId === undefined
        ? undefined
        : { apiBaseUrl: 'https://api.tau.new', environment: 'development', ownerId: userId },
    );
  });

  it.each([undefined, 'user-a'])(
    'should reject a configured billing binding without its API for session %s',
    (userId) => {
      currentSession.userId = userId;
      globalThis.window.ENV = {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- host-injected environment keys use CONSTANT_CASE.
        TAU_BILLING_ENVIRONMENT: 'development',
      } satisfies Partial<ClientEnvironment>;
      expect(bootstrap).toThrow(Error);
      expect(bootstrap).toThrow(
        'Missing TAU_API_URL: the host must inject it through window.ENV before app-module evaluation.',
      );
      expect(FinancialSessionScope).not.toHaveBeenCalled();
    },
  );
});

describe('useCloudPaymentActionReturn', () => {
  it.each(['completed', 'fulfilled'])('should refresh billing data when the returned action is %s', async (state) => {
    getPaymentAction.mockResolvedValue({
      actionId: 'action_1',
      purpose: 'subscription_checkout',
      state,
      receipt: null,
      subjectId: 'account-a',
    });
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(useCloudPaymentActionReturn, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <BillingSessionProvider value={paymentSession}>
            <MemoryRouter initialEntries={['/?payment_action=action_1']}>{children}</MemoryRouter>
          </BillingSessionProvider>
        </QueryClientProvider>
      ),
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['billing'] });
    });
  });

  it('should clear the returned action parameter even when the check fails', async () => {
    getPaymentAction.mockRejectedValue(new Error('offline'));
    let search = '';
    const Probe = (): undefined => {
      useCloudPaymentActionReturn();
      search = useLocation().search;
      return undefined;
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BillingSessionProvider value={paymentSession}>
          <MemoryRouter initialEntries={['/?payment_action=action_1']}>
            <Probe />
          </MemoryRouter>
        </BillingSessionProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(search).toBe('');
    });
  });
});
