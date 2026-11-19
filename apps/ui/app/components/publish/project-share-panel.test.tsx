import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- installs Vitest DOM matchers.
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import type { ReactElement } from 'react';
import type { ShareProjectSnapshot } from '@taucad/share/snapshot';
import { ShareError } from '@taucad/share/provider';
import type { RevisionRow, RevisionTag } from '@taucad/revisions';
import { entitlementsFromTier } from '@taucad/billing';
import {
  ProjectSharePanel,
  missingModelFileMessage,
  publishedVersionLabel,
} from '#components/publish/project-share-panel.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import type * as useEntitlementsModule from '@taucad/billing/hooks/use-entitlements';
import type * as useSettingsDialogModule from '#hooks/use-settings-dialog.js';
import type * as shareProvidersModule from '#lib/share-providers.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { store as preferenceStore } from '#hooks/use-cookie.js';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { metaConfig } from '#constants/meta.constants.js';

const portableProviderPublish = vi.hoisted(() => vi.fn());
const portableProviderRepublish = vi.hoisted(() => vi.fn());
const portableProviderUnpublish = vi.hoisted(() => vi.fn());
const portableProviderLoad = vi.hoisted(() =>
  vi.fn(async () => ({
    publish: portableProviderPublish,
    republish: portableProviderRepublish,
    unpublish: portableProviderUnpublish,
  })),
);
const shareProviderPreference = `${metaConfig.cookiePrefix}${cookieName.shareProvider}`;
const getGithubGistConnectionStatus = vi.hoisted(() => vi.fn(async () => 'not-connected'));
const connectGithubGist = vi.hoisted(() => vi.fn());
const awaitGithubGistConnection = vi.hoisted(() => vi.fn<(signal: AbortSignal) => Promise<boolean>>());
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
    awaitGithubGistConnection,
    shareProviderRegistry: {
      descriptors: [
        { id: 'direct', label: 'Direct link', capabilities: ['project.publish', 'project.resolve'] },
        { id: 'tau', label: 'Cloud link', capabilities: ['project.publish', 'project.resolve'] },
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
  return {
    ...actual,
    useSettingsDialog: () => ({
      isOpen: false,
      section: 'general',
      open: openSettingsDialogMock,
      close: vi.fn(),
    }),
  };
});

