// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AuthPage from '#routes/auth.$/route.js';

const routeMocks = vi.hoisted(() => ({
  segment: 'sign-in',
}));

vi.mock('react-router', () => ({
  Link: ({ children, to, ...properties }: React.ComponentProps<'a'> & { readonly to: string }) => (
    <a {...properties} href={to}>
      {children}
    </a>
  ),
  useParams: () => ({ '*': routeMocks.segment }),
}));

vi.mock('#components/auth/auth-email-draft.js', () => ({
  AuthEmailDraftProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('#components/auth/auth.js', () => ({
  Auth: ({ path }: { readonly path?: string }) => <div>auth:{path}</div>,
}));

vi.mock('#components/auth/magic-link-verify.js', () => ({
  MagicLinkVerify: () => <div>magic-link-verify</div>,
}));

vi.mock('#components/auth/verify-email.js', () => ({
  VerifyEmail: () => <div>verify-email</div>,
}));

vi.mock('@taucad/ui/components/tooltip', () => ({
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
  TooltipContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  TooltipTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('#components/ui/utils/client-only.js', () => ({
  ClientOnly: () => null,
}));

describe('AuthPage', () => {
  beforeEach(() => {
    routeMocks.segment = 'sign-in';
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

    it('offers a second attempt when the browser never opened', async () => {
      routeMocks.segment = 'sign-in';

      render(<AuthPage />);
      await userEvent.click(screen.getByRole('button', { name: /open my browser again/i }));

      expect(screen.getByText(/continue in your browser/i)).toBeInTheDocument();
      expect(signIn).toHaveBeenCalledTimes(2);
    });

    it('still renders callback surfaces the browser lands on', () => {
      routeMocks.segment = 'verify-email';

      render(<AuthPage />);

      expect(screen.getByText('verify-email')).toBeInTheDocument();
      expect(signIn).not.toHaveBeenCalled();
    });
  });
});
