import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import type Stripe from 'stripe';
import { resolveDefaultCard } from '#api/billing/resolve-default-card.js';

const createStripe = (): ReturnType<typeof mockDeep<Stripe>> => mockDeep<Stripe>();

describe('resolveDefaultCard', () => {
  it('should return the invoice-settings default card when one is set', async () => {
    const stripe = createStripe();
    stripe.customers.retrieve.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
      invoice_settings: { default_payment_method: { id: 'pm_default', card: { brand: 'visa', last4: '4242' } } },
    } as never);

    await expect(resolveDefaultCard(stripe, 'cus_1')).resolves.toStrictEqual({
      id: 'pm_default',
      brand: 'visa',
      last4: '4242',
    });
    // The default is honoured directly — no need to list the customer's cards.
    expect(stripe.paymentMethods.list).not.toHaveBeenCalled();
  });

  it('should fall back to the most-recent card when no default is set', async () => {
    const stripe = createStripe();
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
    stripe.customers.retrieve.mockResolvedValue({ invoice_settings: {} } as never);
    stripe.paymentMethods.list.mockResolvedValue({
      data: [{ id: 'pm_recent', card: { brand: 'mastercard', last4: '5555' } }],
    } as never);

    await expect(resolveDefaultCard(stripe, 'cus_1')).resolves.toStrictEqual({
      id: 'pm_recent',
      brand: 'mastercard',
      last4: '5555',
    });
  });

  it('should return undefined when the customer has no card on file', async () => {
    const stripe = createStripe();
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
    stripe.customers.retrieve.mockResolvedValue({ invoice_settings: {} } as never);
    stripe.paymentMethods.list.mockResolvedValue({ data: [] } as never);

    await expect(resolveDefaultCard(stripe, 'cus_1')).resolves.toBeUndefined();
  });

  it('should return undefined for a deleted customer', async () => {
    const stripe = createStripe();
    stripe.customers.retrieve.mockResolvedValue({ deleted: true } as never);

    await expect(resolveDefaultCard(stripe, 'cus_1')).resolves.toBeUndefined();
    expect(stripe.paymentMethods.list).not.toHaveBeenCalled();
  });

  it('should fail closed (undefined) when Stripe is unreachable', async () => {
    const stripe = createStripe();
    stripe.customers.retrieve.mockRejectedValue(new Error('network down'));

    await expect(resolveDefaultCard(stripe, 'cus_1')).resolves.toBeUndefined();
  });
});
