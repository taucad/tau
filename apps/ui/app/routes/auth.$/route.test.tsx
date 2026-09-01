// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
});
