// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- extends Vitest matchers for DOM assertions.
import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as VerifyEmailModule from '#components/auth/verify-email.js';
import * as Cookies from 'es-cookie';
import AuthPage from '#routes/auth.$/route.js';

const routeMocks = vi.hoisted(() => ({
  segment: 'sign-in',
  search: '',
  isSuccess: true,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
  navigate: vi.fn(),
  session: undefined as { user: { id: string } } | undefined,
}));

vi.mock('react-router', () => ({
  Link: ({ children, to, ...properties }: React.ComponentProps<'a'> & { readonly to: string }) => (
    <a {...properties} href={to} rel='noreferrer'>
      {children}
    </a>
  ),
  useParams: () => ({ '*': routeMocks.segment }),
  useNavigate: () => routeMocks.navigate,
  useSearchParams: () => [new URLSearchParams(routeMocks.search)],
}));

vi.mock('@better-auth-ui/react', () => ({
  useSession: () => ({
    data: routeMocks.session,
    isSuccess: routeMocks.isSuccess,
    isFetching: routeMocks.isFetching,
    isError: routeMocks.isError,
    refetch: routeMocks.refetch,
  }),
}));

vi.mock('#components/auth/auth-email-draft.js', () => ({
  AuthEmailDraftProvider: ({ children }: React.PropsWithChildren): React.ReactNode => children,
}));

vi.mock('#components/auth/auth.js', () => ({
  Auth: ({ path }: { readonly path?: string }) => <div>auth:{path}</div>,
}));

vi.mock('#components/auth/magic-link-verify.js', () => ({
  MagicLinkVerify: () => <div>magic-link-verify</div>,
}));

vi.mock('#components/auth/verify-email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof VerifyEmailModule>()),
  VerifyEmail: () => <div>verify-email</div>,
}));

vi.mock('@taucad/ui/components/tooltip', () => ({
  Tooltip: ({ children }: React.PropsWithChildren): React.ReactNode => children,
  TooltipContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  TooltipTrigger: ({ children }: React.PropsWithChildren): React.ReactNode => children,
}));

vi.mock('@taucad/ui/components/client-only', () => ({
  ClientOnly: () => null,
}));

