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
});

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
      const response = await fetch('https://api.stripe.com/v1/webhook_endpoints?limit=100', {
        headers: { authorization: `Bearer ${key}` },
      });
      const { data } = webhookEndpointsSchema.parse(await response.json());
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
