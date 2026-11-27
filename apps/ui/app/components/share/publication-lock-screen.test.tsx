import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { PublicationLockScreen } from '#components/share/publication-lock-screen.js';

describe('PublicationLockScreen (app binding)', () => {
  it('links sign-in, sign-up and switch-account back to the page it is shown on', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/s/tau~pub']}>
        <PublicationLockScreen variant='signInRequired' />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/auth/magic-link?redirectTo=%2Fs%2Ftau~pub',
    );
    expect(screen.getByRole('link', { name: /create account/i })).toHaveAttribute(
      'href',
      '/auth/sign-up?redirectTo=%2Fs%2Ftau~pub',
    );
    unmount();

    render(
      <MemoryRouter initialEntries={['/s/tau~pub']}>
        <PublicationLockScreen variant='accessDenied' />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /switch account/i })).toHaveAttribute(
      'href',
      '/auth/sign-out?redirectTo=%2Fs%2Ftau~pub',
    );
  });
});
