import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShareProviderContext } from '@taucad/share/provider';
import type { ShareProjectSnapshot } from '@taucad/share/snapshot';
import { GithubGistManagement } from '#components/share/github-gist-management.js';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(async () => undefined),
  getStatus: vi.fn(
    async (): Promise<'connected' | 'permission-required' | 'not-connected' | 'signed-out'> => 'connected',
  ),
  republish: vi.fn(async () => ({
    locator: { providerId: 'github-gist', reference: `abc123.${'b'.repeat(40)}` },
    secrets: {},
  })),
  unpublish: vi.fn(async () => undefined),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock('#lib/share-providers.js', () => ({
  connectGithubGist: mocks.connect,
  getGithubGistConnectionStatus: mocks.getStatus,
  parseGithubGistAuthorizationReturn: (search: string) => {
    const parameters = new URLSearchParams(search);
    if (parameters.get('shareAuth') !== 'github-gist') {
      return undefined;
    }
    const outcome = parameters.get('error') === 'access_denied' ? 'cancelled' : 'returned';
    parameters.delete('shareAuth');
    parameters.delete('error');
    parameters.delete('error_description');
    const remaining = parameters.toString();
    return { outcome, remainingSearch: remaining ? `?${remaining}` : '' };
  },
  withBrowserShareProviderContext: async (operation: (context: ShareProviderContext) => Promise<unknown>) =>
    operation(context),
  shareProviderRegistry: {
    load: vi.fn(async () => ({ republish: mocks.republish, unpublish: mocks.unpublish })),
  },
}));

vi.mock('#components/ui/sonner.js', () => ({ toast }));

const snapshot: ShareProjectSnapshot = { entryPath: 'main.ts', files: [], warnings: [] };
const context = {
  origin: 'https://tau.new',
  fetch: vi.fn(),
  artifactCodec: {
    pack: vi.fn(),
    openPlain: vi.fn(),
    sealWithPassword: vi.fn(),
    openWithPassword: vi.fn(),
  },
} as unknown as ShareProviderContext;

function LocationProbe(): React.JSX.Element {
  const location = useLocation();
  return <span data-testid='location'>{`${location.pathname}${location.search}`}</span>;
}

const renderManagement = (
  properties?: {
    readonly onRepublished?: (url: string) => void;
    readonly onUnpublished?: () => void;
  },
  path = '/s/github-gist~abc123',
) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <GithubGistManagement
        locator={{ providerId: 'github-gist', reference: 'abc123' }}
        protection={{ kind: 'none' }}
        collectSnapshot={async () => snapshot}
        onRepublished={properties?.onRepublished ?? vi.fn()}
        onUnpublished={properties?.onUnpublished ?? vi.fn()}
      />
    </MemoryRouter>,
  );

describe('GithubGistManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStatus.mockResolvedValue('connected');
  });

  it('rechecks access, reports cancellation safely, and consumes only OAuth return fields', async () => {
    renderManagement(
      undefined,
      '/s/github-gist~abc123?shareAuth=github-gist&error=access_denied&error_description=provider+copy&keep=1',
    );

    await waitFor(() => {
      expect(mocks.getStatus).toHaveBeenCalled();
      expect(toast.info).toHaveBeenCalledWith('GitHub Gist access was not granted.');
      expect(screen.getByTestId('location')).toHaveTextContent('/s/github-gist~abc123?keep=1');
    });
    expect(screen.queryByText(/provider copy/i)).not.toBeInTheDocument();
  });

  it('republishes to the same Gist and emits the new pinned Tau URL', async () => {
    const onRepublished = vi.fn();
    renderManagement({ onRepublished });
    await userEvent.click(await screen.findByRole('button', { name: 'Manage GitHub Gist' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Republish Gist' }));
    await waitFor(() => {
      expect(mocks.republish).toHaveBeenCalledWith(
        expect.objectContaining({ locator: { providerId: 'github-gist', reference: 'abc123' }, snapshot }),
        context,
      );
      expect(onRepublished).toHaveBeenCalledWith(`https://tau.new/s/github-gist~abc123.${'b'.repeat(40)}`);
    });
  });

  it('requires confirmation before unpublishing', async () => {
    const onUnpublished = vi.fn();
    renderManagement({ onUnpublished });
    await userEvent.click(await screen.findByRole('button', { name: 'Manage GitHub Gist' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Unpublish Gist' }));
    expect(mocks.unpublish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish Gist' }));
    await waitFor(() => {
      expect(mocks.unpublish).toHaveBeenCalledWith(
        { locator: { providerId: 'github-gist', reference: 'abc123' } },
        context,
      );
      expect(onUnpublished).toHaveBeenCalledOnce();
    });
  });

  it('offers sign-in or renewed Gist permission for disconnected states', async () => {
    mocks.getStatus.mockResolvedValueOnce('signed-out');
    const signedOut = renderManagement();
    expect(await screen.findByRole('link', { name: 'Sign in to manage' })).toHaveAttribute(
      'href',
      '/auth/sign-in?redirectTo=%2Fs%2Fgithub-gist~abc123',
    );
    signedOut.unmount();

    mocks.getStatus.mockResolvedValueOnce('permission-required');
    renderManagement();
    fireEvent.click(await screen.findByRole('button', { name: 'Allow Gist access' }));
    expect(mocks.connect).toHaveBeenCalledWith({
      returnUrl: globalThis.location.href,
      surface: 'share-page',
    });
  });
});
