import { describe, it } from 'vitest';
import { baseUrl } from '#support/api.js';
import { matrixRow, runId } from '#support/results.js';

describe('marketing funnel', () => {
  it(
    'should keep the query through the /settings/billing redirect [MK-02 P1 smoke]',
    matrixRow('MK-02', 'P1', async () => {
      const probe = `probe-${runId}`;
      const response = await fetch(`${baseUrl}/settings/billing?payment_action=${probe}`, { redirect: 'manual' });
      const location = response.headers.get('location') ?? '';
      const evidence = [
        `${response.status} location ${location}`,
        `Netlify request ${response.headers.get('x-nf-request-id') ?? 'unknown'}`,
      ];
      if (response.status < 300 || response.status > 399) {
        throw new Error(`Expected a redirect: ${evidence.join('; ')}`);
      }
      const isPreserved = new URL(location, baseUrl).searchParams.get('payment_action') === probe;
      return isPreserved ? { outcome: 'pass', evidence } : { outcome: 'fail', defect: 'F-04', evidence };
    }),
  );
});
