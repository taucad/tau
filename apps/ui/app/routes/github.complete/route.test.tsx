import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import GithubConnectionCompleteRoute from '#routes/github.complete/route.js';
import type * as GithubConnectionsModule from '#lib/github-connections.js';

const github = vi.hoisted(() => ({ complete: vi.fn() }));

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
  });

  it('should explain a callback failure and offer a way back instead of waiting', () => {
    renderAt('/github/complete?error=GITHUB_CONSENT_DENIED&attempt=attempt-1&returnTo=%2Fw%2Fhome%2Fpart');

    expect(screen.getByRole('alert')).toHaveTextContent(
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

  it('should confirm a GitHub App setup opened outside this tab', async () => {
    renderAt('/github/complete?installation_id=42&setup_action=install');

    expect(await screen.findByRole('heading', { name: 'GitHub access updated' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Tau' })).toHaveAttribute('href', '/import');
  });
});
