// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- extends Vitest matchers for DOM assertions.
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { entitlementsFromTier } from '@taucad/billing';
import type { Entitlements } from '@taucad/billing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TopupModal } from '#components/billing/topup-modal.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- mock mirrors the runtime environment contract.
const environment = vi.hoisted<{ TAU_API_URL?: string }>(() => ({ TAU_API_URL: 'http://api.test' }));

vi.mock('#environment.config.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable names
  ENV: environment,
  requireClientEnvironmentUrl: () => {
    if (environment.TAU_API_URL === undefined) {
      throw new Error('Missing TAU_API_URL: the host must inject it through window.ENV before app-module evaluation.');
    }
    return environment.TAU_API_URL.replace(/\/$/u, '');
  },
}));

const toastMock = vi.hoisted(() => {
  const base = vi.fn() as ReturnType<typeof vi.fn> & { warning: ReturnType<typeof vi.fn> };
  base.warning = vi.fn();
  return base;
});
vi.mock('#components/ui/sonner.js', () => ({
  toast: toastMock,
}));

const confirmSettlementMock = vi.hoisted(() => vi.fn());
vi.mock('@taucad/billing/hooks/use-topup-return', () => ({
  confirmTopupSettlement: confirmSettlementMock,
}));

const useEntitlementsMock = vi.hoisted(() => vi.fn());
vi.mock('@taucad/billing/hooks/use-entitlements', () => ({
  useEntitlements: useEntitlementsMock,
}));

const billingPortalMock = vi.hoisted(() => vi.fn());
vi.mock('#lib/auth-client.js', () => ({
  authClient: { subscription: { billingPortal: billingPortalMock } },
}));

// The real SvgIcon pulls the generated sprite + a `?url` PNG import; stub it to a
// marker element so the brand-icon mapping (R8) is assertable in jsdom.
vi.mock('#components/icons/svg-icon.js', () => ({
  SvgIcon: ({ id, ...props }: { readonly id: string }) => <svg data-icon={id} {...props} />,
}));

const withCard = (paymentMethod: Entitlements['paymentMethod']): Entitlements => ({
  ...entitlementsFromTier('free'),
  paymentMethod,
});

const fetchMock = vi.fn();
const assignMock = vi.fn();

const jsonResponse = (body: unknown): Response => ({ ok: true, json: async () => body }) as unknown as Response;

const renderModal = (props: Partial<React.ComponentProps<typeof TopupModal>> = {}): ReturnType<typeof render> =>
  render(
    <MemoryRouter>
      <TopupModal isOpen onOpenChange={props.onOpenChange ?? vi.fn()} defaultAmountCents={props.defaultAmountCents} />
    </MemoryRouter>,
  );

/** A fetch that stays pending, holding the modal in its charging phase. */
const pendingResponse = async (): Promise<Response> =>
  new Promise<Response>(() => {
    /* Never settles. */
  });

