// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderButtons } from '#components/auth/provider-buttons.js';

vi.mock('@better-auth-ui/react', () => ({
  useAuth: () => ({ socialProviders: ['github', { id: 'company-sso', label: 'Company' }] }),
}));
vi.mock('#components/auth/provider-button.js', () => ({
  ProviderButton: ({ provider }: { provider: string }) => <button type='button'>{provider}</button>,
}));
afterEach(cleanup);

describe('configured provider IDs', () => {
  it('passes built-in and custom provider IDs to the sign-in owner', () => {
    render(<ProviderButtons />);
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['github', 'company-sso']);
  });
});
