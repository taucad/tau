import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignOut } from '#components/auth/sign-out.js';

const purge = vi.fn();
const signOut = vi.fn();
const navigate = vi.fn();

vi.mock('#providers/financial-session-provider.js', () => ({
  useFinancialSession: () => ({ purge, bind: vi.fn(), capture: vi.fn() }),
}));
vi.mock('@better-auth-ui/react', () => ({
  useAuth: () => ({
    authClient: {},
    basePaths: { auth: '/auth' },
    viewPaths: { auth: { signIn: 'sign-in' } },
    navigate,
  }),
  useSignOut: () => ({ mutate: signOut }),
}));

describe('SignOut', () => {
  beforeEach(() => {
    purge.mockClear();
    signOut.mockClear();
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
