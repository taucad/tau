import { describe, expect, it } from 'vitest';
import { parseCookies as parseCookiesBetterCall } from 'better-call';
import { parseCookies as parseCookiesBetterAuth } from 'better-auth/cookies';
import { stripSessionSnapshot } from '#session-snapshot.js';
import { isSnapshotName, snapshotHeaderShapes } from '#testing.js';

const data = 'tau.session_data';
const token = 'tau.session_token';

describe('stripSessionSnapshot', () => {
  for (const prefix of ['', '__Secure-']) {
    const n = `${prefix}${data}`;
    const t = `${prefix}${token}`;
    describe(`with the ${prefix === '' ? 'unprefixed' : prefix} names`, () => {
      it.each(snapshotHeaderShapes(n, t))(
        'should leave no snapshot name for either parser in $header',
        ({ header }) => {
          const stripped = stripSessionSnapshot(header, n);
          for (const parse of [parseCookiesBetterCall, parseCookiesBetterAuth]) {
            const names = [...parse(stripped).keys()];
            expect(names.filter((name) => isSnapshotName(name, n))).toEqual([]);
            // The output also never carries the snapshot under the raw name or any trim variant.
            expect(names.some((name) => name.trim().endsWith(data))).toBe(false);
          }
        },
      );

      it.each(snapshotHeaderShapes(n, t))(
        'should keep every other pair in order in $header',
        ({ header, survivors }) => {
          expect(stripSessionSnapshot(header, n)).toBe(survivors.join('; '));
        },
      );
    });
  }

  it('should keep the token readable by better-call when it precedes the snapshot', () => {
    expect(parseCookiesBetterCall(stripSessionSnapshot(` ${token}=t; ${data}=J`, data)).get(token)).toBe('t');
  });

  it('should keep duplicates of other names in their order', () => {
    expect(stripSessionSnapshot(`a=1; ${data}=J; a=2`, data)).toBe('a=1; a=2');
  });

  it('should return an empty string when the snapshot is the only cookie', () => {
    expect(stripSessionSnapshot(`${data}=J`, data)).toBe('');
  });
});
