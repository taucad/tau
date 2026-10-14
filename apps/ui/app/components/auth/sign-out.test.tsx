import { render } from '@testing-library/react';
import * as Cookies from 'es-cookie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignOut } from '#components/auth/sign-out.js';

const purge = vi.fn();
const signOut = vi.fn();
const navigate = vi.fn();
const replaceLocation = vi.fn();
let callbacks: { onSuccess: () => void; onError: (error: Error) => void };

vi.mock('#providers/financial-session-provider.js', () => ({
  useOptionalFinancialSession: () => ({ purge, bind: vi.fn(), capture: vi.fn() }),
}));
vi.mock('@better-auth-ui/react', () => ({
  useAuth: () => ({
    authClient: {},
    basePaths: { auth: '/auth' },
    viewPaths: { auth: { signIn: 'sign-in' } },
    navigate,
  }),
  useSignOut: (_client: unknown, options: typeof callbacks) => {
    callbacks = options;
    return { mutate: signOut };
  },
}));

describe('SignOut', () => {
  beforeEach(() => {
    purge.mockClear();
    signOut.mockClear();
    navigate.mockClear();
    replaceLocation.mockClear();
    Cookies.set('tau-entry', 'app', { path: '/' });
    vi.stubGlobal('location', { replace: replaceLocation });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    Cookies.remove('tau-entry', { path: '/' });
  });

  it('purges financial state before starting the auth mutation', () => {
    render(<SignOut />);
    expect(purge).toHaveBeenCalledWith('logout');
    expect(signOut).toHaveBeenCalledOnce();
    expect(purge.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0] ?? 0);
  });

  it('purges exactly once across re-renders so it cannot re-announce to other tabs', () => {
    const { rerender } = render(<SignOut />);

    rerender(<SignOut className='changed' />);

    expect(purge).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledOnce();
  });
});

describe('SignOut entry routing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    Cookies.remove('tau-entry', { path: '/' });
  });
  it('should record website intent only after successful web logout and reload bare root', () => {
    Cookies.set('tau-entry', 'app', { path: '/' });
    vi.stubGlobal('location', { replace: replaceLocation });
    replaceLocation.mockClear();
    render(<SignOut />);
    expect(Cookies.get('tau-entry')).toBe('app');
    callbacks.onSuccess();
    expect(Cookies.get('tau-entry')).toBe('website');
    expect(replaceLocation).toHaveBeenCalledWith('/');
  });
  it('should keep app preference when logout fails', () => {
    Cookies.set('tau-entry', 'app', { path: '/' });
    vi.stubGlobal('location', { replace: replaceLocation });
    replaceLocation.mockClear();
    render(<SignOut />);
    callbacks.onError(new Error('Session service unavailable'));
    expect(Cookies.get('tau-entry')).toBe('app');
    expect(replaceLocation).not.toHaveBeenCalled();
  });
  it('should keep logout on the website when preference storage is blocked', () => {
    vi.stubGlobal('location', { replace: replaceLocation });
    vi.spyOn(document, 'cookie', 'set').mockImplementation(() => undefined);
    replaceLocation.mockClear();
    render(<SignOut />);
    callbacks.onSuccess();
    expect(replaceLocation).toHaveBeenCalledWith('/?website=1');
  });
  it('should preserve the desktop navigation contract', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    vi.stubGlobal('location', { replace: replaceLocation });
    replaceLocation.mockClear();
    render(<SignOut />);
    callbacks.onSuccess();
    expect(navigate).toHaveBeenCalledWith({ to: '/auth/sign-in', replace: true });
    expect(replaceLocation).not.toHaveBeenCalled();
  });
});
