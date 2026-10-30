/* eslint-disable @typescript-eslint/naming-convention -- PGAPPNAME is libpq's environment variable */
import { describe, expect, it } from 'vitest';
import { applicationNameOf } from '#database/application-name.js';

describe('applicationNameOf (W14 OB3)', () => {
  it('should name a process for `tau.db.connections`', () => {
    expect(applicationNameOf('billing-operations', {})).toBe('tau-billing-operations');
  });

  it('should keep PGAPPNAME when the environment sets one, so a harness can still find its worker', () => {
    expect(applicationNameOf('billing-operations', { PGAPPNAME: 'tau-billing-i5-test' })).toBe('tau-billing-i5-test');
    expect(applicationNameOf('api', { PGAPPNAME: '' })).toBe('tau-api');
  });
});
