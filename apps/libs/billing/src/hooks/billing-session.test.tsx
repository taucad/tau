// @vitest-environment jsdom

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
// oxlint-disable-next-line no-restricted-imports -- test targets the adjacent TSX module that the canonical import map cannot resolve.
import { BillingSessionProvider, useBillingSession } from './billing-session.js';

describe('BillingSessionProvider', () => {
  afterEach(cleanup);

  it('defaults to a signed-out session in any tree', () => {
    const { result } = renderHook(() => useBillingSession());
    expect(result.current).toEqual({ apiBaseUrl: undefined, userId: undefined });
  });

  it('provides the injected API URL and user identity', () => {
    const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
      <BillingSessionProvider value={{ apiBaseUrl: 'https://api.example', userId: 'user' }}>
        {children}
      </BillingSessionProvider>
    );
    const { result } = renderHook(() => useBillingSession(), { wrapper });
    expect(result.current).toEqual({ apiBaseUrl: 'https://api.example', userId: 'user' });
  });
});