describe('AuthPage', () => {
  beforeEach(() => {
    routeMocks.isFetching = false;
    routeMocks.isSuccess = true;
    routeMocks.isError = false;
    routeMocks.segment = 'sign-in';
    routeMocks.search = '';
    routeMocks.session = undefined;
    routeMocks.navigate.mockClear();
  });

  it.each(['sign-in', 'sign-up', 'magic-link/verify', 'verify-email'])(
    'should replace an explicit website preference before %s completes',
    (segment) => {
      Cookies.set('tau-entry', 'website', { path: '/' });
      routeMocks.segment = segment;
      render(<AuthPage />);
      expect(Cookies.get('tau-entry')).toBe('app');
      Cookies.remove('tau-entry', { path: '/' });
    },
  );

  it('routes magic-link verification links to the callback surface', () => {
    routeMocks.segment = 'magic-link/verify';

    render(<AuthPage />);

    expect(screen.getByText('magic-link-verify')).toBeInTheDocument();
    expect(screen.queryByText('auth:magic-link/verify')).not.toBeInTheDocument();
  });

  it('keeps existing verify-email callback routing', () => {
    routeMocks.segment = 'verify-email';

    render(<AuthPage />);

    expect(screen.getByText('verify-email')).toBeInTheDocument();
  });

  it.each(['sign-in', 'sign-up'])('continues a signed-in browser from %s to the held destination', (segment) => {
    routeMocks.segment = segment;
    routeMocks.search = '?redirectTo=%2Fauth%2Fdesktop%3Fstate%3Dabc';
    routeMocks.session = { user: { id: 'user_1' } };

    render(<AuthPage />);

    expect(routeMocks.navigate).toHaveBeenCalledWith('/auth/desktop?state=abc', { replace: true });
    expect(screen.queryByText(`auth:${segment}`)).not.toBeInTheDocument();
  });

  it('keeps a signed-in browser on the other auth pages', () => {
    routeMocks.segment = 'sign-out';
    routeMocks.session = { user: { id: 'user_1' } };

    render(<AuthPage />);

    expect(routeMocks.navigate).not.toHaveBeenCalled();
  });

  /*
   * The desktop window cannot host the flow: main sends the provider navigation
   * to the system browser, so a form rendered here can only end at the
   * provider's `state_mismatch`. Every bridged view must reach the shell instead,
   * however the user arrived — a plain link included.
   */
  describe('inside the Electron shell', () => {
    const signIn = vi.fn(async () => undefined);
    const signOut = vi.fn(async () => undefined);

    beforeEach(() => {
      vi.stubEnv('TAU_TARGET', 'desktop');
      globalThis.window.tauAuth = { signIn, signOut, onAuthChanged: () => () => undefined };
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      delete globalThis.window.tauAuth;
      signIn.mockClear();
      signOut.mockClear();
    });

    it.each([
      ['sign-in', 'signIn'],
      ['sign-up', 'signIn'],
      ['sign-out', 'signOut'],
    ] as const)('hands %s to the shell instead of rendering it', (segment, bridged) => {
      routeMocks.segment = segment;

      render(<AuthPage />);

      expect(screen.queryByText(`auth:${segment}`)).not.toBeInTheDocument();
      expect(bridged === 'signIn' ? signIn : signOut).toHaveBeenCalledTimes(1);
    });

    /* The link a signed-out desktop was holding (`tau://invitations/…`,
       `tau://s/…`) rides `redirectTo`; main only reports that the session
       changed, so this panel is what has to open it. */
    it('opens the held link once the browser hands the session back', () => {
      routeMocks.search = '?redirectTo=%2Fs%2Ftau~pub_123';
      const view = render(<AuthPage />);
      expect(routeMocks.navigate).not.toHaveBeenCalled();

      routeMocks.session = { user: { id: 'user_1' } };
      view.rerender(<AuthPage />);

      expect(routeMocks.navigate).toHaveBeenCalledWith('/s/tau~pub_123', { replace: true });
    });

    it('never follows a held link that leaves the app', () => {
      routeMocks.search = '?redirectTo=https%3A%2F%2Fexample.com%2Fsteal';
      routeMocks.session = { user: { id: 'user_1' } };

      render(<AuthPage />);

      expect(routeMocks.navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('offers a second attempt when the browser never opened', async () => {
      routeMocks.segment = 'sign-in';

      render(<AuthPage />);
      await userEvent.click(screen.getByRole('button', { name: /open my browser again/i }));

      expect(screen.getByText(/continue in your browser/i)).toBeInTheDocument();
      expect(signIn).toHaveBeenCalledTimes(2);
    });

    it('fails closed with no embedded form when the desktop bridge is missing', () => {
      delete globalThis.window.tauAuth;

      for (const segment of ['sign-in', 'sign-up', 'sign-out']) {
        routeMocks.segment = segment;
        const view = render(<AuthPage />);

        expect(screen.queryByText(`auth:${segment}`)).not.toBeInTheDocument();
        expect(screen.getByText(/sign-in is unavailable/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /open my browser again/i })).not.toBeInTheDocument();
        view.unmount();
      }
    });

    it('keeps the handoff panel when the shell rejects the sign-in call', async () => {
      signIn.mockRejectedValueOnce(new Error('loopback failed'));
      routeMocks.segment = 'sign-in';

      render(<AuthPage />);
      await Promise.resolve();

      expect(screen.queryByText('auth:sign-in')).not.toBeInTheDocument();
      expect(screen.getByText(/continue in your browser/i)).toBeInTheDocument();
    });

    it('still renders callback surfaces the browser lands on', () => {
      routeMocks.segment = 'verify-email';

      render(<AuthPage />);

      expect(screen.getByText('verify-email')).toBeInTheDocument();
      expect(signIn).not.toHaveBeenCalled();
    });
  });
});

describe('Auth session continuation', () => {
  beforeEach(() => {
    routeMocks.segment = 'sign-in';
    routeMocks.session = undefined;
    routeMocks.isFetching = true;
    routeMocks.isSuccess = false;
    routeMocks.isError = false;
    routeMocks.navigate.mockClear();
  });
  it('should never mount the form while pending or when the session arrives', () => {
    const view = render(<AuthPage />);
    expect(screen.getByRole('status', { name: 'Opening Tau' })).toBeInTheDocument();
    expect(screen.queryByText('auth:sign-in')).not.toBeInTheDocument();
    routeMocks.session = { user: { id: 'returning' } };
    routeMocks.isFetching = false;
    routeMocks.isSuccess = true;
    view.rerender(<AuthPage />);
    expect(screen.queryByText('auth:sign-in')).not.toBeInTheDocument();
    expect(routeMocks.navigate).toHaveBeenCalled();
    expect(document.cookie).toContain('tau-entry=app');
  });
  it('should expose the form only after a confirmed anonymous response', () => {
    const view = render(<AuthPage />);
    routeMocks.isFetching = false;
    routeMocks.isSuccess = true;
    view.rerender(<AuthPage />);
    expect(screen.getByText('auth:sign-in')).toBeInTheDocument();
  });
  it('should retry a failed session without exposing the form', async () => {
    routeMocks.isError = true;
    routeMocks.isFetching = false;
    routeMocks.refetch.mockClear();
    const view = render(<AuthPage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(routeMocks.refetch).toHaveBeenCalledOnce();
    expect(screen.queryByText('auth:sign-in')).not.toBeInTheDocument();
    routeMocks.isError = false;
    routeMocks.isSuccess = true;
    routeMocks.session = { user: { id: 'returning' } };
    view.rerender(<AuthPage />);
    expect(screen.queryByText('auth:sign-in')).not.toBeInTheDocument();
    expect(routeMocks.navigate).toHaveBeenCalled();
  });
  it('should keep an established anonymous form mounted during background refresh', () => {
    routeMocks.isSuccess = true;
    routeMocks.isFetching = false;
    const view = render(<AuthPage />);
    expect(screen.getByText('auth:sign-in')).toBeInTheDocument();
    routeMocks.isFetching = true;
    view.rerender(<AuthPage />);
    expect(screen.getByText('auth:sign-in')).toBeInTheDocument();
  });
  it('should bound an unresponsive session and let the visitor explicitly choose the form', async () => {
    vi.useFakeTimers();
    try {
      render(<AuthPage />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(screen.getByRole('alert')).toHaveTextContent("couldn't check your session");
      expect(screen.queryByText('auth:sign-in')).not.toBeInTheDocument();
      vi.useRealTimers();
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Continue to sign in' }));
      expect(screen.getByText('auth:sign-in')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Cached session and safe continuation', () => {
  it('should not expose a stale anonymous form during session refresh', () => {
    routeMocks.segment = 'sign-in';
    routeMocks.session = undefined;
    routeMocks.isSuccess = true;
    routeMocks.isFetching = true;
    const view = render(<AuthPage />);
    expect(screen.queryByText('auth:sign-in')).not.toBeInTheDocument();
    routeMocks.session = { user: { id: 'returning' } };
    routeMocks.isFetching = false;
    view.rerender(<AuthPage />);
    expect(screen.queryByText('auth:sign-in')).not.toBeInTheDocument();
  });
  it.each(['sign-in', 'sign-up'])('should continue home instead of looping back to %s', (destination) => {
    routeMocks.segment = 'sign-in';
    routeMocks.search = `?redirectTo=%2Fauth%2F${destination}`;
    routeMocks.session = { user: { id: 'returning' } };
    routeMocks.isSuccess = true;
    routeMocks.isFetching = false;
    render(<AuthPage />);
    expect(routeMocks.navigate).toHaveBeenLastCalledWith('/', { replace: true });
  });
});
