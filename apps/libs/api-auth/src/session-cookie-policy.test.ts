import { describe, expect, it } from 'vitest';
import { issuedOversizeSnapshot, sessionCookiePolicy, snapshotByteBudget } from '#session-cookie-policy.js';
import type { SessionCookiePolicyInput } from '#session-cookie-policy.js';

const data = 'tau.session_data';
const attributes = 'Path=/; HttpOnly; SameSite=Lax';
const snapshot = (maxAge: string | undefined, value = 'J', name = data): string =>
  `${name}=${value}${maxAge === undefined ? '' : `; Max-Age=${maxAge}`}; ${attributes}`;
const snapshotExpiry = `${data}=; Max-Age=0; ${attributes}`;
const tokenSet = `tau.session_token=t.s; Max-Age=604800; ${attributes}`;
const tokenExpiry = `tau.session_token=; Max-Age=0; ${attributes}`;
const dontRemember = `tau.dont_remember=true.s; ${attributes}`;
const other = `tau.state=x; Max-Age=600; ${attributes}`;

/** An entry of exactly `bytes` bytes with the configured Max-Age. */
const sized = (bytes: number): string => {
  const shell = snapshot('60', '');
  const value = 'A'.repeat(bytes - Buffer.byteLength(shell));
  const entry = snapshot('60', value);
  expect(Buffer.byteLength(entry)).toBe(bytes);
  return entry;
};

const run = (
  surface: SessionCookiePolicyInput['surface'],
  setCookies: readonly string[],
  overrides: Partial<SessionCookiePolicyInput> = {},
): readonly string[] =>
  sessionCookiePolicy({
    setCookies,
    surface,
    hasAuthorization: false,
    sessionDataName: data,
    maxAgeSeconds: 60,
    ...overrides,
  });

describe('sessionCookiePolicy', () => {
  describe('with the flag at 0', () => {
    it('should forward nothing on a Tau route', () => {
      expect(run('tau', [snapshotExpiry, snapshot('60'), tokenSet, other], { maxAgeSeconds: 0 })).toEqual([]);
    });

    it('should pass everything outside the snapshot family and only expiries inside it on /v1/auth/*', () => {
      expect(run('auth', [snapshotExpiry, snapshot('60'), tokenSet, other], { maxAgeSeconds: 0 })).toEqual([
        snapshotExpiry,
        tokenSet,
        other,
      ]);
    });
  });

  for (const surface of ['tau', 'auth'] as const) {
    describe(`on the ${surface} surface`, () => {
      const passesOutsideFamily = surface === 'auth';

      it('should drop every snapshot entry, expiry included, when the request carried Authorization', () => {
        expect(run(surface, [snapshot('60')], { hasAuthorization: true })).toEqual([]);
        expect(run(surface, [snapshotExpiry], { hasAuthorization: true })).toEqual([]);
      });

      it(`should ${passesOutsideFamily ? 'keep' : 'drop'} a session_token set and expiry`, () => {
        expect(run(surface, [tokenSet, tokenExpiry])).toEqual(passesOutsideFamily ? [tokenSet, tokenExpiry] : []);
      });

      it(`should ${passesOutsideFamily ? 'keep' : 'drop'} dont_remember`, () => {
        expect(run(surface, [dontRemember])).toEqual(passesOutsideFamily ? [dontRemember] : []);
      });

      it('should drop a snapshot without Max-Age', () => {
        expect(run(surface, [snapshot(undefined)])).toEqual([]);
      });

      it('should drop a snapshot with a Max-Age other than the configured one', () => {
        expect(run(surface, [snapshot('300')])).toEqual([]);
      });

      it('should keep a snapshot with the configured Max-Age', () => {
        expect(run(surface, [snapshot('60')])).toEqual([snapshot('60')]);
      });

      it('should keep a snapshot at the byte budget and drop one a byte over it', () => {
        expect(run(surface, [sized(snapshotByteBudget)])).toHaveLength(1);
        expect(run(surface, [sized(snapshotByteBudget + 1)])).toEqual([]);
      });

      it('should drop chunks even with the configured Max-Age', () => {
        expect(run(surface, [snapshot('60', 'J', `${data}.0`), snapshot('60', 'K', `${data}.1`)])).toEqual([]);
      });

      it('should keep a snapshot expiry', () => {
        expect(run(surface, [snapshotExpiry])).toEqual([snapshotExpiry]);
      });

      it('should keep an expiry followed by a set for the same name, in order', () => {
        expect(run(surface, [snapshotExpiry, snapshot('60')])).toEqual([snapshotExpiry, snapshot('60')]);
      });

      it('should match max-age in lower case', () => {
        const lower = `${data}=J; max-age=60; ${attributes}`;
        expect(run(surface, [lower])).toEqual([lower]);
      });

      it('should never reorder what it keeps', () => {
        const kept = run(surface, [other, snapshotExpiry, tokenSet, snapshot('60')]);
        expect(kept).toEqual(
          passesOutsideFamily ? [other, snapshotExpiry, tokenSet, snapshot('60')] : [snapshotExpiry, snapshot('60')],
        );
      });
    });
  }
});

describe('issuedOversizeSnapshot', () => {
  it('should report a chunked snapshot', () => {
    expect(issuedOversizeSnapshot([snapshot('60', 'J', `${data}.0`)], data)).toBe(true);
  });

  it('should report an unchunked snapshot over the budget', () => {
    expect(issuedOversizeSnapshot([sized(snapshotByteBudget + 1)], data)).toBe(true);
  });

  it('should not report a snapshot within the budget, an expiry or another cookie', () => {
    expect(issuedOversizeSnapshot([snapshot('60'), snapshotExpiry, `${data}.0=; Max-Age=0`, tokenSet], data)).toBe(
      false,
    );
  });
});
