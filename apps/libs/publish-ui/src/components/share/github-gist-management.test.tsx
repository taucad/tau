import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShareProvider, ShareProviderContext } from '@taucad/share/provider';
import type { ShareProjectSnapshot } from '@taucad/share/snapshot';
import { GithubGistManagement } from '#components/share/github-gist-management.js';
import { GithubGistServicesProvider } from '#components/share/github-gist-services.js';
import type { GithubGistServices } from '#components/share/github-gist-services.js';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(async (): Promise<'redirect' | 'system-browser'> => 'redirect'),
  awaitConnection: vi.fn<(signal: AbortSignal) => Promise<boolean>>(),
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

vi.mock('@taucad/ui/components/sonner', () => ({ toast }));

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

const services: GithubGistServices = {
  connectGithubGist: mocks.connect,
  awaitGithubGistConnection: mocks.awaitConnection,
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
  withBrowserShareProviderContext: async <Result,>(
    operation: (providerContext: ShareProviderContext) => Promise<Result>,
  ): Promise<Result> => operation(context),
  shareProviderRegistry: {
    load: vi.fn(async () => ({ republish: mocks.republish, unpublish: mocks.unpublish }) as unknown as ShareProvider),
  },
  /* The app's `useAuthLinks` sign-in link for an explicit `redirectTo`. */
  useAuthLinks: ({ redirectTo }) => ({ signIn: `/auth/sign-in?redirectTo=${encodeURIComponent(redirectTo)}` }),
  useSettingsDialog: () => ({ open: vi.fn() }),
};

function LocationProbe(): React.JSX.Element {
  const location = useLocation();
  return <span data-testid='location'>{`${location.pathname}${location.search}`}</span>;
}

const renderManagement = (
  properties?: {
    readonly onRepublished?: (url: string) => void;
    readonly onUnpublished?: () => void;
    readonly shareUrl?: string;
  },
  path = '/s/github-gist~abc123',
) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <GithubGistServicesProvider value={services}>
          <GithubGistManagement
            locator={{ providerId: 'github-gist', reference: 'abc123' }}
            protection={{ kind: 'none' }}
            collectSnapshot={async () => snapshot}
            shareUrl={properties?.shareUrl}
            onRepublished={properties?.onRepublished ?? vi.fn()}
            onUnpublished={properties?.onUnpublished ?? vi.fn()}
          />
        </GithubGistServicesProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('GithubGistManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStatus.mockResolvedValue('connected');
    mocks.connect.mockResolvedValue('redirect');
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

  it('should show its label from md, the width at which every shared top-bar action switches', async () => {
    renderManagement();

    const manage = await screen.findByRole('button', { name: 'Manage GitHub Gist' });
    expect(manage.querySelector('span')).toHaveClass('hidden', 'md:inline');
  });

  it('updates the same Gist, emits the new pinned Tau link and says the link changed', async () => {
    const onRepublished = vi.fn();
    renderManagement({ onRepublished, shareUrl: 'https://tau.new/s/github-gist~abc123' });
    await userEvent.click(await screen.findByRole('button', { name: 'Manage GitHub Gist' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Update Gist' }));
    await waitFor(() => {
      expect(mocks.republish).toHaveBeenCalledWith(
        expect.objectContaining({ locator: { providerId: 'github-gist', reference: 'abc123' }, snapshot }),
        context,
      );
      expect(onRepublished).toHaveBeenCalledWith(`https://tau.new/s/github-gist~abc123.${'b'.repeat(40)}`);
    });
    expect(toast.success).toHaveBeenCalledWith('Gist updated. The link changed, so copy it again.');
  });

  it('requires confirmation before deleting the Gist', async () => {
    const onUnpublished = vi.fn();
    renderManagement({ onUnpublished });
    await userEvent.click(await screen.findByRole('button', { name: 'Manage GitHub Gist' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete Gist…' }));
    expect(mocks.unpublish).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: 'Delete this Gist?' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Gist' }));
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

  // ── Desktop Gist consent in the system browser (D16c) ───────────────────────
  describe('when Gist access is granted in the system browser', () => {
    const startDesktopGrant = async (): Promise<void> => {
      mocks.getStatus.mockResolvedValueOnce('permission-required');
      mocks.connect.mockResolvedValueOnce('system-browser');
      renderManagement();
      await userEvent.click(await screen.findByRole('button', { name: 'Allow Gist access' }));
    };

    it('should wait for the browser and show the management menu once access arrives', async () => {
      let grant: (connected: boolean) => void = () => undefined;
      mocks.awaitConnection.mockImplementationOnce(
        async () =>
          new Promise<boolean>((resolve) => {
            grant = resolve;
          }),
      );

      await startDesktopGrant();

      expect(await screen.findByRole('status')).toHaveTextContent('Finish in your browser');
      grant(true);
      expect(await screen.findByRole('button', { name: 'Manage GitHub Gist' })).toBeEnabled();
      expect(toast.success).toHaveBeenCalledWith('GitHub Gist access granted.');
    });

    it('should stop waiting on Cancel and offer the grant again', async () => {
      let signal: AbortSignal | undefined;
      mocks.awaitConnection.mockImplementationOnce(async (received) => {
        signal = received;
        return new Promise<boolean>(() => {
          // Never settles: the person cancels first.
        });
      });

      await startDesktopGrant();
      await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

      expect(signal?.aborted).toBe(true);
      expect(toast.info).toHaveBeenCalledWith('Stopped waiting for your browser. Gist access was not changed here.');
      expect(screen.getByRole('button', { name: 'Allow Gist access' })).toBeEnabled();
      /* The Cancel that was clicked is gone; focus returns to the grant rather than the page body. */
      expect(screen.getByRole('button', { name: 'Allow Gist access' })).toHaveFocus();
    });

    it('should say so and offer the grant again when access never arrives', async () => {
      mocks.awaitConnection.mockResolvedValueOnce(false);

      await startDesktopGrant();

      await waitFor(() => {
        expect(toast.info).toHaveBeenCalledWith('Gist access did not arrive within 10 minutes. Try again.');
      });
      expect(screen.getByRole('button', { name: 'Allow Gist access' })).toBeEnabled();
    });
  });
});
