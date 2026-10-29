// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render as renderElement, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderButton } from '#components/auth/provider-button.js';

vi.mock('@better-auth-ui/react', () => ({
  providerIcons: {
    github: (props: React.ComponentProps<'svg'>) => <svg role='img' aria-label='GitHub' {...props} />,
  },
  useAuth: () => ({
    authClient: {},
    baseURL: '',
    redirectTo: '/',
    localization: { auth: { continueWith: 'Continue with {{provider}}' } },
  }),
  useSignInSocial: () => ({ mutate: vi.fn() }),
}));
afterEach(cleanup);

const render = (element: React.ReactElement): void => {
  renderElement(<QueryClientProvider client={new QueryClient()}>{element}</QueryClientProvider>);
};

describe('ProviderButton', () => {
  it('is named by its visible text, so the name says what the button says (WCAG 2.5.3)', () => {
    render(<ProviderButton provider='github' onActiveProviderChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Continue with GitHub' })).toBeInTheDocument();
  });

  it('keeps the visible provider name as the name in the name-only layout', () => {
    render(<ProviderButton provider='google' display='name' onActiveProviderChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Google' })).not.toHaveAttribute('aria-label');
  });

  it('names an icon-only button by its provider', () => {
    render(<ProviderButton provider='github' display='icon' onActiveProviderChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'GitHub' })).toBeInTheDocument();
  });
});
