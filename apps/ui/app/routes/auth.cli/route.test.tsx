/* eslint-disable @typescript-eslint/naming-convention -- RFC 8628 wire fields. */
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthCliRoute from '#routes/auth.cli/route.js';
const mocks = vi.hoisted(() => ({ search: '?user_code=ABCD-EFGH', verify: vi.fn(), approve: vi.fn(), deny: vi.fn() }));
vi.mock('react-router', () => ({ useLocation: () => ({ search: mocks.search }) }));
vi.mock('@better-auth-ui/react', () => ({
  useAuthenticate: () => ({ data: { user: { id: 'usr_1', email: 'owner@example.test' } } }),
}));
vi.mock('#lib/auth-client.js', () => ({
  authClient: { device: Object.assign(mocks.verify, { approve: mocks.approve, deny: mocks.deny }) },
}));
const show = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthCliRoute />
    </QueryClientProvider>,
  );
beforeEach(() => {
  mocks.search = '?user_code=ABCD-EFGH';
  mocks.verify.mockResolvedValue({ data: { client_id: 'tau-cli', status: 'pending', scope: '' }, error: null });
  mocks.approve.mockResolvedValue({ data: { success: true }, error: null });
  mocks.deny.mockResolvedValue({ data: { success: true }, error: null });
});
afterEach(() => vi.clearAllMocks());
describe('CLI consent', () => {
  it('shows the account and code and requires a gesture before approval', async () => {
    show();
    const approve = await screen.findByRole('button', { name: 'Approve CLI sign-in' });
    expect(await screen.findByText('Account: owner@example.test')).toBeDefined();
    expect(screen.getByLabelText('Confirmation code').textContent).toBe('ABCD-EFGH');
    expect(mocks.approve).not.toHaveBeenCalled();
    await userEvent.click(approve);
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({ userCode: 'ABCD-EFGH' });
    expect(await screen.findByRole('status')).toHaveTextContent('Approved.');
  });
  it('supports explicit denial without approval', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Deny' }));
    expect(mocks.deny).toHaveBeenCalledExactlyOnceWith({ userCode: 'ABCD-EFGH' });
    expect(mocks.approve).not.toHaveBeenCalled();
  });
  it('refuses an unknown client', async () => {
    mocks.verify.mockResolvedValue({ data: { client_id: 'other', status: 'pending' }, error: null });
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid');
    expect(screen.queryByRole('button', { name: 'Approve CLI sign-in' })).toBeNull();
  });
  it('does not send a malformed code', () => {
    mocks.search = '?user_code=%3Cscript%3E';
    show();
    expect(screen.getByRole('alert')).toBeDefined();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
});
