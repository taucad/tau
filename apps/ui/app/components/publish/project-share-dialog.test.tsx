// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { publicationApiCode } from '@taucad/types/constants';
import { ProjectShareDialog, formatPublishError } from '#components/publish/project-share-dialog.js';
import { publishOversizedProjectId, publishStalledProjectId } from '#machines/publish.machine.ui-test-double.js';
import * as publishMachineActual from '#machines/publish.machine.js';
import type * as useEntitlementsModule from '#hooks/use-entitlements.js';
import type * as useSettingsDialogModule from '#hooks/use-settings-dialog.js';
import { TooltipProvider } from '#components/ui/tooltip.js';

vi.mock('#environment.config.js', () => ({
  ENV: { TAU_API_URL: 'https://api.example' },
}));

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
vi.mock('#hooks/use-entitlements.js', async (importOriginal) => {
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
    urls: { share: 'https://tau.example/v/pub_ui' },
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

const renderDialog = (ui: ReactElement): ReturnType<typeof render> =>
  render(
    <MemoryRouter>
      <TooltipProvider>{ui}</TooltipProvider>
    </MemoryRouter>,
  );

describe('ProjectShareDialog', () => {
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

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(unpublishedEnvelope));
  });

  afterEach(() => {
    cleanup();
  });

  it('loads unpublished share state with private visibility selected', async () => {
    renderDialog(
      <ProjectShareDialog open onOpenChange={vi.fn()} projectId='proj_ui' projectName='Demo' entryPath='main.ts' />,
    );

    expect(await screen.findByText(/publish a snapshot/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /private/i })).toBeChecked();
    expect(screen.getByRole('button', { name: /publish and copy link/i })).toBeEnabled();
    expect(globalThis.fetch).toHaveBeenCalledWith('https://api.example/v1/projects/proj_ui/share', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  });

  it('prefills the first-publish form from the source project', async () => {
    renderDialog(
      <ProjectShareDialog
        open
        onOpenChange={vi.fn()}
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

    renderDialog(
      <ProjectShareDialog open onOpenChange={vi.fn()} projectId='proj_ok' projectName='Demo' entryPath='main.ts' />,
    );

    await userEvent.click(await screen.findByRole('button', { name: /publish and copy link/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://tau.example/v/proj_ok');
    });
    await waitFor(() => {
      expect(screen.getByText('People with access')).toBeInTheDocument();
    });

    expect(screen.getByText('friend@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
  });

  it('adds and revokes recipients from the editor dialog', async () => {
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

    renderDialog(
      <ProjectShareDialog open onOpenChange={vi.fn()} projectId='proj_ui' projectName='Demo' entryPath='main.ts' />,
    );

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

    renderDialog(
      <ProjectShareDialog
        open
        onOpenChange={vi.fn()}
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

    renderDialog(
      <ProjectShareDialog open onOpenChange={vi.fn()} projectId='proj_ui' projectName='Demo' entryPath='main.ts' />,
    );

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

    renderDialog(
      <ProjectShareDialog open onOpenChange={vi.fn()} projectId='proj_ui' projectName='Demo' entryPath='main.ts' />,
    );

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

    renderDialog(
      <ProjectShareDialog open onOpenChange={vi.fn()} projectId='proj_ui' projectName='Demo' entryPath='main.ts' />,
    );

    const accessSelect = await screen.findByRole('combobox', { name: /general access/i });
    await userEvent.click(accessSelect);
    await userEvent.click(await screen.findByRole('option', { name: 'Public' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('Could not update visibility');
    });
    expect(screen.getByRole('combobox', { name: /general access/i })).toHaveTextContent('Private');
  });

  it('disables publish when a shared email is invalid', async () => {
    renderDialog(
      <ProjectShareDialog
        open
        onOpenChange={vi.fn()}
        projectId='proj_invalid_email'
        projectName='Demo'
        entryPath='main.ts'
      />,
    );

    await userEvent.type(
      await screen.findByRole('textbox', { name: /share with specific emails/i }),
      'not-an-email{Enter}',
    );

    expect(screen.getByText(/enter a valid email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish and copy link/i })).toBeDisabled();
  });

  it('shows Publishing with spinner while publish is in flight', async () => {
    renderDialog(
      <ProjectShareDialog
        open
        onOpenChange={vi.fn()}
        projectId={publishStalledProjectId}
        projectName='Demo'
        entryPath='main.ts'
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: /publish and copy link/i }));

    const publishingButton = await screen.findByRole('button', { name: /publishing/iu });
    expect(publishingButton).toBeDisabled();
    expect(within(publishingButton).getByText(/publishing/i)).toBeInTheDocument();
  });

  it('shows actionable copy when payload is too large', async () => {
    renderDialog(
      <ProjectShareDialog
        open
        onOpenChange={vi.fn()}
        projectId={publishOversizedProjectId}
        projectName='Huge'
        entryPath='main.ts'
      />,
    );

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

describe('ProjectShareDialog free-tier visibility gate (T5)', () => {
  beforeEach(async () => {
    const { entitlementsFromTier } = await import('@taucad/billing');
    useEntitlementsMock.mockReturnValue(entitlementsFromTier('free'));
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse(unpublishedEnvelope));
  });

  it('locks the private option and defaults free users to public', async () => {
    renderDialog(
      <ProjectShareDialog open onOpenChange={vi.fn()} projectId='proj_ui' projectName='Demo' entryPath='main.ts' />,
    );

    expect(await screen.findByText(/publish a snapshot/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /private/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /public/i })).toBeChecked();
  });

  it('routes the upgrade affordance to billing settings', async () => {
    const user = userEvent.setup();
    renderDialog(
      <ProjectShareDialog open onOpenChange={vi.fn()} projectId='proj_ui' projectName='Demo' entryPath='main.ts' />,
    );

    await screen.findByText(/publish a snapshot/i);
    await user.click(screen.getByRole('button', { name: /upgrade/i }));

    expect(openSettingsDialogMock).toHaveBeenCalledWith('billing');
  });
});
