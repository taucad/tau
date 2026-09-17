import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ChatErrorUnauthorized } from '#routes/w.$workspace.$project/chat-error-unauthorized.js';

vi.mock('#hooks/use-auth-links.js', () => ({
  useAuthLinks: () => ({
    signIn: '/auth/sign-in?redirectTo=%2Fw%2Fhome%2Fp',
    signUp: '/auth/sign-up?redirectTo=%2Fw%2Fhome%2Fp',
  }),
}));

describe('ChatErrorUnauthorized', () => {
  it('should offer sign-in first and account creation second, stacked by card width', () => {
    const { container } = render(
      <MemoryRouter>
        <ChatErrorUnauthorized />
      </MemoryRouter>,
    );

    expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Sign in', 'Create account']);
    expect(links[0]).toHaveAttribute('href', '/auth/sign-in?redirectTo=%2Fw%2Fhome%2Fp');
    expect(links[1]).toHaveAttribute('href', '/auth/sign-up?redirectTo=%2Fw%2Fhome%2Fp');
    const actions = container.querySelector('[data-slot="chat-error-card-actions"]');
    expect(actions).toHaveClass('@xs:flex-row');
    expect(actions?.className).not.toContain('sm:flex-row ');
  });
});
