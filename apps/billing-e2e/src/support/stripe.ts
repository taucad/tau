import process from 'node:process';
import { z } from 'zod';

/**
 * Optional, read-only Stripe evidence. The harness never writes to Stripe and never holds a live key: a key that is
 * not test mode is refused before it is sent anywhere, and rows that need Stripe's side of a payment report H-05
 * when no key is configured.
 */

/**
 * Throws unless `key` is a test-mode secret or restricted key.
 *
 * @param key - The configured key.
 * @throws For a live key, or anything that is not a test-mode key.
 */
export const assertTestModeKey = (key: string): void => {
  if (/^(?:sk|rk)_live_/u.test(key)) {
    throw new Error('Refusing a live Stripe key: the billing harness reads test mode only');
  }
  if (!/^(?:sk|rk)_test_/u.test(key)) {
    throw new Error('STRIPE_TEST_READ_KEY must be a test-mode key (rk_test_ or sk_test_)');
  }
};

/** The configured read key (`STRIPE_TEST_READ_KEY`), checked; undefined when none is set. */
export const stripeReadKey = (): string | undefined => {
  const key = process.env['STRIPE_TEST_READ_KEY'] ?? '';
  if (key === '') {
    return undefined;
  }
  assertTestModeKey(key);
  return key;
};

/** One read-only Stripe GET; a refusal (401 bad key, 403 role) is returned as its status. */
export const stripeGet = async (
  key: string,
  path: string,
): Promise<{ readonly status: number; readonly body: unknown }> => {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { authorization: `Bearer ${key}` } });
  return { status: response.status, body: (await response.json()) as unknown };
};

const sessionSchema = z.object({ subscription: z.string().nullable() });
const subscriptionSchema = z.object({
  id: z.string(),
  status: z.string(),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe wire field
  cancel_at_period_end: z.boolean(),
});

/** The subscription a paid subscription Checkout session created, as Stripe holds it now. */
export const subscriptionOfSession = async (
  key: string,
  sessionId: string,
): Promise<z.infer<typeof subscriptionSchema> | { readonly refusal: number }> => {
  const session = await stripeGet(key, `checkout/sessions/${sessionId}`);
  if (session.status !== 200) {
    return { refusal: session.status };
  }
  const { subscription } = sessionSchema.parse(session.body);
  if (subscription === null) {
    throw new Error(`Checkout session ${sessionId} created no subscription`);
  }
  const read = await stripeGet(key, `subscriptions/${subscription}`);
  return read.status === 200 ? subscriptionSchema.parse(read.body) : { refusal: read.status };
};
