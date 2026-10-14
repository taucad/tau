import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import GithubConnectionCompleteRoute from '#routes/github.complete/route.js';
import { GithubRequestError } from '#lib/github-connections.js';
import type * as GithubConnectionsModule from '#lib/github-connections.js';

const github = vi.hoisted(() => ({ complete: vi.fn(), start: vi.fn() }));

vi.mock('#lib/github-connections.js', async (importOriginal) => ({
  ...(await importOriginal<typeof GithubConnectionsModule>()),
  githubConnections: github,
}));

const renderAt = (url: string): void => {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path='/github/complete' element={<GithubConnectionCompleteRoute />} />
        <Route path='*' element={<p>Returned to Tau</p>} />
      </Routes>
    </MemoryRouter>,
  );
};

describe('GithubConnectionCompleteRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('should explain a callback failure and offer a way back instead of waiting', () => {
    renderAt('/github/complete?error=GITHUB_CONSENT_DENIED&attempt=attempt-1&returnTo=%2Fw%2Fhome%2Fpart');

    expect(screen.getByRole('alert')).toMatchTextContent(
      'GitHub access was not granted. Connect GitHub again to continue.',
    );
    expect(screen.getByRole('link', { name: 'Back to Tau' })).toHaveAttribute('href', '/w/home/part');
    expect(github.complete).not.toHaveBeenCalled();
  });

  it('should never offer a way back that leaves Tau', () => {
    renderAt('/github/complete?error=GITHUB_CALLBACK_FAILED&returnTo=%2F%5Cevil.example');

    expect(screen.getByRole('link', { name: 'Back to Tau' })).toHaveAttribute('href', '/import');
  });

  it('should return to the remembered page after GitHub App setup', async () => {
    globalThis.sessionStorage.setItem('tau:github-setup-return', '/w/home/part');

    renderAt('/github/complete?installation_id=42&setup_action=update');

    expect(await screen.findByText('Returned to Tau')).toBeInTheDocument();
    expect(github.complete).not.toHaveBeenCalled();
  });

  it('should return to the remembered page only once (R10)', async () => {
    globalThis.sessionStorage.setItem('tau:github-setup-return', '/w/home/part');
    renderAt('/github/complete?installation_id=42&setup_action=update');
    expect(await screen.findByText('Returned to Tau')).toBeInTheDocument();
    cleanup();

    /* A later install started on GitHub itself lands here with nothing remembered for it. */
    renderAt('/github/complete?installation_id=42&setup_action=install');

    expect(await screen.findByRole('heading', { name: 'GitHub access updated' })).toBeInTheDocument();
    expect(screen.queryByText('Returned to Tau')).not.toBeInTheDocument();
  });

  it('should start a fresh attempt that returns where the expired one would have (R24)', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { href: 'https://tau.new/github/complete', assign });
    github.start.mockResolvedValue({ attemptId: 'attempt-2', authorizationUrl: 'https://github.com/login/oauth' });
    /* The attempt's start record expired, so GitHub's callback carries no Tau state. */
    globalThis.sessionStorage.setItem('tau:github-connect-return', '/w/home/part');
    renderAt('/github/complete?error=GITHUB_CALLBACK_EXPIRED');

    expect(screen.getByRole('alert')).toMatchTextContent(
      'The GitHub sign-in took too long or was already used. Connect GitHub again.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Connect GitHub again' }));

    expect(github.start).toHaveBeenCalledExactlyOnceWith('/w/home/part');
    expect(assign).toHaveBeenCalledExactlyOnceWith('https://github.com/login/oauth');
  });

  it('should offer a fresh attempt when the completion record expired (R24)', async () => {
    github.complete.mockRejectedValue(new GithubRequestError(410, 'GITHUB_COMPLETION_EXPIRED'));
    renderAt('/github/complete?attempt=attempt-1&returnTo=%2Fw%2Fhome%2Fpart&mode=browser');

    expect(await screen.findByRole('button', { name: 'Connect GitHub again' })).toBeInTheDocument();
  });

  it('should leave a refusal that is not about time to its own sentence', () => {
    renderAt('/github/complete?error=GITHUB_CONSENT_DENIED&attempt=attempt-1&returnTo=%2Fw%2Fhome%2Fpart');

    expect(screen.queryByRole('button', { name: 'Connect GitHub again' })).not.toBeInTheDocument();
  });

  it('should leave a desktop attempt to the desktop app', () => {
    renderAt('/github/complete?error=GITHUB_CALLBACK_EXPIRED&attempt=attempt-1&returnTo=%2Fimport&mode=desktop-poll');

    expect(screen.getByRole('alert')).toMatchTextContent('Return to the Tau desktop app to try again.');
    expect(screen.queryByRole('button', { name: 'Connect GitHub again' })).not.toBeInTheDocument();
  });

  it('should confirm a GitHub App setup opened outside this tab', async () => {
    renderAt('/github/complete?installation_id=42&setup_action=install');

    expect(await screen.findByRole('heading', { name: 'GitHub access updated' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Tau' })).toHaveAttribute('href', '/import');
  });
});
