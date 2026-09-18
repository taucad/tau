import { describe, expect, it } from 'vitest';

import { deepLinkArgument, deepLinkFragmentMaxCharacters, parseDeepLink } from '#main/deep-links.js';
import type { DeepLink } from '#main/deep-links.js';

/*
 * The table is the specification. A custom scheme has no ownership proof, so
 * every row that is refused is a row some other application on the machine — or
 * any page that can navigate to `tau://` — could otherwise have used.
 *
 * Note the parser reality these rows encode: in a custom-scheme URL the WHATWG
 * parser reads `tau://invitations/x` as host `invitations` and path `/x`.
 */
const admitted: ReadonlyArray<readonly [string, string, DeepLink]> = [
  [
    'an invitation token',
    'tau://invitations/dKagcFw54jGRJFUwEXU44s8v0nhIKfQojcy0lsb-u3U',
    { kind: 'invitation', route: '/invitations/dKagcFw54jGRJFUwEXU44s8v0nhIKfQojcy0lsb-u3U' },
  ],
  ['an uppercase scheme', 'TAU://invitations/token', { kind: 'invitation', route: '/invitations/token' }],
  ['a direct share slug', 'tau://s/direct', { kind: 'share', route: '/s/direct' }],
  [
    'a provider-qualified share slug',
    'tau://s/github-gist~0a1b2c3d',
    { kind: 'share', route: '/s/github-gist~0a1b2c3d' },
  ],
  [
    'a direct share carrying its payload in the fragment',
    'tau://s/direct#v=2&jwe=a.b.c.d.e',
    { kind: 'share', route: '/s/direct#v=2&jwe=a.b.c.d.e' },
  ],
  [
    'a percent-encoded fragment field',
    'tau://s/direct#v=2&p=pass%2Bword',
    { kind: 'share', route: '/s/direct#v=2&p=pass%2Bword' },
  ],
  ['a single-segment import', 'tau://i/tau-examples', { kind: 'import', route: '/i/tau-examples' }],
  [
    'a multi-segment import repository',
    'tau://i/github.com/taucad/tau-examples',
    { kind: 'import', route: '/i/github.com/taucad/tau-examples' },
  ],
  [
    'a sign-in callback',
    'tau://auth/callback?ott=A1b2C3d4&state=dGhlLXN0YXRl',
    { kind: 'auth-callback', oneTimeToken: 'A1b2C3d4', state: 'dGhlLXN0YXRl' },
  ],
  /* The WHATWG parser resolves dot segments before this module sees a path, so
   * these are not traversals to refuse — they are the routes they normalise to.
   * The percent-encoded rows below prove nothing sneaks past that resolution. */
  ['a dot segment the parser resolves away', 'tau://i/./taucad', { kind: 'import', route: '/i/taucad' }],
  ['a dot-dot segment the parser resolves away', 'tau://i/taucad/../etc', { kind: 'import', route: '/i/etc' }],
  ['an empty fragment marker', 'tau://s/direct#', { kind: 'share', route: '/s/direct' }],
];

