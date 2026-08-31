import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectToManifest } from '@taucad/types';
import type * as XStateModule from 'xstate';
import type { ProjectSharePanelProps } from '#components/publish/project-share-panel.js';
import { createDefaultEntry } from '#utils/parameter-config.utils.js';
import {
  parseProjectShareNavigationIntent,
  ProjectShareAction,
  ProjectShareRouteIntent,
  ProjectShareWorkbenchPanel,
} from '#routes/w.$workspace.$project/project-share-action.js';
import { TooltipProvider } from '#components/ui/tooltip.js';

const openPanel = vi.hoisted(() => vi.fn());
const snapshotSource = vi.hoisted(() => vi.fn());
const projectSend = vi.hoisted(() => vi.fn());
const fileClient = vi.hoisted(() => ({ readdir: vi.fn() }));
let capturedPanelProperties: ProjectSharePanelProps | undefined;
let projectActivity = 10;
let sourceContent = new TextEncoder().encode('initial source');

const project = projectToManifest({
  id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
  name: 'Share fixture',
  description: 'Current project',
  tags: [],
  assets: { main: { entryPath: 'main.ts', thumbnail: 'thumbnail.webp' } },
});
const geometryUnit = {
  getSnapshot: () => ({ context: { kernelClient: { snapshotSource } }, value: 'ready' }),
};
const projectRef = {
  getSnapshot: () => ({ context: { project, geometryUnits: new Map([['main.ts', geometryUnit]]) } }),
  send: projectSend,
};

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown }, selector: (state: unknown) => unknown) =>
    selector(actor.getSnapshot()),
}));

vi.mock('xstate', async (importOriginal) => {
  const actual = await importOriginal<typeof XStateModule>();
  return {
    ...actual,
    waitFor: async (actor: { getSnapshot: () => unknown }) => actor.getSnapshot(),
  };
});

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    parameterEntries: new Map([['main.ts', createDefaultEntry()]]),
    projectId: project.id,
    projectRef,
  }),
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ client: fileClient }),
}));

vi.mock('#hooks/use-projects.js', () => ({
  useProjects: () => ({ projects: [{ id: project.id, lastActivityAt: projectActivity }] }),
}));

vi.mock('#components/publish/project-share-panel.js', () => ({
  ProjectSharePanel: (properties: ProjectSharePanelProps) => {
    capturedPanelProperties = properties;
    return <div>Share panel fixture</div>;
  },
}));

vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel }),
}));

