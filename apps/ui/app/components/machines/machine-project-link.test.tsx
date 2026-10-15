// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MachineProjectLink } from '#components/machines/machine-project-link.js';
import { agentJob } from '#routes/w.$workspace.$project/chat-print.fixture.js';
const { getProjectListing } = vi.hoisted(() => ({ getProjectListing: vi.fn() }));
vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({ getProjectListing, isLoading: false }),
}));
afterEach(cleanup);
describe('machine source provenance', () => {
  it('uses current canonical project placement and keeps the exact qualified job in the link', async () => {
    const job = agentJob();
    const projects = [
      {
        manifest: { id: job.artifact.projectId, name: 'Walnut tray' },
        library: {},
        slugs: { workspaceSlug: 'new-home', projectSlug: 'renamed-tray' },
      },
    ];
    getProjectListing.mockResolvedValue({ projects });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['projects'], { projects });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <MachineProjectLink job={job} hostId='host-a' />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const link = await screen.findByRole('link', { name: /Open Walnut tray/u });
    const url = new URL(link.getAttribute('href')!, 'https://tau.new');
    expect(url.pathname).toBe('/w/new-home/renamed-tray');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      workbench: 'print',
      machineHost: 'host-a',
      machine: job.machineId,
      job: job.jobId,
    });
    expect(getProjectListing).not.toHaveBeenCalled();
    client.clear();
  });
  it.each([false, true])('provides an action for a missing or trashed source (trashed=%s)', async (trashed) => {
    const job = agentJob();
    getProjectListing.mockResolvedValue({
      projects: trashed ? [{ manifest: { id: job.artifact.projectId }, library: { deletedAt: '2026-10-15' } }] : [],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <MachineProjectLink job={job} hostId='host-a' />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('link', { name: 'Open projects' })).toHaveAttribute('href', '/projects');
    expect(screen.getByText(trashed ? /is in the trash/u : /is unavailable on this computer/u)).toBeInTheDocument();
    client.clear();
  });
});