const refused: ReadonlyArray<readonly [string, string]> = [
  ['an opaque path with no authority', 'tau:invitations/x'],
  ['an uppercase host', 'tau://Invitations/token'],
  ['userinfo', 'tau://user@invitations/token'],
  ['a password', 'tau://user:secret@invitations/token'],
  ['a port', 'tau://invitations:8080/token'],
  ['an empty authority', 'tau:///invitations/token'],
  ['a percent-encoded path traversal', 'tau://i/%2e%2e%2fetc'],
  ['a percent-encoded slash inside a segment', 'tau://i/..%2fetc'],
  ['a dot-dot segment that escapes the root', 'tau://i/taucad/..'],
  ['an empty invitation token', 'tau://invitations/'],
  ['a missing invitation token', 'tau://invitations'],
  ['an extra invitation segment', 'tau://invitations/token/extra'],
  ['a trailing slash', 'tau://invitations/token/'],
  ['an empty path segment', 'tau://i//taucad'],
  ['a query on a content link', 'tau://invitations/token?next=/admin'],
  ['a fragment on an invitation', 'tau://invitations/token#v=2'],
  ['a fragment on an import', 'tau://i/taucad/examples#v=2'],
  ['an over-length identifier', `tau://invitations/${'a'.repeat(257)}`],
  ['an over-length fragment', `tau://s/direct#v=${'a'.repeat(deepLinkFragmentMaxCharacters)}`],
  ['a fragment outside the share payload charset', 'tau://s/direct#v=2&jwe=a/b?c'],
  ['an unknown host', 'tau://projects/abc'],
  ['a bare host with no path', 'tau://auth'],
  ['an unknown auth path', 'tau://auth/token?ott=A1b2C3d4&state=dGhlLXN0YXRl'],
  ['a callback with no one-time token', 'tau://auth/callback?state=dGhlLXN0YXRl'],
  ['a callback with no state', 'tau://auth/callback?ott=A1b2C3d4'],
  ['a callback whose state is too short', 'tau://auth/callback?ott=A1b2C3d4&state=short'],
  ['a callback carrying an extra parameter', 'tau://auth/callback?ott=A1b2C3d4&state=dGhlLXN0YXRl&next=/admin'],
  ['a callback carrying a fragment', 'tau://auth/callback?ott=A1b2C3d4&state=dGhlLXN0YXRl#x'],
  // oxlint-disable-next-line eslint/no-script-url -- the row exists precisely to prove this is refused
  ['a javascript: URL', 'javascript:alert(1)'],
  ['an https: URL', 'https://tau.new/invitations/token'],
  ['an app: URL', 'app://tau/invitations/token'],
  ['a scheme that merely starts with tau', 'taunt://invitations/token'],
  ['a filesystem path', '/Users/someone/Documents/part.step'],
  ['a command-line flag', '--inspect=9229'],
  ['an empty string', ''],
];

describe('parseDeepLink', () => {
  it.each(admitted)('should admit %s', (_name, value, expected) => {
    expect(parseDeepLink(value)).toEqual(expected);
  });

  it.each(refused)('should refuse %s', (_name, value) => {
    expect(parseDeepLink(value)).toBeUndefined();
  });

  /* The fragment is the whole payload of a direct share, so the cap is the one
   * the share package already defends a direct URL with. */
  it('should admit a fragment at the cap and refuse one character more', () => {
    const body = `v=2&zip=${'A'.repeat(deepLinkFragmentMaxCharacters - 8)}`;
    expect(body).toHaveLength(deepLinkFragmentMaxCharacters);
    expect(parseDeepLink(`tau://s/direct#${body}`)).toEqual({ kind: 'share', route: `/s/direct#${body}` });
    expect(parseDeepLink(`tau://s/direct#${body}A`)).toBeUndefined();
  });

  /* Every admitted content link carries a route main can load as-is: nothing in
   * main concatenates an unvalidated identifier into a URL. */
  it('should only ever produce a route built from validated segments', () => {
    for (const [, value] of admitted) {
      const link = parseDeepLink(value);
      if (link !== undefined && link.kind !== 'auth-callback') {
        expect(link.route.startsWith('/')).toBe(true);
        expect(new URL(link.route, 'app://tau/').href.startsWith('app://tau/')).toBe(true);
      }
    }
  });
});

describe('deepLinkArgument', () => {
  it('should find the first tau: argument whatever its case', () => {
    expect(deepLinkArgument(['--inspect', 'TAU://s/direct', 'tau://i/x'])).toBe('TAU://s/direct');
  });

  it('should return the argument even when it will be refused, so the refusal can be logged', () => {
    expect(deepLinkArgument(['tau://projects/abc'])).toBe('tau://projects/abc');
  });

  it('should ignore argv with no deep link', () => {
    expect(deepLinkArgument(['/Applications/Tau.app', '/tmp/part.step'])).toBeUndefined();
  });
});