describe('ProjectShareAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedPanelProperties = undefined;
    projectActivity = 10;
    sourceContent = new TextEncoder().encode('initial source');
    fileClient.readdir.mockResolvedValue(['README.md', '.tau']);
    snapshotSource.mockImplementation(async ({ signal }: { readonly signal?: AbortSignal }) => {
      signal?.throwIfAborted();
      return {
        success: true,
        data: {
          entryPath: 'main.ts',
          files: [
            { path: 'main.ts', content: sourceContent, sha256: '1'.repeat(64), role: 'entry' },
            {
              path: 'tau.json',
              content: new TextEncoder().encode('stale'),
              sha256: '2'.repeat(64),
              role: 'additional',
            },
            {
              path: 'package.json',
              content: new TextEncoder().encode('{}'),
              sha256: '3'.repeat(64),
              role: 'additional',
            },
            {
              path: 'README.md',
              content: new TextEncoder().encode('readme'),
              sha256: '4'.repeat(64),
              role: 'additional',
            },
            { path: 'thumbnail.webp', content: new Uint8Array([1]), sha256: '5'.repeat(64), role: 'additional' },
            { path: '.tau/internal', content: new Uint8Array([2]), sha256: '6'.repeat(64), role: 'dependency' },
            { path: 'node_modules/pkg.js', content: new Uint8Array([3]), sha256: '7'.repeat(64), role: 'dependency' },
          ],
          unresolvedPaths: ['missing.ts'],
        },
      };
    });
  });

  it('keeps Share enabled without render-success gating and opens the singleton pane', async () => {
    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectShareAction />
        </TooltipProvider>
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: /share/i });
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    expect(openPanel).toHaveBeenCalledExactlyOnceWith('share');
  });

  it('shows Share tooltip copy', async () => {
    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectShareAction />
        </TooltipProvider>
      </MemoryRouter>,
    );

    await userEvent.hover(screen.getByRole('button', { name: /share/i }));
    await waitFor(() => {
      expect(screen.getAllByText('Share project').length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('ProjectShareWorkbenchPanel', () => {
  it('stays lazy until an explicit share action and collects the latest self-contained snapshot', async () => {
    render(
      <MemoryRouter initialEntries={['/w/home/share-fixture?chat=chat_1']}>
        <ProjectShareWorkbenchPanel />
      </MemoryRouter>,
    );

    expect(snapshotSource).not.toHaveBeenCalled();
    expect(projectSend).not.toHaveBeenCalled();
    expect(capturedPanelProperties?.projectUpdatedAt).toBe(10);

    sourceContent = new TextEncoder().encode('edited after opening Share');
    const snapshot = await capturedPanelProperties!.collectSnapshot!();

    expect(snapshotSource).toHaveBeenCalledWith({
      source: { path: 'main.ts' },
      additionalPaths: [
        { path: 'tau.json', required: true },
        { path: 'package.json', required: false },
        { path: 'README.md', required: false },
        { path: 'thumbnail.webp', required: false },
      ],
      signal: undefined,
    });
    expect(new TextDecoder().decode(snapshot.files.find(({ path }) => path === 'main.ts')?.content)).toBe(
      'edited after opening Share',
    );
    expect(snapshot.files.map(({ path }) => path)).toEqual([
      'main.ts',
      'package.json',
      'README.md',
      'thumbnail.webp',
      'tau.json',
      '.tau/parameters/main.ts.json',
    ]);
    const manifestFile = snapshot.files.find(({ path }) => path === 'tau.json');
    expect(manifestFile?.role).toBe('project-metadata');
    expect(manifestFile?.sha256).toMatch(/^[\da-f]{64}$/u);
    expect(snapshot.warnings).toEqual([
      { code: 'UNRESOLVED_DEPENDENCY', message: 'The runtime could not resolve missing.ts.' },
    ]);
  });

  it('updates publication freshness from the reactive project listing', () => {
    const view = render(
      <MemoryRouter>
        <ProjectShareWorkbenchPanel />
      </MemoryRouter>,
    );
    expect(capturedPanelProperties?.projectUpdatedAt).toBe(10);

    projectActivity = 20;
    view.rerender(
      <MemoryRouter>
        <ProjectShareWorkbenchPanel />
      </MemoryRouter>,
    );
    expect(capturedPanelProperties?.projectUpdatedAt).toBe(20);
  });
});

describe('project Share navigation intent', () => {
  it('opens the pane from a GitHub return and removes only recognized one-shot fields', () => {
    expect(
      parseProjectShareNavigationIntent(
        '?chat=chat_1&workbench=share&shareProvider=github-gist&shareAuth=github-gist&error=access_denied&error_description=provider+copy&keep=1',
      ),
    ).toEqual({
      shouldOpen: true,
      initialMethod: 'github-gist',
      githubAuthorizationOutcome: 'cancelled',
      remainingSearch: '?chat=chat_1&keep=1',
    });
  });

  it('preserves unknown query fields and ignores unmarked provider errors', () => {
    expect(parseProjectShareNavigationIntent('?chat=chat_1&error=access_denied')).toEqual({
      shouldOpen: false,
      remainingSearch: '?chat=chat_1&error=access_denied',
    });
  });

  it('queues opening before the Workbench connects', async () => {
    render(
      <MemoryRouter initialEntries={['/w/home/demo?chat=chat_1&workbench=share']}>
        <ProjectShareRouteIntent />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(openPanel).toHaveBeenCalledWith('share');
    });
  });
});
