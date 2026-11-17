// @vitest-environment jsdom
import * as Cookies from 'es-cookie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearPendingInvitation,
  holdPendingInvitation,
  pendingInvitationCookie,
  readPendingInvitation,
} from '#lib/pending-invitation.lib.js';

describe('pending invitation', () => {
  beforeEach(() => {
    // The cookie is scoped to `/invitations`, so the document has to be there to see it.
    globalThis.history.replaceState({}, '', '/invitations');
    globalThis.sessionStorage.clear();
  });

  afterEach(() => {
    clearPendingInvitation();
    globalThis.history.replaceState({}, '', '/');
  });

  it('scopes the server cookie to /invitations, never past a day, and secure on https', () => {
    expect(pendingInvitationCookie('AbC-123_xyz', 'https://tau.new/invitations/AbC-123_xyz')).toBe(
      'tau-invitation=AbC-123_xyz; Path=/invitations; Max-Age=86400; SameSite=Lax; Secure',
    );
    expect(pendingInvitationCookie('AbC', 'http://localhost:3000/invitations/AbC')).not.toContain('Secure');
  });

  it('reads back the token the web server held in the cookie, and clears it', () => {
    // As the browser stores the server's cookie: scoped to `/invitations`.
    Cookies.set('tau-invitation', 'AbC-123_xyz', { path: '/invitations' });
    expect(readPendingInvitation()).toBe('AbC-123_xyz');

    clearPendingInvitation();
    expect(readPendingInvitation()).toBeUndefined();
  });

  it('reads back the token the desktop shell held in session storage, and clears it', () => {
    holdPendingInvitation('desktop-token');
    expect(readPendingInvitation()).toBe('desktop-token');

    clearPendingInvitation();
    expect(readPendingInvitation()).toBeUndefined();
  });

  it('holds nothing by default', () => {
    expect(readPendingInvitation()).toBeUndefined();
  });
});
