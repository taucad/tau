import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBillingNavRoutes as useCloudRoutes } from '#cloud/nav-billing.cloud.js';
import { useBillingNavRoutes as useSelfHostRoutes } from '#cloud/nav-billing.self-host.js';

describe('billing navigation build boundary', () => {
  it('emits Usage only for Tau Cloud', () => {
    expect(renderHook(() => useSelfHostRoutes()).result.current).toStrictEqual([]);
    expect(renderHook(() => useCloudRoutes()).result.current.map(({ title, url }) => ({ title, url }))).toStrictEqual([
      { title: 'Usage', url: '/usage' },
    ]);
  });
});
