import { describe, expect, it } from 'vitest';
import { browserIdentityOf } from '#components/runtime-telemetry-identity.js';

describe('browserIdentityOf', () => {
  it('should pin a session on the account id', () => {
    expect(browserIdentityOf({ accountId: 'account-1', isPending: false, isError: false })).toEqual({
      kind: 'signed-in',
      accountId: 'account-1',
    });
  });

  it('should hold a pending or failed session as unresolved, never signed-out', () => {
    expect(browserIdentityOf({ accountId: undefined, isPending: true, isError: false })).toEqual({
      kind: 'unresolved',
    });
    expect(browserIdentityOf({ accountId: undefined, isPending: false, isError: true })).toEqual({
      kind: 'unresolved',
    });
  });

  it('should answer signed-out only when the session settled empty', () => {
    expect(browserIdentityOf({ accountId: undefined, isPending: false, isError: false })).toEqual({
      kind: 'signed-out',
    });
  });
});
