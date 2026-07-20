import { render } from '@testing-library/react';
import type { UIMatch } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';

let exportableGeometryUnitPaths = new Set<string>();
let registeredItems: CommandPaletteItem[] = [];
const editorSend = vi.fn();

const cadActor = {
  getSnapshot: () => ({ context: { geometry: undefined } }),
  on: () => ({ unsubscribe: vi.fn() }),
};

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown } | undefined, selector: (state: unknown) => unknown) =>
    selector(actor?.getSnapshot()),
  useActorRef: () => ({ send: vi.fn() }),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    geometryUnits: new Map([['main.ts', cadActor]]),
    mainEntryPath: 'main.ts',
    projectRef: {
      getSnapshot: () => ({
        context: {
          exportableGeometryUnitPaths,
          project: { id: 'test-project', name: 'test-project' },
        },
      }),
    },
    editorRef: {
      send: editorSend,
    },
  }),
  useMainGraphics: () => ({
    getSnapshot: () => ({ context: { isScreenshotReady: false } }),
  }),
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    getZippedDirectory: vi.fn(),
    writeFile: vi.fn(),
  }),
}));

vi.mock('#hooks/use-file-tree.js', () => ({
  useFileTreeMap: () => new Map([['main.ts', {}]]),
}));

vi.mock('#hooks/use-revisions.js', () => ({
  useVisibleRevisions: () => ({ canReturnToLatest: false }),
}));

vi.mock('#hooks/use-thumbnail-generator.js', () => ({
  useThumbnailGenerator: () => ({ regenerate: vi.fn() }),
}));

vi.mock('#hooks/use-restore-to-point.js', () => ({
  useRestoreToPoint: () => ({ returnToLatest: vi.fn() }),
}));

vi.mock('#routes/projects_.$id/revision-pane-context.js', () => ({
  useRevisionPane: () => ({ setOpen: vi.fn() }),
}));

vi.mock('#components/layout/command-palette.js', () => ({
  useCommandPaletteItems: (_matchId: string, factory: () => CommandPaletteItem[]) => {
    registeredItems = factory();
  },
}));

const { ProjectCommandPaletteItems } = await import('./project-command-items.js');

const match: UIMatch = {
  data: undefined,
  handle: undefined,
  id: 'project-route',
  loaderData: undefined,
  params: {},
  pathname: '/projects/project-1',
};

describe('ProjectCommandPaletteItems', () => {
  beforeEach(() => {
    exportableGeometryUnitPaths = new Set<string>();
    registeredItems = [];
    editorSend.mockClear();
  });

  it('should disable the export command when no geometry unit is exportable', () => {
    render(<ProjectCommandPaletteItems match={match} />);

    expect(registeredItems.find((item) => item.id === 'export')?.disabled).toBe(true);
  });

  it('should enable the export command when any geometry unit is exportable', () => {
    exportableGeometryUnitPaths = new Set(['helper.ts']);

    render(<ProjectCommandPaletteItems match={match} />);

    const exportItem = registeredItems.find((item) => item.id === 'export');
    expect(exportItem?.disabled).toBe(false);
    exportItem?.action?.();
    expect(editorSend).toHaveBeenCalledWith({
      type: 'setPanelState',
      panelState: {
        openPanels: { converter: true },
        mobileActiveTab: 'converter',
      },
    });
  });
});
