// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- installs Vitest DOM matchers.
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import type { ShareProjectSnapshot } from '@taucad/share/snapshot';
import type { RevisionTag } from '@taucad/revisions';
import { ProjectSharePanel, nextVersionName } from '#components/publish/project-share-panel.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import type * as useEntitlementsModule from '@taucad/billing/hooks/use-entitlements';
import type * as useSettingsDialogModule from '#hooks/use-settings-dialog.js';
import type * as shareProvidersModule from '#lib/share-providers.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

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

/* Publishing is the revision root's `publish` child (A38): the panel holds no
   actor, so the suite scripts the same projection every revision surface reads. */
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});

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

const tag = (name: string): RevisionTag => ({
  name,
  revisionId: `rev-${name}` as RevisionTag['revisionId'],
  note: undefined,
  actor: undefined,
  createdAt: 1,
});

const publishFacet = (facet: Partial<(typeof revisionStatusHarness)['status']['publish']>): void => {
  revisionStatusHarness.status = {
    ...revisionStatusHarness.status,
    publish: { ...revisionStatusHarness.status.publish, ...facet },
  };
};

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
    revisionStatusHarness.reset();
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

  it('publishes as one gesture carrying the named version and the draft', async () => {
    renderPanel(<ProjectSharePanel projectId='proj_ok' projectName='Demo' entryPath='main.ts' />);

    await userEvent.click(await screen.findByRole('button', { name: /publish and copy link/i }));

    expect(revisionStatusHarness.commands.publishProject).toHaveBeenCalledExactlyOnceWith('v1');
    expect(revisionStatusHarness.commands.confirmPublish).toHaveBeenCalledExactlyOnceWith({
      tag: 'v1',
      projectName: 'Demo',
      entryPath: 'main.ts',
      visibility: 'private',
      title: 'Demo',
    });
  });

  it('names the next free version and offers the ones the project already has', async () => {
    publishFacet({ tags: [tag('v1'), tag('v2')] });
    renderPanel(<ProjectSharePanel projectId='proj_ok' projectName='Demo' entryPath='main.ts' />);

    const field = await screen.findByRole('combobox', { name: /version name/i });
    await waitFor(() => {
      expect(field).toHaveValue('v3');
    });
    const options = [...document.querySelectorAll('#share-version-options option')].map((option) =>
      option.getAttribute('value'),
    );
    expect(options).toStrictEqual(['v1', 'v2']);

    await userEvent.clear(field);
    await userEvent.type(field, 'v1');
    await userEvent.click(screen.getByRole('button', { name: /publish and copy link/i }));

    expect(revisionStatusHarness.commands.publishProject).toHaveBeenCalledExactlyOnceWith('v1');
  });

  it('refuses to publish without a version name', async () => {
    renderPanel(<ProjectSharePanel projectId='proj_ok' projectName='Demo' entryPath='main.ts' />);

    await userEvent.clear(await screen.findByRole('combobox', { name: /version name/i }));

    expect(screen.getByRole('button', { name: /publish and copy link/i })).toBeDisabled();
  });

  it('copies the machine\u2019s share link once and releases the machine', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJsonResponse(unpublishedEnvelope))
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope));
    publishFacet({ phase: 'success', shareUrl: 'https://tau.example/s/tau~proj_ok' });

    renderPanel(<ProjectSharePanel projectId='proj_ok' projectName='Demo' entryPath='main.ts' />);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledExactlyOnceWith('https://tau.example/s/tau~proj_ok');
    });
    await waitFor(() => {
      expect(revisionStatusHarness.commands.resetPublish).toHaveBeenCalled();
    });
    expect(await screen.findByText('People with access')).toBeInTheDocument();
    expect(screen.getByText('friend@example.com')).toBeInTheDocument();
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

  it('shows Publishing with a spinner while the machine is working', async () => {
    publishFacet({ phase: 'working' });
    renderPanel(<ProjectSharePanel projectId='proj_busy' projectName='Demo' entryPath='main.ts' />);

    const publishingButton = await screen.findByRole('button', { name: /publishing/iu });
    expect(publishingButton).toBeDisabled();
    expect(within(publishingButton).getByText(/publishing/i)).toBeInTheDocument();
  });

  it('presents the failure as the one sentence the machine wrote', async () => {
    publishFacet({ phase: 'error', error: 'This version is larger than 50 MB. Remove some files and try again.' });
    renderPanel(<ProjectSharePanel projectId='proj_huge' projectName='Huge' entryPath='main.ts' />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This version is larger than 50 MB. Remove some files and try again.');
    expect(within(alert).queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
  });

  it('offers sign-in only when the sentence asks for it', async () => {
    publishFacet({ phase: 'error', error: 'Sign in to publish to Tau Cloud.' });
    renderPanel(<ProjectSharePanel projectId='proj_signin' projectName='Demo' entryPath='main.ts' />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('nextVersionName', () => {
  it.each([
    [[], 'v1'],
    [['v1'], 'v2'],
    [['v2'], 'v1'],
    [['v1', 'v2', 'v3'], 'v4'],
    [['release-1'], 'v1'],
  ])('answers %j with %s', (names, expected) => {
    expect(nextVersionName(names)).toBe(expected);
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
