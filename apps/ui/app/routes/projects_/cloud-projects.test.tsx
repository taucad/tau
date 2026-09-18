// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectToManifest } from '@taucad/types';
import type { ProjectListItem } from '#types/project.types.js';

/**
 * W18 DEF-2 red pin (d): the second device's entry point.
 *
 * AC17 and AC21 both open with "on a second device", and until this section
 * existed there was no product path to one: no verb in `packages/cli`, no
 * control in `apps/ui` and no API route that lists a caller's projects. What is
 * pinned here is the affordance — the library names what this device does not
 * hold, and *Open* creates it under the remote's own id and connects the `tau`
 * remote, which is what makes W13's open pull materialize it.
 */

const held: ProjectListItem = {
  ...projectToManifest({
    id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
    name: 'Gearbox Alpha',
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  }),
  lastActivityAt: 0,
  locator: { backend: 'indexeddb', storageRootKey: 'indexeddb:tau-', relativeDirectory: '/gearbox-alpha' },
};

const { mockCreateProject, mockToastError } = vi.hoisted(() => ({
  mockCreateProject: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('#hooks/use-projects.js', () => ({ useProjects: () => ({ projects: [held] }) }));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ createProject: mockCreateProject }) }));
vi.mock('#components/ui/sonner.js', () => ({ toast: { error: mockToastError } }));
/* eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names. */
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' } }));

const { CloudProjects } = await import('#routes/projects_/cloud-projects.js');

/** The router's own answer to "where did *Open* take this device". */
function Where(): React.JSX.Element {
  const location = useLocation();
  return (
    <>
      <span data-testid='pathname'>{location.pathname}</span>
      <span data-testid='search'>{location.search}</span>
      <span data-testid='state'>{JSON.stringify(location.state)}</span>
    </>
  );
}

const mountCloudProjects = (): void => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/projects']}>
        <CloudProjects />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('CloudProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateProject.mockResolvedValue({
      id: 'proj_bbbbbbbbbbbbbbbbbbbbb',
      slugs: { workspaceSlug: 'home', projectSlug: 'bracket-beta' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          {
            id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
            name: 'Gearbox Alpha',
            updatedAt: '2026-09-13T01:00:00.000Z',
            role: 'owner',
          },
          {
            id: 'proj_bbbbbbbbbbbbbbbbbbbbb',
            name: 'Bracket Beta',
            updatedAt: '2026-09-13T02:00:00.000Z',
            role: 'owner',
          },
        ],
      })),
    );
  });

  it('names only the projects this device does not hold', async () => {
    mountCloudProjects();

    expect(await screen.findByRole('button', { name: 'Open' })).toBeDefined();
    expect(screen.getByText('Bracket Beta')).toBeDefined();
    /* Held locally, so it is the library's row and not an invitation to open a
       second copy of the same project id. */
    expect(screen.queryByText('Gearbox Alpha')).toBeNull();
  });

  it('opens one under the remote’s own id, with the Tau Cloud remote connected', async () => {
    mountCloudProjects();
    await userEvent.click(await screen.findByRole('button', { name: 'Open' }));

    await waitFor(() => {
      expect(screen.getByTestId('pathname').textContent).toBe('/w/home/bracket-beta');
    });
    /* The remote's id, because the id is the repository path there. */
    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'proj_bbbbbbbbbbbbbbbbbbbbb', files: {} }),
    );
    /* The project-scoped worker does the connect after navigation. */
    expect(screen.getByTestId('state').textContent).toBe('{"openFromTauCloud":true}');
    expect(screen.getByTestId('search').textContent).toBe('?cloudOpen=tau');
  });

  it('is absent when this device already holds everything', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ id: 'proj_aaaaaaaaaaaaaaaaaaaaa', name: 'Gearbox Alpha', updatedAt: '2026-09-13Z' }],
      })),
    );
    mountCloudProjects();

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    });
  });
  /**
   * W5b / D27: `GET /v1/projects` now lists collaborations beside owned rows,
   * each carrying the caller's role. A collaboration that reads like an owned
   * project is the one thing this section must not do — the row says whose it
   * is, and a view-only one says so before it is opened.
   */
  it('names a collaboration and the role held on it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { id: 'proj_ccccccccccccccccccccc', name: 'Shared Housing', updatedAt: '2026-09-18Z', role: 'write' },
          { id: 'proj_ddddddddddddddddddddd', name: 'Reference Jig', updatedAt: '2026-09-18Z', role: 'read' },
        ],
      })),
    );
    mountCloudProjects();

    const rows = await screen.findAllByRole('listitem');
    const rowFor = (name: string): HTMLElement => {
      const row = rows.find((candidate) => candidate.textContent.includes(name));
      if (row === undefined) {
        throw new Error(`No Tau Cloud row named ${name}`);
      }
      return row;
    };

    const shared = rowFor('Shared Housing');
    expect(within(shared).getByText('Can edit')).toBeDefined();
    expect(within(shared).getByText('Shared with you. This device does not have it yet.')).toBeDefined();

    const readOnly = rowFor('Reference Jig');
    expect(within(readOnly).getByText('Can view')).toBeDefined();
    expect(within(readOnly).getByText('Shared with you. You can open it but not change it.')).toBeDefined();
  });

  it('leaves an owned row without a role badge', async () => {
    mountCloudProjects();

    expect(await screen.findByText('Bracket Beta')).toBeDefined();
    expect(screen.queryByText('Can edit')).toBeNull();
    expect(screen.queryByText('Can view')).toBeNull();
    expect(screen.getByText('Backed up on Tau Cloud. This device does not have it yet.')).toBeDefined();
  });
});
