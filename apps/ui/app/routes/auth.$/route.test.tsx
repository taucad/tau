// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- extends Vitest matchers for DOM assertions.
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as VerifyEmailModule from '#components/auth/verify-email.js';
import AuthPage from '#routes/auth.$/route.js';

const routeMocks = vi.hoisted(() => ({
  segment: 'sign-in',
  search: '',
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
  useSession: () => ({ data: routeMocks.session }),
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

vi.mock('#components/ui/utils/client-only.js', () => ({
  ClientOnly: () => null,
}));

describe('AuthPage', () => {
  beforeEach(() => {
    routeMocks.segment = 'sign-in';
    routeMocks.search = '';
    routeMocks.session = undefined;
    routeMocks.navigate.mockClear();
  });

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