describe('TopupModal', () => {
  beforeEach(() => {
    environment.TAU_API_URL = 'http://api.test';
    vi.stubGlobal('fetch', fetchMock);
    // The modal reads `globalThis.location.href` for the return URL and calls
    // `globalThis.location.assign` to redirect to hosted Checkout.
    vi.stubGlobal('location', { href: 'http://app.test/?settings=billing', assign: assignMock });
    // Default: a card is on file (the in-app "Buy" state).
    useEntitlementsMock.mockReturnValue(withCard({ brand: 'visa', last4: '4242' }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should mint a hosted session for the picked preset and redirect to Stripe', async () => {
    fetchMock.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      expect(url).toBe('http://api.test/v1/billing/topup');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(init?.body ?? '') as { amountCents: number; returnUrl: string; idempotencyKey: string };
      expect(body.amountCents).toBe(5000);
      expect(body.returnUrl).toBe('http://app.test/?settings=billing');
      expect(body.idempotencyKey).toMatch(/^[\da-f-]{36}$/);
      return jsonResponse({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    });
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: '$50' }));
    await user.click(screen.getByRole('button', { name: /buy us\$50 of credits/i }));

    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1');
    });
  });

  it('should read TAU_API_URL when checkout starts', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' }));
    const user = userEvent.setup();
    renderModal();
    environment.TAU_API_URL = 'http://late-api.test';

    await user.click(screen.getByRole('button', { name: /buy us\$/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      'http://late-api.test/v1/billing/topup',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should not double the slash when TAU_API_URL carries a trailing slash', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' }));
    const user = userEvent.setup();
    renderModal();
    environment.TAU_API_URL = 'http://api.test/';

    await user.click(screen.getByRole('button', { name: /buy us\$/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/v1/billing/topup',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should show the settled balance in place without closing when the saved card is credited', async () => {
    // 137_240_000 µ$ = US$137.24 — the balance the server credited inline.
    fetchMock.mockResolvedValue(jsonResponse({ status: 'succeeded', balanceMicro: '137240000' }));
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderModal({ onOpenChange });

    await user.click(screen.getByRole('button', { name: /buy us\$/i }));

    expect(await screen.findByText('Credits added')).toBeInTheDocument();
    expect(screen.getByText('US$137.24')).toBeInTheDocument();
    expect(screen.getByText(/US\$25 was charged to your card\./)).toBeInTheDocument();
    // The whole point of inline settlement: the buyer sees the credit land.
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
    expect(confirmSettlementMock).toHaveBeenCalled();
    // The balance is on screen, so the "will update shortly" promise would lie.
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('should receipt the amount that was charged, not one picked while the charge was in flight', async () => {
    let release: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    );
    const user = userEvent.setup();
    renderModal({ defaultAmountCents: 2500 });

    await user.click(screen.getByRole('button', { name: /buy us\$25/i }));
    await screen.findByRole('button', { name: /processing/i });

    // Frozen while the charge runs, so the picker cannot desync from it…
    expect(screen.getByRole('button', { name: '$100' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Other' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '$100' }));
    release(jsonResponse({ status: 'succeeded', balanceMicro: '137240000' }));

    // …and the receipt reads the captured figure regardless.
    expect(await screen.findByText(/US\$25 was charged to your card\./)).toBeInTheDocument();
    expect(screen.queryByText(/US\$100 was charged/)).toBeNull();
  });

  it('should degrade to the pending toast when the settled balance is not a µ$ integer string', async () => {
    // A `null` slips past an `=== undefined` check and `BigInt(null)` throws in
    // render — after the card was charged. Parse at the boundary instead.
    fetchMock.mockResolvedValue(jsonResponse({ status: 'succeeded', balanceMicro: null }));
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderModal({ onOpenChange });

    await user.click(screen.getByRole('button', { name: /buy us\$/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(toastMock).toHaveBeenCalledWith(expect.stringMatching(/balance will update shortly/i));
    expect(screen.queryByText('Credits added')).not.toBeInTheDocument();
  });

  it('should return to the picker when the modal is reopened after a settled top-up', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'succeeded', balanceMicro: '137240000' }));
    const user = userEvent.setup();
    const { rerender } = renderModal();

    await user.click(screen.getByRole('button', { name: /buy us\$/i }));
    await user.click(await screen.findByRole('button', { name: 'Done' }));

    const modal = (isOpen: boolean): React.JSX.Element => (
      <MemoryRouter>
        <TopupModal isOpen={isOpen} onOpenChange={vi.fn()} />
      </MemoryRouter>
    );
    rerender(modal(false));
    rerender(modal(true));

    expect(await screen.findByText('Add credits')).toBeInTheDocument();
    expect(screen.queryByText('Credits added')).not.toBeInTheDocument();
  });

  it('should close the settled modal when Done is clicked', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'succeeded', balanceMicro: '137240000' }));
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderModal({ onOpenChange });

    await user.click(screen.getByRole('button', { name: /buy us\$/i }));
    await user.click(await screen.findByRole('button', { name: 'Done' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('should fall back to the pending toast when the charge succeeds but the credit is unconfirmed', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'succeeded' }));
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderModal({ onOpenChange });

    await user.click(screen.getByRole('button', { name: /buy us\$/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(toastMock).toHaveBeenCalledWith(expect.stringMatching(/balance will update shortly/i));
    // The card was charged — never an error, never an invitation to pay again.
    expect(toastMock.warning).not.toHaveBeenCalled();
    expect(screen.queryByText('Credits added')).not.toBeInTheDocument();
    expect(confirmSettlementMock).toHaveBeenCalled();
  });

  it('should reuse the idempotency key across ambiguous retries and mint a fresh one after success', async () => {
    const sentKeys: string[] = [];
    fetchMock.mockImplementation(async (_url: string, init?: { body?: string }) => {
      sentKeys.push((JSON.parse(init?.body ?? '') as { idempotencyKey: string }).idempotencyKey);
      // First two attempts: the ambiguous outcome — charge unconfirmed.
      if (sentKeys.length < 3) {
        return { ok: false, status: 503, text: async () => 'TOPUP_CHARGE_UNCONFIRMED' } as unknown as Response;
      }
      return jsonResponse({ status: 'succeeded', balanceMicro: '137240000' });
    });
    const user = userEvent.setup();
    const { rerender } = renderModal();

    const buy = async (): Promise<void> => user.click(screen.getByRole('button', { name: /buy us\$/i }));
    await buy();
    await screen.findByRole('button', { name: /buy us\$/i }); // Back in pick phase.
    await buy();
    await screen.findByRole('button', { name: /buy us\$/i });
    await buy();
    await screen.findByText('Credits added');

    // Close and reopen (the harness's onOpenChange is inert), then buy again.
    const modal = (isOpen: boolean): React.JSX.Element => (
      <MemoryRouter>
        <TopupModal isOpen={isOpen} onOpenChange={vi.fn()} />
      </MemoryRouter>
    );
    rerender(modal(false));
    rerender(modal(true));
    await buy();

    expect(sentKeys).toHaveLength(4);
    // Retries of the possibly-charged attempt reuse the key so Stripe dedupes…
    expect(sentKeys[1]).toBe(sentKeys[0]);
    expect(sentKeys[2]).toBe(sentKeys[0]);
    // …and a Buy after a definitive success is a new payment, not a retry.
    expect(sentKeys[3]).not.toBe(sentKeys[0]);
  });

  it('should explain an unconfirmed charge instead of inviting an immediate repay', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '{"statusCode":503,"message":"TOPUP_CHARGE_UNCONFIRMED"}',
    } as unknown as Response);
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /buy us\$/i }));

    await waitFor(() => {
      expect(toastMock.warning).toHaveBeenCalledWith(expect.stringMatching(/could not confirm the charge/i));
    });
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('should dismiss on Escape while picking, but not while the charge is in flight', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderModal({ onOpenChange });

    // Positive control: without it, an Escape that never reaches Radix under
    // jsdom would make the guard assertion below pass for the wrong reason.
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);

    onOpenChange.mockClear();
    fetchMock.mockReturnValue(pendingResponse());
    await user.click(screen.getByRole('button', { name: /buy us\$/i }));
    await screen.findByRole('button', { name: /processing/i });
    await user.keyboard('{Escape}');

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('should surface a toast and not redirect when the mint fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /buy us\$/i }));

    await waitFor(() => {
      expect(toastMock.warning).toHaveBeenCalledWith(expect.stringMatching(/could not start the top-up checkout/i));
    });
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('should reject out-of-bounds custom amounts before any request (S41 mirror)', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: 'Other' }));
    await user.type(screen.getByLabelText('Custom amount'), '501');

    expect(screen.getByText(/between \$5 and \$500/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /buy us\$/i })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should drop the picked amount to US$0 when switching to Other, then track the typed value', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: '$25' }));
    await user.click(screen.getByRole('button', { name: 'Other' }));

    // The stale $25 must not linger — reads US$0 and is disabled until an amount is entered.
    expect(screen.getByRole('button', { name: /buy us\$/i })).toHaveTextContent('Buy US$0 of credits');
    expect(screen.getByRole('button', { name: /buy us\$/i })).toBeDisabled();

    await user.type(screen.getByLabelText('Custom amount'), '30');

    expect(screen.getByRole('button', { name: /buy us\$/i })).toHaveTextContent('Buy US$30 of credits');
    expect(screen.getByRole('button', { name: /buy us\$/i })).toBeEnabled();
  });

  it('should render a line-item summary with matching Usage credits and Total due, and no tax line (R2/R5)', () => {
    renderModal({ defaultAmountCents: 2500 });

    expect(screen.getByText('Usage credits')).toBeInTheDocument();
    expect(screen.getByText('Total due')).toBeInTheDocument();
    // Both lines read the same amount (no tax); the label maps to two <dd>US$25</dd>.
    expect(screen.getAllByText('US$25')).toHaveLength(2);
    expect(screen.queryByText(/tax/i)).toBeNull();
  });

  it('should show the saved card with its brand icon (R2/R8)', () => {
    useEntitlementsMock.mockReturnValue(withCard({ brand: 'visa', last4: '4242' }));
    renderModal();

    expect(screen.getByText(/Visa •{4} 4242/)).toBeInTheDocument();
    expect(document.body.querySelector('[data-icon="visa"]')).not.toBeNull();
  });

  it('should fall back to the lucide card glyph for a brand with no bundled icon (R8)', () => {
    useEntitlementsMock.mockReturnValue(withCard({ brand: 'eftpos_au', last4: '1234' }));
    renderModal();

    expect(screen.getByText(/Card •{4} 1234/)).toBeInTheDocument();
    expect(document.body.querySelector('[data-icon]')).toBeNull();
  });

  it('should open the billing portal to edit the saved card (R3)', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /edit payment method/i }));

    expect(billingPortalMock).toHaveBeenCalledWith({ returnUrl: 'http://app.test/?settings=billing' });
  });

  it('should link the footnote to the Terms page (R4)', () => {
    renderModal();

    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/legal/terms');
  });

  it('should say "Continue" and omit the card row when no card is on file (OQ2)', () => {
    useEntitlementsMock.mockReturnValue(withCard(undefined));
    renderModal({ defaultAmountCents: 2500 });

    expect(screen.getByRole('button', { name: /continue — us\$25/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /buy us\$/i })).toBeNull();
    expect(screen.queryByText(/•{4} /)).toBeNull();
    expect(screen.queryByRole('button', { name: /edit payment method/i })).toBeNull();
  });
});