const tag = (number: number, name: string): RevisionTag => ({
  id: String(number).padStart(32, '0'),
  number,
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
vi.mock('@taucad/ui/components/sonner', () => ({
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

const invitedFriend = {
  id: 'sga_1',
  recipientEmail: 'friend@example.com',
  status: 'active',
  createdAt: '2026-01-03T00:00:00.000Z',
  revokedAt: null,
};

/** The project's one link, showing V2 (the entry `rev_v2`). */
const sharedLink = {
  id: 'shr_ui',
  url: 'https://tau.example/s/tau~shr_ui',
  visibility: 'private',
  status: 'active',
  stoppedAt: null,
  publishedAt: '2026-01-02T00:00:00.000Z',
  currentVersion: { publicationId: 'pub_ui', tag: 'v2', revisionId: 'rev_v2' },
  access: { grants: [invitedFriend] },
};

const unpublishedEnvelope = {
  project: { id: 'proj_ui', name: null, description: null },
  share: null,
};

const publishedEnvelope = {
  project: { id: 'proj_ui', name: 'Demo', description: 'a beautiful model' },
  share: sharedLink,
};

const publicEnvelope = { ...publishedEnvelope, share: { ...sharedLink, visibility: 'public' } };

const stoppedEnvelope = {
  ...publishedEnvelope,
  share: { ...sharedLink, status: 'stopped', stoppedAt: '2026-01-04T00:00:00.000Z' },
};

/** The link after Publish changes: V3, on the entry `rev_v3`. */
const republishedEnvelope = {
  ...publishedEnvelope,
  share: { ...sharedLink, currentVersion: { publicationId: 'pub_v3', tag: 'v3', revisionId: 'rev_v3' } },
};

/**
 * Puts the head of `main` at a revision, as the revision status reports it.
 *
 * @param revisionId - The head.
 */
const headOfMainAt = (revisionId: string): void => {
  const { status } = revisionStatusHarness;
  revisionStatusHarness.status = {
    ...status,
    headRevisionId: revisionId as (typeof status)['headRevisionId'],
    branches: status.branches.map((branch) =>
      branch.name === 'main' ? { ...branch, head: revisionId as (typeof branch)['head'] } : branch,
    ),
  };
};

/**
 * Scripts the history of `main`, newest first, so the graph can say which revision is behind which.
 *
 * @param revisionIds - The revisions on `main`, newest first.
 */
const historyOfMain = (...revisionIds: string[]): void => {
  revisionStatusHarness.rows = revisionIds.map(
    (revisionId): RevisionRow => ({
      revisionId,
      revisionNumber: undefined,
      changeId: `change-${revisionId}`,
      who: { kind: 'recorded', identity: { kind: 'user', id: 'usr_ui' } },
      source: 'user',
      createdAt: 1_788_220_800_000,
      summary: 'Change',
      conflicted: false,
      turnId: undefined,
      tags: [],
    }),
  );
};

const mockJsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn(async () => body),
  }) as unknown as Response;

const renderPanel = (ui: ReactElement, initialEntries?: string[]): ReturnType<typeof render> =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={initialEntries}>
        <TooltipProvider>{ui}</TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

/** The panel in its providers, a fresh element each time: React skips a rerender handed the same element. */
const panelElement = (projectId: string): React.JSX.Element => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>
      <TooltipProvider>
        <ProjectSharePanel projectId={projectId} projectName='Demo' entryPath='main.ts' />
      </TooltipProvider>
    </MemoryRouter>
  </QueryClientProvider>
);

describe('ProjectSharePanel', () => {
  beforeEach(() => {
    useEntitlementsMock.mockReturnValue({ ...entitlementsFromTier('pro'), isResolved: true });
    revisionStatusHarness.reset();
    openSettingsDialogMock.mockClear();
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    toastSuccessMock.mockClear();
    toastErrorMock.mockClear();
    portableProviderLoad.mockClear();
    portableProviderRepublish.mockReset();
    portableProviderUnpublish.mockReset();
    portableProviderPublish.mockReset();
    portableProviderPublish.mockResolvedValue({
      locator: { providerId: 'direct' },
      secrets: { v: '2', zip: 'encoded-archive' },
    });
    getGithubGistConnectionStatus.mockReset();
    getGithubGistConnectionStatus.mockResolvedValue('not-connected');
    connectGithubGist.mockReset();
    connectGithubGist.mockResolvedValue('redirect');
    awaitGithubGistConnection.mockReset();
    portableContextDispose.mockClear();

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(unpublishedEnvelope));
  });

  afterEach(() => {
    cleanup();
    preferenceStore.remove(shareProviderPreference);
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

    const directOption = screen.getByRole('option', { name: /^Direct link/u });
    expect(directOption).toHaveTextContent(
      'The whole project travels in the link, so anyone with the link can open it. Nothing is uploaded.',
    );
    const tauCloudOption = screen.getByRole('option', { name: /^Cloud link/u });
    const gistOption = screen.getByRole('option', { name: /^GitHub Gist/u });
    expect(directOption.querySelector('.lucide-link-2')).not.toBeNull();
    expect(tauCloudOption.querySelector('.lucide-cloud')).not.toBeNull();
    expect(gistOption.querySelector('use')).toHaveAttribute('href', '#github');
    expect(screen.queryByRole('option', { name: /^GitHub repository/u })).not.toBeInTheDocument();

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

    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));

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

  it('should leave sign-in to the cloud link rather than asking under the direct link (D95)', async () => {
    renderPanel(
      <ProjectSharePanel projectId='proj_direct' projectName='Direct' entryPath='main.ts' collectSnapshot={vi.fn()} />,
    );

    expect(await screen.findByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(screen.queryByText(/sign in to create/i)).not.toBeInTheDocument();
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

    await userEvent.click(screen.getByLabelText('Protect with a password'));
    /* Protection fills a generated password; this row shares one the person chose instead. */
    await userEvent.clear(screen.getByLabelText('Password'));
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery staple 12345');
    await userEvent.click(screen.getByLabelText('Include password in the link'));
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));

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

    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
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
    const region = screen.getByRole('region', { name: 'Share project' });
    expect(region).toHaveClass('min-h-0', 'min-w-0');
    expect(region.querySelector('[data-slot=share-pane-scroll]')).toHaveClass('overflow-y-auto');
    await userEvent.click(screen.getByRole('button', { name: 'Share with Direct link' }));
    await userEvent.click(screen.getByRole('option', { name: /^GitHub Gist/u }));
    expect(
      await screen.findByText('GitHub is connected, but Tau needs permission to create Gists.'),
    ).toBeInTheDocument();
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

    expect(await screen.findByText("Couldn't connect GitHub. Try again.")).toBeInTheDocument();
    expect(allow).toBeEnabled();
  });

  // ── Desktop Gist consent in the system browser (D16c) ─────────────────────
  describe('when Gist access is granted in the system browser', () => {
    const renderDesktopGist = async (): Promise<HTMLElement> => {
      getGithubGistConnectionStatus.mockResolvedValueOnce('permission-required');
      connectGithubGist.mockResolvedValueOnce('system-browser');
      renderPanel(
        <ProjectSharePanel
          projectId='proj_gist_desktop'
          projectName='Gist'
          entryPath='main.ts'
          collectSnapshot={vi.fn(async () => ({ entryPath: 'main.ts', files: [], warnings: [] }))}
          initialMethod='github-gist'
        />,
      );
      const allow = await screen.findByRole('button', { name: 'Allow Gist access' });
      await userEvent.click(allow);
      return allow;
    };

    it('should wait for the browser and continue to publishing once access arrives', async () => {
      let grant: (connected: boolean) => void = () => undefined;
      awaitGithubGistConnection.mockImplementationOnce(
        async () =>
          new Promise<boolean>((resolve) => {
            grant = resolve;
          }),
      );

      const allow = await renderDesktopGist();

      expect(
        await screen.findByText('Finish connecting in your browser. This pane updates when GitHub confirms.'),
      ).toBeInTheDocument();
      expect(allow).toBeDisabled();
      expect(allow).toHaveAttribute('aria-busy', 'true');
      getGithubGistConnectionStatus.mockResolvedValue('connected');
      grant(true);
      expect(await screen.findByRole('button', { name: 'Create Gist and copy link' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: 'Stop waiting' })).not.toBeInTheDocument();
    });

    it('should stop waiting on Stop waiting and offer the grant again', async () => {
      let signal: AbortSignal | undefined;
      awaitGithubGistConnection.mockImplementationOnce(async (received) => {
        signal = received;
        return new Promise<boolean>(() => {
          // Never settles: the person cancels first.
        });
      });

      const allow = await renderDesktopGist();
      await userEvent.click(await screen.findByRole('button', { name: 'Stop waiting' }));

      expect(signal?.aborted).toBe(true);
      expect(
        screen.getByText("Stopped waiting for your browser. Your GitHub connection hasn't changed."),
      ).toBeInTheDocument();
      expect(allow).toBeEnabled();
      /* The Stop waiting that was clicked is gone; focus returns to the grant rather than the page body. */
      expect(allow).toHaveFocus();
    });

    it('should say so and offer the grant again when access never arrives', async () => {
      awaitGithubGistConnection.mockResolvedValueOnce(false);

      const allow = await renderDesktopGist();

      expect(await screen.findByRole('alert')).toHaveTextContent("GitHub didn't confirm within 10 minutes. Try again.");
      expect(allow).toBeEnabled();
    });
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

  it('should offer Manage for a Gist this panel made and republish or unpublish it here (R8)', async () => {
    getGithubGistConnectionStatus.mockResolvedValue('connected');
    portableProviderPublish.mockResolvedValueOnce({
      locator: { providerId: 'github-gist', reference: `abc123.${'a'.repeat(40)}` },
      secrets: {},
    });
    portableProviderRepublish.mockResolvedValueOnce({
      locator: { providerId: 'github-gist', reference: `abc123.${'b'.repeat(40)}` },
      secrets: {},
    });
    portableProviderUnpublish.mockResolvedValueOnce(undefined);
    const snapshot: ShareProjectSnapshot = { entryPath: 'main.ts', files: [], warnings: [] };
    renderPanel(
      <ProjectSharePanel
        projectId='proj_manage_gist'
        projectName='Gist'
        entryPath='main.ts'
        collectSnapshot={vi.fn(async () => snapshot)}
        initialMethod='github-gist'
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Create Gist and copy link' }));
    expect(await screen.findByLabelText('Share link')).toHaveValue(
      `https://tau.example/s/github-gist~abc123.${'a'.repeat(40)}`,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Manage GitHub Gist' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Update Gist' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Share link')).toHaveValue(
        `https://tau.example/s/github-gist~abc123.${'b'.repeat(40)}`,
      );
    });
    expect(toastSuccessMock).toHaveBeenCalledWith('Gist updated. The link changed, so copy it again.');
    expect(portableProviderRepublish).toHaveBeenCalledWith(
      {
        locator: { providerId: 'github-gist', reference: `abc123.${'a'.repeat(40)}` },
        snapshot,
        protection: { kind: 'none' },
      },
      expect.anything(),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Manage GitHub Gist' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete Gist…' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog', { name: 'Delete this Gist?' })).getByRole('button', {
        name: 'Delete Gist',
      }),
    );

    expect(await screen.findByRole('button', { name: 'Create Gist and copy link' })).toBeEnabled();
    expect(portableProviderUnpublish).toHaveBeenCalledWith(
      { locator: { providerId: 'github-gist', reference: `abc123.${'a'.repeat(40)}` } },
      expect.anything(),
    );
    expect(screen.queryByLabelText('Share link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage GitHub Gist' })).not.toBeInTheDocument();
  });

  it('should bring a Manage reconnect back to the workbench with Share open (R8)', async () => {
    getGithubGistConnectionStatus.mockResolvedValue('connected');
    portableProviderPublish.mockResolvedValueOnce({
      locator: { providerId: 'github-gist', reference: `abc123.${'a'.repeat(40)}` },
      secrets: {},
    });
    portableProviderRepublish.mockRejectedValueOnce(
      new ShareError('SHARE_AUTH_REQUIRED', 'The GitHub connection needs to be renewed.'),
    );
    renderPanel(
      <ProjectSharePanel
        projectId='proj_manage_reconnect'
        projectName='Gist'
        entryPath='main.ts'
        collectSnapshot={vi.fn(async () => ({ entryPath: 'main.ts', files: [], warnings: [] }))}
        initialMethod='github-gist'
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Create Gist and copy link' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Manage GitHub Gist' }));
    getGithubGistConnectionStatus.mockResolvedValue('not-connected');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Update Gist' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Connect GitHub' }));

    expect(connectGithubGist).toHaveBeenCalledWith({
      returnUrl: globalThis.location.href,
      surface: 'editor',
    });
  });

  it('should open on the sharing method chosen last time (R8)', async () => {
    const collectSnapshot = vi.fn(async () => ({ entryPath: 'main.ts', files: [], warnings: [] }));
    const first = renderPanel(
      <ProjectSharePanel
        projectId='proj_remembered'
        projectName='Remembered'
        entryPath='main.ts'
        collectSnapshot={collectSnapshot}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Share with Direct link' }));
    await userEvent.click(screen.getByRole('option', { name: /^GitHub Gist/u }));
    first.unmount();

    renderPanel(
      <ProjectSharePanel
        projectId='proj_remembered'
        projectName='Remembered'
        entryPath='main.ts'
        collectSnapshot={collectSnapshot}
      />,
    );

    expect(screen.getByRole('button', { name: 'Share with GitHub Gist' })).toBeInTheDocument();
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

  it('stops saying it is checking Gist access once the check answers', async () => {
    getGithubGistConnectionStatus.mockResolvedValueOnce('connected');
    renderPanel(
      <ProjectSharePanel
        projectId='proj_gist_returned'
        projectName='Gist'
        entryPath='main.ts'
        collectSnapshot={vi.fn(async () => ({ entryPath: 'main.ts', files: [], warnings: [] }))}
        initialMethod='github-gist'
        githubAuthorizationOutcome='returned'
      />,
    );

    expect(screen.getByText('Checking your GitHub connection…')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Gist and copy link' })).toBeEnabled();
    });
    expect(screen.queryByText('Checking your GitHub connection…')).not.toBeInTheDocument();
  });

  it('presents signed-out Tau persistence as a normal state', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response);

    renderPanel(<ProjectSharePanel projectId='proj_signed_out' projectName='Demo' entryPath='main.ts' />);

    expect(await screen.findByText('Sign in to create a cloud link')).toBeInTheDocument();
    expect(screen.getByText('Cloud links are saved to your account.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Without a snapshot collector the pane offers no direct link, so it does not suggest one.
    expect(screen.queryByText(/use a direct link/i)).not.toBeInTheDocument();
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

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load this project's cloud link");
    expect(screen.getByText('Check your connection, then try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  /* #2304: Tau Cloud answers 410 PROJECT_DELETED for a project whose cloud copy was deleted. */
  it('says a project whose cloud copy was deleted has none, rather than blaming the network', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 410, headers: new Headers() } as Response);

    renderPanel(<ProjectSharePanel projectId='proj_cloud_deleted' projectName='Demo' entryPath='main.ts' />);

    expect(await screen.findByText("This project isn't in the cloud")).toBeInTheDocument();
    expect(screen.getByText(/duplicate the project and share the copy/iu)).toBeInTheDocument();
    expect(screen.queryByText('Check your connection, then try again.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('offers Publish and copy link for a project with no link, private by default and with nothing to name', async () => {
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    const section = await screen.findByRole('region', { name: 'Link' });
    expect(
      within(section).getByText(
        'People who open the link see the version you publish. Tau keeps a copy so the link works anywhere.',
      ),
    ).toBeInTheDocument();
    expect(within(section).getByRole('radiogroup', { name: 'Who can open the link' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /only people you invite/i })).toBeChecked();
    /* One link, named by the project: no version name, title, description or invite field before it exists. */
    expect(screen.queryByRole('combobox', { name: /version name/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /title|description/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /invite people/iu })).not.toBeInTheDocument();
    expect(screen.queryByText(/stopped sharing/iu)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish and copy link/i })).toBeEnabled();
    expect(globalThis.fetch).toHaveBeenCalledWith('https://api.example/v1/projects/proj_ui/share', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  });

  it('publishes an auto-named version as one gesture, leaving a first publish to the server default (private)', async () => {
    renderPanel(
      <ProjectSharePanel
        projectId='proj_ok'
        projectName='Demo'
        projectDescription='a beautiful model'
        entryPath='main.ts'
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: /publish and copy link/i }));

    /* No name: the worker names it "Shared Nov 19", and an entry that already is a version keeps its own name. */
    expect(revisionStatusHarness.commands.publishProject).toHaveBeenCalledExactlyOnceWith();
    expect(revisionStatusHarness.commands.confirmPublish).toHaveBeenCalledExactlyOnceWith({
      tag: '',
      isAutoNamed: true,
      projectName: 'Demo',
      description: 'a beautiful model',
      entryPath: 'main.ts',
    });
  });

  it('starts the copy inside the publish press, copies the link the machine makes and releases the machine', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJsonResponse(unpublishedEnvelope))
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope));
    const view = renderPanel(<ProjectSharePanel projectId='proj_ok' projectName='Demo' entryPath='main.ts' />);

    await userEvent.click(await screen.findByRole('button', { name: /publish and copy link/i }));
    expect(revisionStatusHarness.commands.confirmPublish).toHaveBeenCalledOnce();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();

    publishFacet({ phase: 'success', shareUrl: 'https://tau.example/s/tau~shr_ui' });
    view.rerender(panelElement('proj_ok'));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledExactlyOnceWith('https://tau.example/s/tau~shr_ui');
    });
    await waitFor(() => {
      expect(revisionStatusHarness.commands.resetPublish).toHaveBeenCalled();
    });
    expect(toastSuccessMock).toHaveBeenCalledWith('Published. Link copied');
    expect(await screen.findByRole('heading', { name: 'Invited (1)' })).toBeInTheDocument();
    expect(screen.getByText('friend@example.com')).toBeInTheDocument();
    /* The publish button went away with the form; focus lands on the new primary. */
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copy link' })).toHaveFocus();
    });
  });

  it('settles a second publish to the same link as Publish changes, with no copy', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJsonResponse(unpublishedEnvelope))
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope))
      .mockResolvedValue(mockJsonResponse(republishedEnvelope));
    const view = renderPanel(<ProjectSharePanel projectId='proj_ok' projectName='Demo' entryPath='main.ts' />);
    const link = 'https://tau.example/s/tau~shr_ui';

    await userEvent.click(await screen.findByRole('button', { name: /publish and copy link/i }));
    publishFacet({ phase: 'success', shareUrl: link });
    view.rerender(panelElement('proj_ok'));
    await waitFor(() => {
      expect(revisionStatusHarness.commands.resetPublish).toHaveBeenCalledOnce();
    });

    /* The reset returns the machine to idle and keeps the link it made; then the project changes. */
    publishFacet({ phase: 'idle', shareUrl: link });
    headOfMainAt('rev_v3');
    historyOfMain('rev_v3', 'rev_v2');
    view.rerender(panelElement('proj_ok'));
    await userEvent.click(await screen.findByRole('button', { name: 'Publish changes' }));
    publishFacet({ phase: 'success', shareUrl: link, publicationId: 'pub_v3' });
    view.rerender(panelElement('proj_ok'));

    await waitFor(() => {
      expect(revisionStatusHarness.commands.resetPublish).toHaveBeenCalledTimes(2);
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
    expect(toastSuccessMock).toHaveBeenLastCalledWith('Published V3. The link now shows it.');
  });

  it('names no version when another device published after this one, before the refresh', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope))
      /* This device published V3; another published V4 before the link was read again. */
      .mockResolvedValue(
        mockJsonResponse({
          ...publishedEnvelope,
          share: { ...sharedLink, currentVersion: { publicationId: 'pub_v4', tag: 'v4', revisionId: 'rev_v4' } },
        }),
      );
    headOfMainAt('rev_v3');
    historyOfMain('rev_v3', 'rev_v2');
    const view = renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    await userEvent.click(await screen.findByRole('button', { name: 'Publish changes' }));
    publishFacet({ phase: 'success', shareUrl: 'https://tau.example/s/tau~shr_ui', publicationId: 'pub_v3' });
    view.rerender(panelElement('proj_ui'));

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('Published.');
    });
    expect(toastSuccessMock).not.toHaveBeenCalledWith(expect.stringContaining('V4'));
  });

  it('hands the clipboard a pending link in the publish press, before the machine has made it', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockJsonResponse(unpublishedEnvelope));
    const write = vi.fn<(items: unknown[]) => Promise<void>>(async () => undefined);
    Object.defineProperty(navigator.clipboard, 'write', { configurable: true, value: write });
    vi.stubGlobal(
      'ClipboardItem',
      class {
        declare public readonly items: unknown;

        public constructor(items: unknown) {
          Object.assign(this, { items });
        }
      },
    );
    renderPanel(<ProjectSharePanel projectId='proj_ok' projectName='Demo' entryPath='main.ts' />);

    await userEvent.click(await screen.findByRole('button', { name: /publish and copy link/i }));

    /* The machine has not answered: the write is already running, so Safari counts the press as its gesture. */
    expect(write).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator.clipboard, 'write');
  });

  it('says Published and selects the link when the clipboard refuses the publish copy', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJsonResponse(unpublishedEnvelope))
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope));
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'));
    const view = renderPanel(<ProjectSharePanel projectId='proj_ok' projectName='Demo' entryPath='main.ts' />);

    await userEvent.click(await screen.findByRole('button', { name: /publish and copy link/i }));
    publishFacet({ phase: 'success', shareUrl: 'https://tau.example/s/tau~shr_ui' });
    view.rerender(panelElement('proj_ok'));

    expect(await screen.findByText('Select the link and copy it.')).toBeVisible();
    expect(toastSuccessMock).toHaveBeenCalledWith('Published');
    expect(toastErrorMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveFocus();
    });
  });

  it("invites and removes people on the project's link", async () => {
    const reloadedEnvelope = { ...publishedEnvelope, share: { ...sharedLink, access: { grants: [] } } };
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope))
      .mockResolvedValueOnce(mockJsonResponse({ id: 'sga_2', email: { status: 'sent' } }))
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope))
      .mockResolvedValueOnce(mockJsonResponse({ status: 'revoked' }))
      .mockResolvedValueOnce(mockJsonResponse(reloadedEnvelope));

    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    await userEvent.type(
      await screen.findByRole('combobox', { name: 'Invite people by email' }),
      'Team@Example.com{Enter}',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('https://api.example/v1/projects/proj_ui/share/access', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'team@example.com', notifyRecipient: true }),
      });
    });
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('Invited team@example.com.');
    });

    await userEvent.click(await screen.findByRole('button', { name: /remove access for friend@example.com/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('https://api.example/v1/projects/proj_ui/share/access/sga_1', {
        method: 'DELETE',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
    });
  });

  it('says the project changed since the version the link shows and publishes the changes to the same link', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(publishedEnvelope));
    headOfMainAt('rev_after_v2');
    historyOfMain('rev_after_v2', 'rev_v2');
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    const notice = await screen.findByText(
      "You've changed this project since you published V2. People who open the link still see V2.",
    );
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publish changes' }));

    /* The link keeps its setting and its invited people: no visibility, and nothing copied. */
    expect(revisionStatusHarness.commands.publishProject).toHaveBeenCalledExactlyOnceWith();
    expect(revisionStatusHarness.commands.confirmPublish).toHaveBeenCalledExactlyOnceWith({
      tag: '',
      isAutoNamed: true,
      projectName: 'Demo',
      entryPath: 'main.ts',
    });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(notice).toBeInTheDocument();
  });

  it('offers only Copy link when the link shows the head of main', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(publishedEnvelope));
    headOfMainAt('rev_v2');
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    const section = await screen.findByRole('region', { name: 'Link' });
    expect(
      within(section)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Copy link']);
    expect(screen.queryByText(/you've changed this project/iu)).not.toBeInTheDocument();
  });

  it('offers no publish when this device is behind the version the link shows', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(publishedEnvelope));
    /* V2 was published from another device after this one's head. */
    headOfMainAt('rev_v1');
    historyOfMain('rev_v2', 'rev_v1');
    const { useRevisionClient } = await import('#hooks/use-revision-status.js');
    const client = (useRevisionClient as () => { divergence: (head: string, base: string) => Promise<unknown> })();
    const divergence = vi.spyOn(client, 'divergence');
    onTestFinished(() => {
      divergence.mockRestore();
    });
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    const section = await screen.findByRole('region', { name: 'Link' });
    await waitFor(async () => {
      await expect(divergence.mock.results[0]?.value).resolves.toEqual({ ahead: 0, behind: 1 });
    });
    expect(
      within(section)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Copy link']);
    expect(screen.queryByText(/you've changed this project/iu)).not.toBeInTheDocument();
  });

  it('offers no publish when the version the link shows is not on this device yet', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(publishedEnvelope));
    headOfMainAt('rev_v1');
    historyOfMain('rev_v1');
    const { useRevisionClient } = await import('#hooks/use-revision-status.js');
    const client = (useRevisionClient as () => { divergence: (head: string, base: string) => Promise<unknown> })();
    const divergence = vi.spyOn(client, 'divergence').mockRejectedValue(new Error('NOT_FOUND'));
    onTestFinished(() => {
      divergence.mockRestore();
    });
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    const section = await screen.findByRole('region', { name: 'Link' });
    await waitFor(() => {
      expect(divergence).toHaveBeenCalledWith('rev_v1', 'rev_v2');
    });
    expect(
      within(section)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Copy link']);
    expect(screen.queryByText(/you've changed this project/iu)).not.toBeInTheDocument();
  });

  it('reads the head of main from the branch list on another branch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(publishedEnvelope));
    const { status } = revisionStatusHarness;
    revisionStatusHarness.status = {
      ...status,
      line: { kind: 'branch', name: 'lid-fit' },
      headRevisionId: 'rev_lid' as (typeof status)['headRevisionId'],
      /* Typed from the harness's own `main` row, so the fixture is checked against the projection. */
      branches: status.branches.flatMap((branch) => [
        { ...branch, head: 'rev_v2' as (typeof status)['headRevisionId'] },
        { ...branch, name: 'lid-fit', checkoutId: 'lid-fit', head: 'rev_lid' as (typeof status)['headRevisionId'] },
      ]),
    };
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    await screen.findByRole('region', { name: 'Link' });
    expect(screen.queryByRole('button', { name: 'Publish changes' })).not.toBeInTheDocument();
  });

  it('offers only Copy link when the head of main is not known, since a publish could take the link back', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(publishedEnvelope));
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    const section = await screen.findByRole('region', { name: 'Link' });
    expect(
      within(section)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Copy link']);
    expect(screen.queryByText(/you've changed this project/iu)).not.toBeInTheDocument();
  });

  it('offers only Copy link before the revision status has answered', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(publishedEnvelope));
    revisionStatusHarness.connected = false;
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    const section = await screen.findByRole('region', { name: 'Link' });
    expect(
      within(section)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Copy link']);
  });

  it('offers Publish changes without the sentence when the link shows no version yet', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockJsonResponse({ ...publishedEnvelope, share: { ...sharedLink, currentVersion: null } }));
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    const section = await screen.findByRole('region', { name: 'Link' });
    expect(
      within(section)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Publish changes', 'Copy link']);
    expect(screen.queryByText(/you've changed this project/iu)).not.toBeInTheDocument();
  });

  it('switches a private link to public and folds away the invite field and list', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope))
      .mockResolvedValueOnce(mockJsonResponse(publicEnvelope.share))
      .mockResolvedValueOnce(mockJsonResponse(publicEnvelope));

    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    const accessSelect = await screen.findByRole('combobox', { name: /who can open the link/i });
    await userEvent.click(accessSelect);
    await userEvent.click(await screen.findByRole('option', { name: 'Anyone with the link' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('https://api.example/v1/projects/proj_ui/share', {
        method: 'PATCH',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'public' }),
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /who can open the link/i })).toHaveTextContent(
        'Anyone with the link',
      );
    });

    expect(screen.queryByText('friend@example.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Invite people by email' })).not.toBeInTheDocument();
    expect(toastSuccessMock).toHaveBeenCalledWith('Anyone with the link can open it now.');
  });

  it('switches a public link back to private and restores recipient entry', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJsonResponse(publicEnvelope))
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope.share))
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope));

    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    const accessSelect = await screen.findByRole('combobox', { name: /who can open the link/i });
    await userEvent.click(accessSelect);
    await userEvent.click(await screen.findByRole('option', { name: 'Only people you invite' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('https://api.example/v1/projects/proj_ui/share', {
        method: 'PATCH',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'private' }),
      });
    });

    expect(await screen.findByRole('combobox', { name: 'Invite people by email' })).toBeInTheDocument();
    expect(screen.getByText('friend@example.com')).toBeInTheDocument();
    expect(toastSuccessMock).toHaveBeenCalledWith('Only people you invite can open the link now.');
  });

  it('keeps previous visibility and shows an error toast when visibility update fails', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope))
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response);

    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    const accessSelect = await screen.findByRole('combobox', { name: /who can open the link/i });
    await userEvent.click(accessSelect);
    await userEvent.click(await screen.findByRole('option', { name: 'Anyone with the link' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Couldn't change who can open the link. Try again.");
    });
    expect(screen.getByRole('combobox', { name: /who can open the link/i })).toHaveTextContent(
      'Only people you invite',
    );
  });

  it('asks before it stops sharing, then says so and offers to publish the same link again', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope))
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response)
      .mockResolvedValueOnce(mockJsonResponse(stoppedEnvelope));
    headOfMainAt('rev_v2');
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    await userEvent.click(await screen.findByRole('button', { name: 'Stop sharing…' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Stop sharing this project?' });
    expect(dialog).toHaveTextContent(
      'The link stops working for everyone, including people you invited. Anyone who already opened it may still have a copy. Publishing again turns the same link back on.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop sharing' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('https://api.example/v1/projects/proj_ui/share', {
        method: 'DELETE',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
    });
    expect(
      await screen.findByText(
        'You stopped sharing this project. Publishing turns the same link back on, for the same people.',
      ),
    ).toBeInTheDocument();
    expect(toastSuccessMock).toHaveBeenCalledWith('Stopped sharing. The link no longer works.');
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /publish and copy link/i })).toHaveFocus();
    });
  });

  it('keeps the link when Stop sharing is cancelled or refused', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope))
      .mockResolvedValueOnce({ ok: false, status: 500, headers: new Headers() } as Response);
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    const stop = await screen.findByRole('button', { name: 'Stop sharing…' });
    await userEvent.click(stop);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(stop).toHaveFocus();
    });

    await userEvent.click(stop);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Stop sharing' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Couldn't stop sharing. Try again.");
    });
    expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveValue('https://tau.example/s/tau~shr_ui');
  });

  it('turns a stopped link back on by publishing, with its own setting and a copy', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        mockJsonResponse({ ...stoppedEnvelope, share: { ...stoppedEnvelope.share, visibility: 'public' } }),
      );
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    expect(await screen.findByText(/you stopped sharing this project/iu)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /anyone with the link/i })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: /publish and copy link/i }));

    /* Nothing picked, so nothing named: the server keeps the link's own setting. */
    expect(revisionStatusHarness.commands.confirmPublish).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ isAutoNamed: true }),
    );
    expect(vi.mocked(revisionStatusHarness.commands.confirmPublish).mock.calls[0]?.[0]).not.toHaveProperty(
      'visibility',
    );
  });

  it('sends the setting the person picked when turning a stopped link back on', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(stoppedEnvelope));
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    await userEvent.click(await screen.findByRole('radio', { name: /anyone with the link/i }));
    await userEvent.click(screen.getByRole('button', { name: /publish and copy link/i }));

    expect(revisionStatusHarness.commands.confirmPublish).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ visibility: 'public' }),
    );
  });

  it('keeps a stopped link stopped when an earlier refresh answers after it', async () => {
    let releaseInviteRefresh: (() => void) | undefined;
    let envelopeReads = 0;
    globalThis.fetch = vi.fn<typeof fetch>(async (input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.endsWith('/share/access')) {
        return mockJsonResponse({ id: 'sga_2', email: { status: 'sent' } });
      }
      if (init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      envelopeReads += 1;
      if (envelopeReads === 2) {
        /* The invite's refresh read the link while it was still on, and answers last. */
        await new Promise<void>((resolve) => {
          releaseInviteRefresh = resolve;
        });
        return mockJsonResponse(publishedEnvelope);
      }
      return mockJsonResponse(envelopeReads === 1 ? publishedEnvelope : stoppedEnvelope);
    });
    headOfMainAt('rev_v2');
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    await userEvent.type(
      await screen.findByRole('combobox', { name: 'Invite people by email' }),
      'Team@Example.com{Enter}',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }));
    await waitFor(() => {
      expect(releaseInviteRefresh).toBeDefined();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Stop sharing…' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Stop sharing' }));
    expect(await screen.findByText(/you stopped sharing this project/iu)).toBeInTheDocument();

    releaseInviteRefresh?.();

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('Invited team@example.com.');
    });
    expect(screen.getByText(/you stopped sharing this project/iu)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
  });

  it('starts a later publish from the link’s saved setting, not the choice an earlier publish saved', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJsonResponse(unpublishedEnvelope))
      /* Since that publish, the link was made invite-only and stopped (here, or on another device). */
      .mockResolvedValue(mockJsonResponse(stoppedEnvelope));
    const view = renderPanel(<ProjectSharePanel projectId='proj_ok' projectName='Demo' entryPath='main.ts' />);

    await userEvent.click(await screen.findByRole('radio', { name: /anyone with the link/i }));
    await userEvent.click(screen.getByRole('button', { name: /publish and copy link/i }));
    publishFacet({ phase: 'success', shareUrl: 'https://tau.example/s/tau~shr_ui' });
    view.rerender(panelElement('proj_ok'));

    expect(await screen.findByText(/you stopped sharing this project/iu)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /only people you invite/i })).toBeChecked();
  });

  it('keeps the choice when the publish fails, so a retry sends it again', async () => {
    const view = renderPanel(<ProjectSharePanel projectId='proj_ok' projectName='Demo' entryPath='main.ts' />);

    await userEvent.click(await screen.findByRole('radio', { name: /anyone with the link/i }));
    await userEvent.click(screen.getByRole('button', { name: /publish and copy link/i }));
    publishFacet({ phase: 'error', error: 'Couldn’t publish this version. Try again.' });
    view.rerender(panelElement('proj_ok'));

    expect(await screen.findByRole('radio', { name: /anyone with the link/i })).toBeChecked();
  });

  it('acknowledges a publish without saying the link shows it when the link is stopped', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJsonResponse(publishedEnvelope))
      .mockResolvedValue(mockJsonResponse(stoppedEnvelope));
    headOfMainAt('rev_after_v2');
    historyOfMain('rev_after_v2', 'rev_v2');
    const view = renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    await userEvent.click(await screen.findByRole('button', { name: 'Publish changes' }));
    publishFacet({ phase: 'success', shareUrl: 'https://tau.example/s/tau~shr_ui', publicationId: 'pub_ui' });
    view.rerender(panelElement('proj_ui'));

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('Published V2.');
    });
    expect(toastSuccessMock).not.toHaveBeenCalledWith(expect.stringContaining('now shows'));
  });

  it('refuses a link whose invited list holds something that is not an invited person', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        mockJsonResponse({ ...publishedEnvelope, share: { ...sharedLink, access: { grants: [invitedFriend, null] } } }),
      );
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load this project's cloud link");
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
  });

  it('shows Publishing with a spinner while the machine is working', async () => {
    publishFacet({ phase: 'working' });
    renderPanel(<ProjectSharePanel projectId='proj_busy' projectName='Demo' entryPath='main.ts' />);

    const publishingButton = await screen.findByRole('button', { name: /publishing/iu });
    expect(publishingButton).toBeDisabled();
    expect(publishingButton).toHaveAttribute('aria-busy', 'true');
    expect(within(publishingButton).getByText(/publishing/i)).toBeInTheDocument();
    expect(screen.getAllByRole('status').some((element) => element.textContent === 'Publishing…')).toBe(true);
  });

  it('presents the failure as the one sentence the machine wrote', async () => {
    publishFacet({ phase: 'error', error: 'This version is larger than 50 MB. Remove some files and try again.' });
    renderPanel(<ProjectSharePanel projectId='proj_huge' projectName='Huge' entryPath='main.ts' />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This version is larger than 50 MB. Remove some files and try again.');
    expect(within(alert).queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
  });

  it('offers sign-in only when the sentence asks for it', async () => {
    publishFacet({ phase: 'error', error: 'Sign in to publish to the cloud.' });
    renderPanel(<ProjectSharePanel projectId='proj_signin' projectName='Demo' entryPath='main.ts' />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('draws the first load as a skeleton and keeps the content on screen through a reload', async () => {
    const envelope = Promise.withResolvers<Response>();
    globalThis.fetch = vi.fn(async () => envelope.promise);
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    const loading = await screen.findByRole('status', { name: 'Loading cloud link' });
    expect(loading).toHaveAttribute('aria-busy', 'true');
    envelope.resolve(mockJsonResponse(publishedEnvelope));

    expect(await screen.findByRole('textbox', { name: 'Share link' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading cloud link' })).not.toBeInTheDocument();
  });

  it('copies the link inside the press and names the version it shows and when', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(publishedEnvelope));
    publishFacet({ tags: [tag(2, 'Shared Jan 2')] });
    headOfMainAt('rev_v2');
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    const section = await screen.findByRole('region', { name: 'Link' });
    expect(section).toHaveTextContent(/Shows V2 · Shared Jan 2, published .*2026\./u);
    expect(within(section).getByRole('textbox', { name: 'Share link' })).toHaveValue(
      'https://tau.example/s/tau~shr_ui',
    );

    await userEvent.click(within(section).getByRole('button', { name: 'Copy link' }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledExactlyOnceWith('https://tau.example/s/tau~shr_ui');
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('Link copied');
    });
    expect(revisionStatusHarness.commands.publishProject).not.toHaveBeenCalled();
  });

  it('selects the link for a manual copy when the clipboard refuses it', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(publishedEnvelope));
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'));
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    await userEvent.click(await screen.findByRole('button', { name: 'Copy link' }));

    expect(await screen.findByText('Select the link and copy it.')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveFocus();
  });

  it('offers a direct link when the cloud link needs an account the person has not signed in to', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response);
    renderPanel(
      <ProjectSharePanel
        projectId='proj_signed_out'
        projectName='Demo'
        entryPath='main.ts'
        collectSnapshot={vi.fn(async () => ({ entryPath: 'main.ts', files: [], warnings: [] }))}
        initialMethod='tau'
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Use a direct link' }));

    expect(screen.getByRole('button', { name: 'Share with Direct link' })).toBeInTheDocument();
  });

  it('names imported files the direct link leaves out, and a project with no model file, in plain words', async () => {
    const collectSnapshot = vi
      .fn()
      .mockRejectedValueOnce(new Error(missingModelFileMessage))
      .mockResolvedValueOnce({
        entryPath: 'main.ts',
        files: [],
        warnings: [
          { code: 'UNRESOLVED_DEPENDENCY', message: 'a' },
          { code: 'UNRESOLVED_DEPENDENCY', message: 'b' },
        ],
      });
    renderPanel(
      <ProjectSharePanel
        projectId='proj_warn'
        projectName='Warn'
        entryPath='main.ts'
        collectSnapshot={collectSnapshot}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This project has no model file to share yet.');

    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(
      await screen.findByText(
        "2 imported files couldn't be found and aren't in the link. The model may not build for people who open it.",
      ),
    ).toBeInTheDocument();
  });

  it("says why a share failed by its code, never in the provider's words", async () => {
    portableProviderPublish.mockRejectedValueOnce(new ShareError('SHARE_ARTIFACT_LIMIT', 'Artifact exceeds 26214400'));
    renderPanel(
      <ProjectSharePanel
        projectId='proj_large'
        projectName='Large'
        entryPath='main.ts'
        collectSnapshot={vi.fn(async () => ({ entryPath: 'main.ts', files: [], warnings: [] }))}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This project is too large for a direct link. Use a cloud link or a GitHub Gist instead.',
    );
    expect(screen.queryByText(/26214400/u)).not.toBeInTheDocument();
  });

  it('offers Try again when the GitHub connection cannot be checked', async () => {
    getGithubGistConnectionStatus.mockRejectedValueOnce(new Error('offline'));
    renderPanel(
      <ProjectSharePanel
        projectId='proj_gist_check'
        projectName='Gist'
        entryPath='main.ts'
        collectSnapshot={vi.fn(async () => ({ entryPath: 'main.ts', files: [], warnings: [] }))}
        initialMethod='github-gist'
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't check your GitHub connection. Try again.");
    getGithubGistConnectionStatus.mockResolvedValueOnce('connected');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Create Gist and copy link' })).toBeEnabled();
  });

  it("draws the host sections after the method, in the pane's one scroll area", async () => {
    renderPanel(
      <ProjectSharePanel
        projectId='proj_ui'
        projectName='Demo'
        entryPath='main.ts'
        extraSections={<p>People section</p>}
      />,
    );

    const scroller = screen
      .getByRole('region', { name: 'Share project' })
      .querySelector('[data-slot=share-pane-scroll]');
    expect(scroller).toContainElement(screen.getByText('People section'));
    expect(scroller).toContainElement(await screen.findByRole('region', { name: 'Link' }));
  });
});

describe('publishedVersionLabel', () => {
  it.each([
    ['v2', [tag(2, 'Ready for print')], 'V2 · Ready for print'],
    ['v4', [tag(2, 'Ready for print')], 'V4'],
    ['Ready for print', [tag(2, 'Ready for print')], 'An earlier version'],
  ] as const)('labels %s as %s', (published, versions, expected) => {
    expect(publishedVersionLabel(published, versions)).toBe(expected);
  });
});

describe('ProjectSharePanel free-tier visibility gate (T5)', () => {
  beforeEach(() => {
    useEntitlementsMock.mockReturnValue({ ...entitlementsFromTier('free'), isResolved: true });
    revisionStatusHarness.reset();
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(unpublishedEnvelope));
  });

  it('locks the private option and defaults free users to public', async () => {
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    expect(await screen.findByRole('region', { name: 'Link' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /only people you invite/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /anyone with the link/i })).toBeChecked();
  });

  it('routes the upgrade affordance to billing settings', async () => {
    const user = userEvent.setup();
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    await screen.findByRole('region', { name: 'Link' });
    await user.click(screen.getByRole('button', { name: /upgrade/i }));

    expect(openSettingsDialogMock).toHaveBeenCalledWith('billing');
  });

  it('asks who can open a first link while the plan is still loading, rather than assuming private', async () => {
    useEntitlementsMock.mockReturnValue({ ...entitlementsFromTier('free'), isResolved: false });
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    const publish = await screen.findByRole('button', { name: /publish and copy link/i });
    expect(publish).toBeDisabled();
    expect(screen.getByRole('radio', { name: /only people you invite/i })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /anyone with the link/i })).not.toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: /anyone with the link/i }));
    await userEvent.click(publish);

    expect(revisionStatusHarness.commands.confirmPublish).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ visibility: 'public' }),
    );
  });

  it('publishes a stopped link again while the plan is still loading, keeping its own setting', async () => {
    useEntitlementsMock.mockReturnValue({ ...entitlementsFromTier('free'), isResolved: false });
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(stoppedEnvelope));
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    await userEvent.click(await screen.findByRole('button', { name: /publish and copy link/i }));

    /* Neither setting is named: the server keeps the link's own. */
    expect(revisionStatusHarness.commands.confirmPublish).toHaveBeenCalledOnce();
    expect(vi.mocked(revisionStatusHarness.commands.confirmPublish).mock.calls[0]?.[0]).not.toHaveProperty(
      'visibility',
    );
    expect(vi.mocked(revisionStatusHarness.commands.confirmPublish).mock.calls[0]?.[0]).not.toHaveProperty(
      'defaultVisibility',
    );
  });

  it('names public only as the default for a link the first publish makes, so a link made elsewhere keeps its own', async () => {
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    await userEvent.click(await screen.findByRole('button', { name: /publish and copy link/i }));

    expect(revisionStatusHarness.commands.confirmPublish).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ defaultVisibility: 'public' }),
    );
    expect(vi.mocked(revisionStatusHarness.commands.confirmPublish).mock.calls[0]?.[0]).not.toHaveProperty(
      'visibility',
    );
  });

  it('keeps a stopped invite-only link invite-only after the plan lapses (T16)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(stoppedEnvelope));
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    expect(await screen.findByText(/for the same people/iu)).toBeInTheDocument();
    const invited = screen.getByRole('radio', { name: /only people you invite/i });
    expect(invited).toBeEnabled();
    expect(invited).toBeChecked();
    expect(screen.queryByRole('button', { name: /upgrade/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /publish and copy link/i }));

    /* The server keeps the link's own setting: a lapsed plan never turns it public. */
    expect(revisionStatusHarness.commands.confirmPublish).toHaveBeenCalledOnce();
    expect(vi.mocked(revisionStatusHarness.commands.confirmPublish).mock.calls[0]?.[0]).not.toHaveProperty(
      'visibility',
    );
  });

  it('offers Stop sharing on every plan', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(publicEnvelope));
    renderPanel(<ProjectSharePanel projectId='proj_ui' projectName='Demo' entryPath='main.ts' />);

    expect(await screen.findByRole('button', { name: 'Stop sharing…' })).toBeEnabled();
  });
});
