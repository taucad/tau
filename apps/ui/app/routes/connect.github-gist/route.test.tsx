// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ConnectGithubGistRoute from '#routes/connect.github-gist/route.js';
import type * as ShareProvidersModule from '#lib/share-providers.js';

const mocks = vi.hoisted(() => ({
  session: { user: { id: 'usr_1', email: 'ada@example.com' } } as unknown,
  connect: vi.fn(async (): Promise<'redirect' | 'system-browser'> => 'redirect'),
}));

vi.mock('@better-auth-ui/react', () => ({
  useAuthenticate: () => ({ data: mocks.session }),
}));

vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));

vi.mock('#lib/share-providers.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ShareProvidersModule>()),
  connectGithubGist: mocks.connect,
}));

const renderAt = (url: string): void => {
  render(
    <MemoryRouter initialEntries={[url]}>
      <ConnectGithubGistRoute />
    </MemoryRouter>,
  );
};

describe('ConnectGithubGistRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { user: { id: 'usr_1', email: 'ada@example.com' } };
    mocks.connect.mockResolvedValue('redirect');
  });

  it('should name the Tau account and start the grant only from the button', async () => {
    renderAt('/connect/github-gist');

    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Use a different Tau account' })).toHaveAttribute(
      'href',
      '/auth/sign-out?redirectTo=%2Fconnect%2Fgithub-gist',
    );
    expect(mocks.connect).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Allow Gist access' }));

    expect(mocks.connect).toHaveBeenCalledExactlyOnceWith({
      returnUrl: `${globalThis.location.origin}/connect/github-gist`,
      surface: 'share-page',
    });
  });

  it('should confirm a granted return and send the person back to Tau', () => {
    renderAt('/connect/github-gist?shareAuth=github-gist');

    expect(screen.getByRole('status')).toHaveTextContent('Gist access granted');
    expect(screen.getByText('You can return to Tau.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allow Gist access' })).not.toBeInTheDocument();
  });

  it('should report a cancelled return and offer the grant again', async () => {
    renderAt('/connect/github-gist?shareAuth=github-gist&error=access_denied&error_description=provider+copy');

    expect(screen.getByRole('status')).toHaveTextContent('Gist access was not granted');
    expect(screen.queryByText(/provider copy/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Allow Gist access' }));

    /* The retry returns to the bare page, never carrying the previous `error`. */
    expect(mocks.connect).toHaveBeenCalledWith({
      returnUrl: `${globalThis.location.origin}/connect/github-gist`,
      surface: 'share-page',
    });
  });

  it('should report a failed return as an alert and offer the grant again', () => {
    renderAt('/connect/github-gist?shareAuth=github-gist&error=state_mismatch');

    expect(screen.getByRole('alert')).toHaveTextContent('GitHub authorization could not be completed');
    expect(screen.getByRole('button', { name: 'Allow Gist access' })).toBeEnabled();
  });

  it('should show the failure and keep the button when the grant cannot start', async () => {
    mocks.connect.mockRejectedValueOnce(new Error('GitHub authorization could not be started.'));
    renderAt('/connect/github-gist');

    await userEvent.click(screen.getByRole('button', { name: 'Allow Gist access' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('GitHub authorization could not be started.');
    expect(screen.getByRole('button', { name: 'Allow Gist access' })).toBeEnabled();
  });

  it('should keep the button usable when the grant did not leave the page (R-U8)', async () => {
    mocks.connect.mockResolvedValueOnce('system-browser');
    renderAt('/connect/github-gist');

    await userEvent.click(screen.getByRole('button', { name: 'Allow Gist access' }));

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Allow Gist access' })).toBeEnabled();
    });
    expect(mocks.connect).toHaveBeenCalledOnce();
  });

  it('should hold the button while the page is leaving for GitHub', async () => {
    renderAt('/connect/github-gist');

    await userEvent.click(screen.getByRole('button', { name: 'Allow Gist access' }));

    expect(screen.getByRole('button', { name: 'Allow Gist access' })).toBeDisabled();
  });

  it.each([
    ['pending', undefined],
    ['signed out', null],
  ])('should offer nothing to grant while the session is %s', (_label, session) => {
    mocks.session = session;
    renderAt('/connect/github-gist');

    expect(screen.getByText('Checking your Tau account')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allow Gist access' })).not.toBeInTheDocument();
  });
});
