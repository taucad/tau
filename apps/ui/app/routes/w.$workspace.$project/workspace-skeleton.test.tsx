import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { useProjects } from '#hooks/use-projects.js';

/*
 * The persisted `workbenchOpen` lives in the project's own layout record
 * (`lanes.workbench`, seeded from `editorState.panelState` at creation) and is
 * read only once the session is live. The fix (follow-up A15) is a per-project
 * layout hint held by the library and readable before then. The seed is the
 * library's listing, whose project carries that hint in the shape
 * `createProject` takes it, and the project's route, so the skeleton can tell
 * which project it stands in for.
 */
const mockUseProjects = vi.fn();
vi.mock('#hooks/use-projects.js', () => ({ useProjects: () => mockUseProjects() as ReturnType<typeof useProjects> }));

const workbenchClosedProject = {
  locator: { backend: 'indexeddb', storageRootKey: 'indexeddb:tau-', relativeDirectory: '/one' },
  id: 'proj_one',
  name: 'One',
  description: 'Workbench closed',
  lastActivityAt: 10,
  assets: { main: { entryPath: 'main.scad' } },
  slugs: { workspaceSlug: 'home', projectSlug: 'one' },
  editorState: { panelState: { desktopLayout: { chatOpen: true, workbenchOpen: false } } },
};

const { WorkspaceSkeleton } = await import('#routes/w.$workspace.$project/workspace-skeleton.js');

const renderForProject = (url: string): HTMLElement => {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path='/w/:workspace/:project' element={<WorkspaceSkeleton />} />
      </Routes>
    </MemoryRouter>,
  );
  const lanes = document.querySelector<HTMLElement>('[data-slot=workspace-skeleton-lanes]');
  expect(lanes).not.toBeNull();
  return lanes!;
};

describe('WorkspaceSkeleton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.localStorage.clear();
    mockUseProjects.mockReturnValue({ projects: [workbenchClosedProject], isLoading: false, error: undefined });
  });

  // ── Known defects (A0.9): expected failures until follow-up A15 flips them ──

  /*
   * U5 states the defect only: the loading frame of a workbench-closed project
   * draws no third lane. It says nothing about what, if anything, stands in
   * that space. jsdom has no container queries, so the lane is present in the
   * DOM at every width and is counted as a node.
   */
  it.fails('U5: the loading frame of a workbench-closed project has no third lane border', () => {
    const lanes = renderForProject('/w/home/one');

    expect(lanes.querySelectorAll(':scope > .border-l')).toHaveLength(0);
  });
});
