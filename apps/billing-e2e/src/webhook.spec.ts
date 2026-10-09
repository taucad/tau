import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { apiUrl, createApi } from '#support/api.js';
import { matrixRow } from '#support/results.js';

const webhookEndpointsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      url: z.string(),
      status: z.string(),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe wire field
      enabled_events: z.array(z.string()),
    }),
  ),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe wire field
  has_more: z.boolean(),
});
type Endpoint = z.infer<typeof webhookEndpointsSchema>['data'][number];

type Listing = { readonly data: Endpoint[]; readonly refusal?: number };

/** Every endpoint the key can see, following `has_more`; a refusal (401 bad key, 403 role) keeps the pages read so far. */
const listEndpoints = async (key: string, after?: string): Promise<Listing> => {
  const query = new URLSearchParams({ limit: '100' });
  if (after !== undefined) {
    query.set('starting_after', after);
  }
  const response = await fetch(`https://api.stripe.com/v1/webhook_endpoints?${query.toString()}`, {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    return { data: [], refusal: response.status };
  }
  const page = webhookEndpointsSchema.parse(await response.json());
  const last = page.data.at(-1);
  const rest = page.has_more && last !== undefined ? await listEndpoints(key, last.id) : { data: [] };
  return { data: [...page.data, ...rest.data], ...(rest.refusal === undefined ? {} : { refusal: rest.refusal }) };
};

describe('webhooks', () => {
  it(
    'should reject a webhook delivery with a bad signature [WH-02 P0 smoke]',
    matrixRow('WH-02', 'P0', async () => {
      const response = await createApi().request('POST', '/v1/auth/stripe/webhook', {
        body: { id: 'evt_billing_e2e_probe', object: 'event', type: 'checkout.session.completed' },
        origin: false,
        headers: { 'stripe-signature': 't=1,v1=00' },
      });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ code: 'invalid_stripe_delivery' });
      return { outcome: 'pass', evidence: [`400 ${JSON.stringify(response.body)}`] };
    }),
  );

  it(
    'should have the staging webhook endpoint enabled and no stray catch-all endpoint [WH-01 P0 smoke]',
    matrixRow('WH-01', 'P0', async () => {
      const key = process.env['STRIPE_TEST_READ_KEY'] ?? '';
      if (key === '') {
        return { outcome: 'skipped', evidence: ['STRIPE_TEST_READ_KEY is not set'] };
      }
      // Test mode only: a live key is refused before it is sent anywhere.
      if (!/^[rs]k_test_/u.test(key)) {
        throw new Error('STRIPE_TEST_READ_KEY must be a test-mode key (rk_test_ or sk_test_)');
      }
      const { data, refusal } = await listEndpoints(key);
      if (refusal !== undefined) {
        // The key, not the endpoint, is what is missing: 401 is a bad key, 403 a role without webhook-endpoint read.
        return {
          outcome: 'blocked',
          defect: 'H-02',
          evidence: [
            `Stripe answered ${refusal} to the endpoint listing`,
            ...data.map((seen) => `seen before the refusal: ${seen.id} ${seen.status} ${seen.url}`),
          ],
        };
      }
      const url = `${apiUrl}/v1/auth/stripe/webhook`;
      const endpoint = data.find((candidate) => candidate.url === url);
      const strays = data.filter(
        (candidate) =>
          candidate.url !== url && candidate.status === 'enabled' && candidate.enabled_events.includes('*'),
      );
      const evidence = [
        endpoint === undefined
          ? `no endpoint for ${url} in this key's Stripe account`
          : `${endpoint.id} ${endpoint.status}, ${endpoint.enabled_events.length} events`,
        ...strays.map((stray) => `stray enabled * endpoint ${stray.id} ${stray.url}`),
      ];
      if (endpoint === undefined) {
        // A key that cannot see the endpoint is a harness condition (another Stripe account), not a product defect.
        return { outcome: 'blocked', defect: 'H-02', evidence };
      }
      if (endpoint.status === 'enabled' && strays.length === 0) {
        return { outcome: 'pass', evidence };
      }
      // A disabled endpoint is F-01 whatever else is enabled; the strays stay in the evidence either way.
      return { outcome: 'fail', defect: endpoint.status === 'enabled' ? 'F-08' : 'F-01', evidence };
    }),
  );
});
