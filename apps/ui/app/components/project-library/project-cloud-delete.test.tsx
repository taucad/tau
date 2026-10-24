// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DropdownMenuItem } from '@taucad/ui/components/dropdown-menu';
import { ProjectActionMenu } from '#components/project-library/project-cloud-delete.js';
import { CloudProjectCard, OpenCloudProjectButton } from '#routes/projects_/cloud-projects.js';
import type { CloudProject } from '#hooks/use-cloud-projects.js';
import { setRevisionSessionUser } from '#lib/revision-actor.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- Deployment environment keys.
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' } }));
vi.mock('#hooks/use-cloud-project-preview.js', () => ({
  useCloudProjectPreview: () => ({ url: undefined, isLoading: false, isFailed: false, retry: vi.fn() }),
}));
vi.mock('#hooks/use-resolved-auth.js', () => ({ useResolvedAuth: () => 'authed' }));
vi.mock('#cloud/commercial-features.js', () => ({
  useCommercialFeatures: () => ({ isResolved: true, canSyncFiles: true }),
}));
const cloud: CloudProject = {
  id: 'cloud-only',
  name: 'Bracket',
  role: 'owner',
  canDeleteCloud: true,
  cloudState: 'active',
};
const clients: QueryClient[] = [];
const renderMenu = (project: CloudProject = cloud, isCloudOnly = true) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <ProjectActionMenu name={project.name} cloud={project} isCloudOnly={isCloudOnly}>
        {isCloudOnly ? null : <DropdownMenuItem>Restore</DropdownMenuItem>}
      </ProjectActionMenu>
    </QueryClientProvider>,
  );
};
beforeEach(() => {
  localStorage.clear();
  setRevisionSessionUser({ id: 'owner', name: 'Owner' });
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) {
    client.clear();
  }
  vi.unstubAllGlobals();
  setRevisionSessionUser(undefined);
});

describe('cloud deletion menu', () => {
  it.each([undefined, false])('should hide deletion when explicit capability is %s', async (capability) => {
    const user = userEvent.setup();
    renderMenu({ ...cloud, canDeleteCloud: capability });
    await user.click(screen.getByRole('button', { name: 'Actions for Bracket' }));
    expect(screen.queryByRole('menuitem', { name: 'Delete from Tau Cloud…' })).not.toBeInTheDocument();
  });
  it('should close the menu before named confirmation, focus Cancel and return focus on cancellation', async () => {
    const user = userEvent.setup();
    const request = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', request);
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Actions for Bracket' });
    trigger.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('alertdialog', { name: 'Delete “Bracket” from Tau Cloud?' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(
      screen.getByText(/Copies already downloaded to devices and independent forks are kept/u),
    ).toBeInTheDocument();
    expect(screen.getByText(/If you have not downloaded a copy elsewhere/u)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
    expect(request).not.toHaveBeenCalled();
  });
  it('should expose cloud deletion alongside local Trash restore with no cloud-only warning', async () => {
    const user = userEvent.setup();
    renderMenu(cloud, false);
    await user.click(screen.getByRole('button', { name: 'Actions for Bracket' }));
    expect(screen.getByRole('menuitem', { name: 'Restore' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Delete from Tau Cloud…' }));
    await screen.findByRole('alertdialog');
    expect(screen.queryByText(/If you have not downloaded a copy elsewhere/u)).not.toBeInTheDocument();
  });
  it('should retain an inline refusal and retry the same project ID', async () => {
    const user = userEvent.setup();
    const request = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      if (init?.method === 'DELETE') {
        return new Response(null, { status: 403 });
      }
      if (typeof input === 'string' && input.endsWith('/deletion')) {
        return Response.json({ projectId: cloud.id, state: 'active' });
      }
      return Response.json([cloud]);
    });
    vi.stubGlobal('fetch', request);
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Actions for Bracket' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete from Tau Cloud…' }));
    await user.click(await screen.findByRole('button', { name: 'Delete from Tau Cloud' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('403');
    await user.click(screen.getByRole('button', { name: 'Delete from Tau Cloud' }));
    await waitFor(() => {
      expect(request.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(2);
    });
    expect(request.mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => url)).toEqual([
      'https://api.test/v1/projects/cloud-only',
      'https://api.test/v1/projects/cloud-only',
    ]);
  });
  it('should wait for revision-session readiness and require an explicit confirmation after it resolves', async () => {
    setRevisionSessionUser(undefined);
    const user = userEvent.setup();
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ projectId: cloud.id, state: 'deleted' }));
    vi.stubGlobal('fetch', request);
    renderMenu(cloud, false);
    await user.click(screen.getByRole('button', { name: 'Actions for Bracket' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete from Tau Cloud…' }));
    const confirm = await screen.findByRole('button', { name: 'Delete from Tau Cloud' });
    expect(confirm).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for your cloud session');
    await user.click(confirm);
    expect(request).not.toHaveBeenCalled();

    act(() => {
      setRevisionSessionUser({ id: 'owner', name: 'Owner' });
    });
    expect(confirm).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
    await user.click(confirm);
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(request).toHaveBeenCalledExactlyOnceWith(
      'https://api.test/v1/projects/cloud-only',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
  it.each([true, false])(
    'should not transfer an open confirmation to another account (initially resolved: %s)',
    async (isInitiallyResolved) => {
      if (!isInitiallyResolved) {
        setRevisionSessionUser(undefined);
      }
      const user = userEvent.setup();
      const request = vi.fn<typeof fetch>();
      vi.stubGlobal('fetch', request);
      renderMenu();
      await user.click(screen.getByRole('button', { name: 'Actions for Bracket' }));
      await user.click(screen.getByRole('menuitem', { name: 'Delete from Tau Cloud…' }));
      const confirm = await screen.findByRole('button', { name: 'Delete from Tau Cloud' });
      if (!isInitiallyResolved) {
        act(() => {
          setRevisionSessionUser({ id: 'owner', name: 'Owner' });
        });
      }
      expect(confirm).toBeEnabled();
      act(() => {
        setRevisionSessionUser(undefined);
      });
      expect(confirm).toBeDisabled();
      act(() => {
        setRevisionSessionUser({ id: 'other-owner', name: 'Other owner' });
      });
      expect(confirm).toBeDisabled();
      expect(screen.getByRole('alert')).toHaveTextContent('Your cloud account changed');
      await user.click(confirm);
      expect(request).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    },
  );
  it('should keep pending cards and table buttons from opening while retaining the status menu', async () => {
    const user = userEvent.setup();
    const open = vi.fn(async () => undefined);
    const pending: CloudProject = { ...cloud, cloudState: 'deleting', canDeleteCloud: false };
    render(
      <>
        <CloudProjectCard entry={pending} onOpen={open} />
        <OpenCloudProjectButton entry={pending} onOpen={open} />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Open Bracket' }));
    expect(screen.getByRole('button', { name: 'Deleting from Tau Cloud… Bracket' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Actions for Bracket' }));
    expect(screen.getByRole('menuitem', { name: 'Check cloud deletion…' })).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });
  it('should open a cloud-only card menu without opening or downloading the project', async () => {
    const user = userEvent.setup();
    const open = vi.fn(async () => undefined);
    render(<CloudProjectCard entry={cloud} onOpen={open} />);
    await user.click(screen.getByRole('button', { name: 'Actions for Bracket' }));
    expect(screen.getByRole('menuitem', { name: 'Delete from Tau Cloud…' })).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });
});
