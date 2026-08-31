// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- installs Vitest DOM matchers.
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { publicationApiCode } from '@taucad/types/constants';
import type { ShareProjectSnapshot } from '@taucad/share/snapshot';
import { ProjectSharePanel, formatPublishError } from '#components/publish/project-share-panel.js';
import { publishOversizedProjectId, publishStalledProjectId } from '#machines/publish.machine.ui-test-double.js';
import * as publishMachineActual from '#machines/publish.machine.js';
import type * as useEntitlementsModule from '@taucad/billing/hooks/use-entitlements';
import type * as useSettingsDialogModule from '#hooks/use-settings-dialog.js';
import type * as shareProvidersModule from '#lib/share-providers.js';
import { TooltipProvider } from '#components/ui/tooltip.js';

const portableProviderPublish = vi.hoisted(() => vi.fn());
const portableProviderLoad = vi.hoisted(() => vi.fn(async () => ({ publish: portableProviderPublish })));
const getGithubGistConnectionStatus = vi.hoisted(() => vi.fn(async () => 'not-connected'));
const connectGithubGist = vi.hoisted(() => vi.fn());
const portableContextDispose = vi.hoisted(() => vi.fn());
const portableContext = {
  origin: 'https://tau.example',
  artifactCodec: {},
  fetch: globalThis.fetch,
};

vi.mock('#lib/share-providers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof shareProvidersModule>();
  return {
    ...actual,
    withBrowserShareProviderContext: async (operation: (context: typeof portableContext) => Promise<unknown>) => {
      try {
        return await operation(portableContext);
      } finally {
        portableContextDispose();
      }
    },
    getGithubGistConnectionStatus,
    connectGithubGist,
    shareProviderRegistry: {
      descriptors: [
        { id: 'direct', label: 'Direct link', capabilities: ['project.publish', 'project.resolve'] },
        { id: 'tau', label: 'Hosted link', capabilities: ['project.publish', 'project.resolve'] },
        { id: 'github-gist', label: 'GitHub Gist', capabilities: ['project.publish', 'project.resolve'] },
        { id: 'github', label: 'GitHub repository', capabilities: ['project.resolve'] },
      ],
      load: portableProviderLoad,
    },
  };
});

/* eslint-disable @typescript-eslint/naming-convention -- mocked environment exports use environment-variable casing. */
vi.mock('#environment.config.js', () => ({
  ENV: { TAU_API_URL: 'https://api.example' },
}));
/* eslint-enable @typescript-eslint/naming-convention -- end mocked environment exports. */

vi.mock('#machines/publish.machine.js', async () => {
  const actual = await vi.importActual<typeof publishMachineActual>('#machines/publish.machine.js');
  const { publishMachineForUiTests } = await import('#machines/publish.machine.ui-test-double.js');
  return { ...actual, publishMachine: publishMachineForUiTests };
});

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ fileManagerRef: {} }),
}));

// Pro entitlements by default so the pre-existing private-flow tests exercise
// publish behaviour, not the tier gate; the gate suite flips this per-test.
const useEntitlementsMock = vi.hoisted(() => vi.fn());
vi.mock('@taucad/billing/hooks/use-entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof useEntitlementsModule>();
  return { ...actual, useEntitlements: useEntitlementsMock };
});

const openSettingsDialogMock = vi.hoisted(() => vi.fn());
vi.mock('#hooks/use-settings-dialog.js', async (importOriginal) => {
  const actual = await importOriginal<typeof useSettingsDialogModule>();
  return { ...actual, openSettingsDialog: openSettingsDialogMock };
});

const { PublishUploadError } = publishMachineActual;

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock('#components/ui/sonner.js', () => ({
  toast: {
    success: (...args: unknown[]) => {
      toastSuccessMock(...args);
    },
    error: (...args: unknown[]) => {
      toastErrorMock(...args);
    },
  },
  Toaster: () => null,
}));

const unpublishedEnvelope = {
  project: { id: 'proj_ui', name: null, description: null },
  currentPublication: null,
  snapshot: { state: 'unpublished' },
};

const publishedEnvelope = {
  project: { id: 'proj_ui', name: 'Demo', description: 'a beautiful model' },
  currentPublication: {
    id: 'pub_ui',
    title: 'Demo',
    description: 'a beautiful model',
    visibility: 'private',
    createdAt: '2026-01-02T00:00:00.000Z',
    urls: { share: 'https://tau.example/s/tau~pub_ui' },
    access: {
      grants: [
        {
          id: 'pva_1',
          publicationId: 'pub_ui',
          recipientEmail: 'friend@example.com',
          status: 'active',
          createdAt: '2026-01-03T00:00:00.000Z',
          revokedAt: null,
        },
      ],
    },
  },
  snapshot: { state: 'published-current', lastPublishedAt: '2026-01-02T00:00:00.000Z' },
};

