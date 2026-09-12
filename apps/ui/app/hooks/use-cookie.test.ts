/**
 * The one thing this store has to get right per target: `app://` is not a
 * cookieable scheme, so the desktop build must persist through `localStorage`
 * while the web build stays on cookies.
 */
import * as Cookies from 'es-cookie';
import { afterEach, expect, it, vi } from 'vitest';
import { readPreferenceCookies, store } from '#hooks/use-cookie.js';

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.localStorage.clear();
  Cookies.remove('tau-cad-kernel');
});

it('writes preferences to cookies on the web target', () => {
  store.update('tau-cad-kernel', 'openscad');

  expect(Cookies.get('tau-cad-kernel')).toBe('"openscad"');
  expect(globalThis.localStorage.getItem('tau-cad-kernel')).toBeNull();
});

it('writes preferences to localStorage on the desktop target', () => {
  vi.stubEnv('TAU_TARGET', 'desktop');

  store.update('tau-cad-kernel', 'openscad');

  expect(globalThis.localStorage.getItem('tau-cad-kernel')).toBe('"openscad"');
  expect(Cookies.get('tau-cad-kernel')).toBeUndefined();
});

it('reads back a desktop preference the cache has not seen', () => {
  vi.stubEnv('TAU_TARGET', 'desktop');
  globalThis.localStorage.setItem('tau-chat-model', '"tau-replay"');

  expect(store.get('tau-chat-model')).toBe('tau-replay');
});

it('removes a desktop preference', () => {
  vi.stubEnv('TAU_TARGET', 'desktop');
  store.update('tau-sidebar-op', true);

  store.remove('tau-sidebar-op');

  expect(globalThis.localStorage.getItem('tau-sidebar-op')).toBeNull();
  expect(store.get('tau-sidebar-op')).toBeUndefined();
});

/**
 * B5 R2: the root loader used to serialise the whole `Cookie` header into the
 * document. The prerendered offline shell is cached, so only named preferences
 * may cross that boundary.
 */
it('projects named UI preferences and drops everything else', () => {
  const projected = readPreferenceCookies(
    'tau-cad-kernel=%22openscad%22; tau-sidebar-op=true; better-auth.session_token=secret-session; tau-theme=%22dark%22; unrelated=1',
  );

  expect(projected).toStrictEqual({ 'tau-cad-kernel': '"openscad"', 'tau-sidebar-op': 'true' });
});

it('never projects an authentication cookie, however it is named', () => {
  const projected = readPreferenceCookies('__Secure-tau.session=abc; tau-session=abc; tau_session=abc');

  expect(Object.keys(projected)).toStrictEqual([]);
});

it('returns an empty projection when the request has no cookies', () => {
  expect(readPreferenceCookies(undefined)).toStrictEqual({});
  expect(readPreferenceCookies('')).toStrictEqual({});
});
