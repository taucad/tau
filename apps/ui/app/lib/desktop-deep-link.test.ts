// @vitest-environment node
/**
 * The web half of the `tau://` contract (R4).
 *
 * Every row here is a rule the shell's parser enforces on the other side
 * (`apps/desktop/src/main/deep-links.test.ts`). A link this builder produces
 * that the shell refuses is a dead "Open in Tau Desktop" button, so the two
 * tables are read together.
 */

import { describe, expect, it } from 'vitest';

import { desktopDeepLink } from '#lib/desktop-deep-link.js';

describe('desktopDeepLink', () => {
  it.each([
    ['an invitation token', '/invitations/dKagcFw54jGRJFUwEXU44s8v0', 'tau://invitations/dKagcFw54jGRJFUwEXU44s8v0'],
    ['a share slug', '/s/direct', 'tau://s/direct'],
    ['a share slug with its payload fragment', '/s/direct#e=1&k=abc%2F', 'tau://s/direct#e=1&k=abc%2F'],
    ['a provider-qualified slug', '/s/github-gist~a1b2', 'tau://s/github-gist~a1b2'],
    ['an import page', '/import/github.com/taucad/tau-examples', 'tau://i/github.com/taucad/tau-examples'],
    ['the short import link', '/i/github.com/taucad/tau-examples', 'tau://i/github.com/taucad/tau-examples'],
    ['a trailing slash', '/invitations/tok_abcdef/', 'tau://invitations/tok_abcdef'],
  ])('builds the link for %s', (_label, path, expected) => {
    expect(desktopDeepLink(path)).toBe(expected);
  });

  it.each([
    /* The shell refuses a query on every content link, so an import that needs
       its branch cannot be handed over at all. */
    ['an import link that needs its branch', '/import/github.com/taucad/tau-examples?ref=next'],
    ['a share link carrying a query', '/s/direct?p=1'],
    ['an invitation carrying a query', '/invitations/tok_abcdef?utm=mail'],
    ['a repository path carrying a URL scheme', '/import/https://github.com/taucad/tau-examples'],
    ['an invitation token over 256 characters', `/invitations/${'a'.repeat(257)}`],
    ['a slug over 256 characters', `/s/${'a'.repeat(257)}`],
    ['a token carrying a path traversal', '/invitations/..'],
    ['a token carrying a separator', '/invitations/tok:abcdef'],
    ['an invitation with a fragment', '/invitations/tok_abcdef#k=1'],
    ['an import with a fragment', '/import/github.com/taucad/tau-examples#k=1'],
    ['a fragment outside the share payload alphabet', '/s/direct#k=1/2'],
    ['an empty fragment', '/s/direct#'],
    ['an oversized fragment', `/s/direct#${'a'.repeat(524_289)}`],
    ['a share with no slug', '/s'],
    ['a share with two segments', '/s/direct/extra'],
    ['the bare import page', '/import'],
    ['the desktop Open With import page', '/import?desktop-open=1'],
    ['a route the shell does not serve', '/projects'],
    ['the root', '/'],
    ['an empty path', ''],
  ])('offers nothing for %s', (_label, path) => {
    expect(desktopDeepLink(path)).toBeUndefined();
  });

  it('accepts a fragment at the share limit and refuses one character more', () => {
    expect(desktopDeepLink(`/s/direct#${'a'.repeat(524_288)}`)).toBeDefined();
    expect(desktopDeepLink(`/s/direct#${'a'.repeat(524_289)}`)).toBeUndefined();
  });
});