const publicEnvelope = {
  ...publishedEnvelope,
  currentPublication: {
    ...publishedEnvelope.currentPublication,
    visibility: 'public',
  },
};

const mockJsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn(async () => body),
  }) as unknown as Response;

const renderPanel = (ui: ReactElement, initialEntries?: string[]): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <TooltipProvider>{ui}</TooltipProvider>
    </MemoryRouter>,
  );

describe('ProjectSharePanel', () => {
  beforeEach(async () => {
    const { entitlementsFromTier } = await import('@taucad/billing');
    useEntitlementsMock.mockReturnValue(entitlementsFromTier('pro'));
    openSettingsDialogMock.mockClear();
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    toastSuccessMock.mockClear();
    toastErrorMock.mockClear();
    portableProviderLoad.mockClear();
    portableProviderPublish.mockReset();
    portableProviderPublish.mockResolvedValue({
      locator: { providerId: 'direct' },
      secrets: { v: '2', zip: 'encoded-archive' },
    });
    getGithubGistConnectionStatus.mockReset();
    getGithubGistConnectionStatus.mockResolvedValue('not-connected');
    connectGithubGist.mockReset();
    portableContextDispose.mockClear();

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(unpublishedEnvelope));
  });

  afterEach(() => {
    cleanup();
  });

  it('uses a full-width provider combobox with branded icons and publish-capable choices only', async () => {
    renderPanel(
      <ProjectSharePanel
        projectId='proj_picker'
        projectName='Picker'
        entryPath='main.ts'
        collectSnapshot={vi.fn(async () => ({ entryPath: 'main.ts', files: [], warnings: [] }))}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Share with Direct link' });
    expect(trigger).toHaveClass('w-full', 'min-w-0');
    expect(trigger.querySelector('.lucide-link-2')).not.toBeNull();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();

    await userEvent.click(trigger);

    const directOption = screen.getByRole('option', { name: 'Direct link' });
    const tauOption = screen.getByRole('option', { name: 'Hosted link' });
    const gistOption = screen.getByRole('option', { name: 'GitHub Gist' });
    expect(directOption.querySelector('.lucide-link-2')).not.toBeNull();
    expect(tauOption.querySelector('use')).toHaveAttribute('href', '#tau');
    expect(gistOption.querySelector('use')).toHaveAttribute('href', '#github');
    expect(screen.queryByRole('option', { name: 'GitHub repository' })).not.toBeInTheDocument();

    await userEvent.click(gistOption);
    const selected = screen.getByRole('button', { name: 'Share with GitHub Gist' });
    expect(selected.querySelector('use')).toHaveAttribute('href', '#github');
  });

  it('creates an unencrypted direct link by default without contacting Tau', async () => {
    const collectSnapshot = vi.fn(
      async () =>
        ({
          entryPath: 'main.ts',
          files: [
            {
              path: 'tau.json',
              content: new TextEncoder().encode('{}'),
              sha256: '0'.repeat(64),
              role: 'project-metadata',
            },
          ],
          warnings: [],
        }) satisfies ShareProjectSnapshot,
    );

    renderPanel(
      <ProjectSharePanel
        projectId='proj_direct'
        projectName='Direct'
        entryPath='main.ts'
        collectSnapshot={collectSnapshot}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /copy direct link/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'https://tau.example/s/direct#v=2&zip=encoded-archive',
      );
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(collectSnapshot).toHaveBeenCalledOnce();
    expect(portableProviderLoad).toHaveBeenCalledExactlyOnceWith('direct');
    expect(portableProviderPublish).toHaveBeenCalledWith(
      expect.objectContaining({ protection: { kind: 'none' }, visibility: 'unlisted' }),
      expect.anything(),
    );
    expect(portableContextDispose).toHaveBeenCalledOnce();
  });

  it('opts into password encryption and can omit the password from the copied link', async () => {
    portableProviderPublish.mockResolvedValueOnce({
      locator: { providerId: 'direct' },
      secrets: { v: '2', jwe: 'header..iv.cipher.tag' },
    });
    const collectSnapshot = vi.fn(async () => ({ entryPath: 'main.ts', files: [], warnings: [] }));
    renderPanel(
      <ProjectSharePanel
        projectId='proj_encrypted'
        projectName='Encrypted'
        entryPath='main.ts'
        collectSnapshot={collectSnapshot}
      />,
    );

    await userEvent.click(screen.getByLabelText('Encrypt with a password'));
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery staple 12345');
    await userEvent.click(screen.getByLabelText('Include password in the link'));
    await userEvent.click(screen.getByRole('button', { name: /copy direct link/i }));

    expect(portableProviderPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        protection: {
          kind: 'password',
          password: 'correct horse battery staple 12345',
          includePassword: false,
        },
      }),
      expect.anything(),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://tau.example/s/direct#jwe=header..iv.cipher.tag&v=2',
    );
  });

  it('aborts an in-flight snapshot when its Workbench owner unmounts', async () => {
    let operationSignal: AbortSignal | undefined;
    const collectSnapshot = vi.fn(
      async (signal?: AbortSignal) =>
        new Promise<ShareProjectSnapshot>((_resolve, reject) => {
          operationSignal = signal;
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    const view = renderPanel(
      <ProjectSharePanel
        projectId='proj_abort'
        projectName='Abort'
        entryPath='main.ts'
        collectSnapshot={collectSnapshot}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /copy direct link/i }));
    await waitFor(() => {
      expect(operationSignal).toBeDefined();
    });
    view.unmount();
    expect(operationSignal?.aborted).toBe(true);
  });

  it('uses a scroll-safe Workbench region and presents missing GitHub permission as an action', async () => {
    getGithubGistConnectionStatus.mockResolvedValueOnce('permission-required');
    renderPanel(
      <ProjectSharePanel
        projectId='proj_gist'
        projectName='Gist'
        entryPath='main.ts'
        collectSnapshot={vi.fn(async () => ({ entryPath: 'main.ts', files: [], warnings: [] }))}
      />,
    );
    expect(screen.getByRole('region', { name: 'Share project' })).toHaveClass('min-h-0', 'min-w-0');
    await userEvent.click(screen.getByRole('button', { name: 'Share with Direct link' }));
    await userEvent.click(screen.getByRole('option', { name: 'GitHub Gist' }));
    expect(await screen.findByText(/tau needs gist access/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Allow Gist access' }));
    expect(connectGithubGist).toHaveBeenCalledWith({
      returnUrl: globalThis.location.href,
      surface: 'editor',
    });
  });

  it('recovers when GitHub authorization cannot be started', async () => {
    getGithubGistConnectionStatus.mockResolvedValueOnce('permission-required');
    connectGithubGist.mockRejectedValueOnce(new Error('GitHub authorization could not be started.'));
    renderPanel(
      <ProjectSharePanel
        projectId='proj_gist_failure'
        projectName='Gist'
        entryPath='main.ts'
        collectSnapshot={vi.fn(async () => ({ entryPath: 'main.ts', files: [], warnings: [] }))}
        initialMethod='github-gist'
      />,
    );

    const allow = await screen.findByRole('button', { name: 'Allow Gist access' });
    await userEvent.click(allow);

    expect(await screen.findByText('GitHub authorization could not be started.')).toBeInTheDocument();
    expect(allow).toBeEnabled();
  });

  it('publishes a public Gist only when the user selects public visibility', async () => {
    getGithubGistConnectionStatus.mockResolvedValueOnce('connected');
    portableProviderPublish.mockResolvedValueOnce({
      locator: { providerId: 'github-gist', reference: 'gist_1' },
      secrets: {},
    });
    renderPanel(
      <ProjectSharePanel
        projectId='proj_public_gist'
        projectName='Gist'
        entryPath='main.ts'
        collectSnapshot={vi.fn(async () => ({ entryPath: 'main.ts', files: [], warnings: [] }))}
        initialMethod='github-gist'
      />,
    );

    await userEvent.click(await screen.findByLabelText('Publish as a public Gist'));
    await userEvent.click(screen.getByRole('button', { name: 'Create Gist and copy link' }));

    await waitFor(() => {
      expect(portableProviderPublish).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: 'public' }),
        expect.anything(),
      );
    });
  });

  it('restores the GitHub provider after authorization and uses safe app-owned result copy', async () => {
    getGithubGistConnectionStatus.mockResolvedValueOnce('connected');
    renderPanel(
      <ProjectSharePanel
        projectId='proj_gist_return'
        projectName='Gist'
        entryPath='main.ts'
        collectSnapshot={vi.fn(async () => ({ entryPath: 'main.ts', files: [], warnings: [] }))}
        initialMethod='github-gist'
        githubAuthorizationOutcome='cancelled'
      />,
    );

    expect(await screen.findByText('GitHub Gist access was not granted.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share with GitHub Gist' })).toBeInTheDocument();
  });

  it('presents signed-out Tau persistence as a normal state', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response);

    renderPanel(<ProjectSharePanel projectId='proj_signed_out' projectName='Demo' entryPath='main.ts' />);

    expect(await screen.findByText('Sign in to persist this project with Tau.')).toBeInTheDocument();
    expect(screen.getByText(/keeps this hosted share available over time/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/auth/sign-in?redirectTo=%2F%3Fworkbench%3Dshare%26shareProvider%3Dtau',
    );
  });

  it('preserves unrelated return parameters when building the sign-in link', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response);

    renderPanel(<ProjectSharePanel projectId='proj_signed_out' projectName='Demo' entryPath='main.ts' />, [
      '/?error=another-feature&source=editor',
    ]);

    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/auth/sign-in?redirectTo=%2F%3Ferror%3Danother-feature%26source%3Deditor%26workbench%3Dshare%26shareProvider%3Dtau',
    );
  });

  it('presents offline Tau persistence without an exceptional error state', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('offline'));

    renderPanel(<ProjectSharePanel projectId='proj_offline' projectName='Demo' entryPath='main.ts' />);

    expect(await screen.findByText('Tau-hosted sharing is unavailable right now.')).toBeInTheDocument();
    expect(screen.getByText('Check your connection and try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('loads unpublished share state with private visibility selected', async () => {
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    expect(await screen.findByText(/publish a snapshot/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /private/i })).toBeChecked();
    expect(screen.getByRole('button', { name: /publish and copy link/i })).toBeEnabled();
    expect(globalThis.fetch).toHaveBeenCalledWith('https://api.example/v1/projects/proj_ui/share', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  });

  it('prefills the first-publish form from the source project', async () => {
    renderPanel(
      <ProjectSharePanel
        projectId='proj_ui'
        projectName='Demo'
        projectDescription='a beautiful model'
        entryPath='main.ts'
      />,
    );

    expect(await screen.findByRole('textbox', { name: /^title$/iu })).toHaveValue('Demo');
    expect(screen.getByRole('textbox', { name: /description \(optional\)/iu })).toHaveValue('a beautiful model');
  });

  it('publishes, copies the link, and transitions into manage-access state', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJsonResponse(unpublishedEnvelope))
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope));

    renderPanel(<ProjectSharePanel projectId='proj_ok' projectName='Demo' entryPath='main.ts' />);

    await userEvent.click(await screen.findByRole('button', { name: /publish and copy link/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://tau.example/s/tau~proj_ok');
    });
    await waitFor(() => {
      expect(screen.getByText('People with access')).toBeInTheDocument();
    });

    expect(screen.getByText('friend@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
  });

  it('adds and revokes recipients from the editor Share panel', async () => {
    const reloadedEnvelope = {
      ...publishedEnvelope,
      currentPublication: {
        ...publishedEnvelope.currentPublication,
        access: { grants: [] },
      },
    };
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope))
      .mockResolvedValueOnce(mockJsonResponse({ id: 'pva_2' }))
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope))
      .mockResolvedValueOnce(mockJsonResponse({ status: 'revoked' }))
      .mockResolvedValueOnce(mockJsonResponse(reloadedEnvelope));

    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    await userEvent.type(await screen.findByRole('textbox', { name: /share with emails/i }), 'Team@Example.com{Enter}');
    await userEvent.click(screen.getByRole('button', { name: /add access/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('https://api.example/v1/publications/pub_ui/access', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'team@example.com' }),
      });
    });

    await userEvent.click(await screen.findByRole('button', { name: /revoke friend@example.com/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('https://api.example/v1/publications/pub_ui/access/pva_1', {
        method: 'DELETE',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
    });
  });

  it('shows stale snapshot copy and editable general access for existing publications', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(publishedEnvelope));

    renderPanel(
      <ProjectSharePanel
        projectId='proj_ui'
        projectName='Demo'
        projectUpdatedAt='2026-01-02T00:00:02.500Z'
        entryPath='main.ts'
      />,
    );

    expect(await screen.findByText(/people with this link see the previous shared snapshot/i)).toBeInTheDocument();
    expect(screen.getByText('General access')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /general access/i })).toHaveTextContent('Private');
    expect(screen.queryByRole('radio', { name: /private/i })).not.toBeInTheDocument();
  });

  it('switches private publications to public without removing listed grants', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope))
      .mockResolvedValueOnce(mockJsonResponse({ id: 'pub_ui', visibility: 'public' }))
      .mockResolvedValueOnce(mockJsonResponse(publicEnvelope));

    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    const accessSelect = await screen.findByRole('combobox', { name: /general access/i });
    await userEvent.click(accessSelect);
    await userEvent.click(await screen.findByRole('option', { name: 'Public' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('https://api.example/v1/publications/pub_ui/visibility', {
        method: 'PATCH',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'public' }),
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /general access/i })).toHaveTextContent('Public');
    });

    expect(screen.getByText('friend@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /share with emails/i })).not.toBeInTheDocument();
    expect(toastSuccessMock).toHaveBeenCalledWith('Visibility updated');
  });

  it('switches public publications back to private and restores recipient entry', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJsonResponse(publicEnvelope))
      .mockResolvedValueOnce(mockJsonResponse({ id: 'pub_ui', visibility: 'private' }))
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope));

    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    const accessSelect = await screen.findByRole('combobox', { name: /general access/i });
    await userEvent.click(accessSelect);
    await userEvent.click(await screen.findByRole('option', { name: 'Private' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('https://api.example/v1/publications/pub_ui/visibility', {
        method: 'PATCH',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'private' }),
      });
    });

    expect(await screen.findByRole('textbox', { name: /share with emails/i })).toBeInTheDocument();
    expect(screen.getByText('friend@example.com')).toBeInTheDocument();
  });

  it('keeps previous visibility and shows an error toast when visibility update fails', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope))
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response);

    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    const accessSelect = await screen.findByRole('combobox', { name: /general access/i });
    await userEvent.click(accessSelect);
    await userEvent.click(await screen.findByRole('option', { name: 'Public' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('Could not update visibility');
    });
    expect(screen.getByRole('combobox', { name: /general access/i })).toHaveTextContent('Private');
  });

  it('disables publish when a shared email is invalid', async () => {
    renderPanel(<ProjectSharePanel projectId='proj_invalid_email' projectName='Demo' entryPath='main.ts' />);

    await userEvent.type(
      await screen.findByRole('textbox', { name: /share with specific emails/i }),
      'not-an-email{Enter}',
    );

    expect(screen.getByText(/enter a valid email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish and copy link/i })).toBeDisabled();
  });

  it('shows Publishing with spinner while publish is in flight', async () => {
    renderPanel(<ProjectSharePanel projectId={publishStalledProjectId} projectName='Demo' entryPath='main.ts' />);

    await userEvent.click(await screen.findByRole('button', { name: /publish and copy link/i }));

    const publishingButton = await screen.findByRole('button', { name: /publishing/iu });
    expect(publishingButton).toBeDisabled();
    expect(within(publishingButton).getByText(/publishing/i)).toBeInTheDocument();
  });

  it('shows actionable copy when payload is too large', async () => {
    renderPanel(<ProjectSharePanel projectId={publishOversizedProjectId} projectName='Huge' entryPath='main.ts' />);

    await userEvent.click(await screen.findByRole('button', { name: /publish and copy link/i }));

    expect(await screen.findByText('Project too large')).toBeInTheDocument();
    expect(screen.getByText(/total upload exceeds/i)).toBeInTheDocument();
  });
});

