import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { urlCarriesCredential } from '@taucad/ui-core/lib/url-credential.lib';
import { loader } from '#routes/invitations.$token/route.js';

type LoaderArguments = Parameters<typeof loader>[0];

const land = (url: string, token: string): Response =>
  loader(mock<LoaderArguments>({ params: { token }, request: new Request(url) }));

/* #2290: an invitation link is a bearer credential, and no page may render at
   an address that holds one. */
describe('/invitations/:token', () => {
  it('redirects to /invitations before anything renders, holding the token in a cookie', () => {
    const response = land('https://tau.new/invitations/AbC-123_xyz', 'AbC-123_xyz');

    expect(response.status).toBe(303);
    const location = response.headers.get('Location') ?? '';
    expect(location).toBe('/invitations');
    expect(urlCarriesCredential(location)).toBe(false);
    expect(response.headers.get('Set-Cookie')).toBe(
      'tau-invitation=AbC-123_xyz; Path=/invitations; Max-Age=86400; SameSite=Lax; Secure',
    );
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('encodes a token it cannot trust to be cookie-safe', () => {
    const response = land('http://localhost:3000/invitations/a%3Bb', 'a;b');

    expect(response.headers.get('Set-Cookie')).toMatch(/^tau-invitation=a%3Bb; Path=\/invitations;/u);
  });
});
