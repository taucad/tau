import { describe, expect, it } from 'vitest';
import { billingNavRoutes as cloudRoutes } from '#cloud/nav-billing.cloud.js';
import { billingNavRoutes as selfHostRoutes } from '#cloud/nav-billing.self-host.js';

describe('billing navigation build boundary', () => {
  it('emits Usage only for Tau Cloud', () => {
    expect(selfHostRoutes).toStrictEqual([]);
    expect(cloudRoutes.map(({ title, url }) => ({ title, url }))).toStrictEqual([{ title: 'Usage', url: '/usage' }]);
  });
});