describe('formatPublishError', () => {
  it('maps PublishUploadError network fault', () => {
    expect(formatPublishError(new PublishUploadError('x', { networkFault: true }))).toMatchObject({
      headline: "Couldn't reach the server",
      detail: 'Check your connection and try again.',
    });
  });

  it('maps 401 with sign-in affordance', () => {
    expect(formatPublishError(new PublishUploadError('x', { status: 401 }))).toMatchObject({
      headline: 'Sign in to share',
      showSignIn: true,
    });
  });

  it('maps PROJECT_FORBIDDEN', () => {
    expect(
      formatPublishError(new PublishUploadError('x', { status: 403, apiCode: publicationApiCode.PROJECT_FORBIDDEN })),
    ).toMatchObject({
      headline: 'This project is owned by another user',
    });
  });

  it('maps generic 400 share failures', () => {
    expect(formatPublishError(new PublishUploadError('x', { status: 400 }))).toMatchObject({
      headline: 'Share payload was invalid',
    });
  });
});

describe('ProjectSharePanel free-tier visibility gate (T5)', () => {
  beforeEach(async () => {
    const { entitlementsFromTier } = await import('@taucad/billing');
    useEntitlementsMock.mockReturnValue(entitlementsFromTier('free'));
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(unpublishedEnvelope));
  });

  it('locks the private option and defaults free users to public', async () => {
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    expect(await screen.findByText(/publish a snapshot/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /private/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /public/i })).toBeChecked();
  });

  it('routes the upgrade affordance to billing settings', async () => {
    const user = userEvent.setup();
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    await screen.findByText(/publish a snapshot/i);
    await user.click(screen.getByRole('button', { name: /upgrade/i }));

    expect(openSettingsDialogMock).toHaveBeenCalledWith('billing');
  });
});
