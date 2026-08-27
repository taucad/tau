import type { FunctionComponent } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  DockviewApi,
  DockviewGroupPanel,
  DockviewPanelApi,
  IDockviewPanel,
  IDockviewPanelHeaderProps,
} from 'dockview-react';
import { mock } from 'vitest-mock-extended';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '#components/ui/tooltip.js';

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    editorRef: { send: vi.fn() },
    projectRef: { send: vi.fn() },
  }),
}));

vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel: vi.fn() }),
}));

const { EditorDockviewTab } = await import('#components/panes/editor-tab-context-menu.js');
const { ViewerDockviewTab } = await import('#components/panes/viewer-tab-context-menu.js');

type TabFixture = {
  readonly properties: IDockviewPanelHeaderProps;
  readonly clickedMoveTo: ReturnType<typeof vi.fn>;
  readonly siblingMoveTo: ReturnType<typeof vi.fn>;
  readonly addGroup: ReturnType<typeof vi.fn>;
};

const createTabFixture = ({
  params,
  title,
}: {
  readonly params: Record<string, unknown>;
  readonly title: string;
}): TabFixture => {
  const clickedMoveTo = vi.fn();
  const siblingMoveTo = vi.fn();
  const addGroup = vi.fn();
  const group = mock<DockviewGroupPanel>();
  Object.defineProperty(group, 'panels', { value: [] });
  const clickedApi = mock<DockviewPanelApi>({
    id: 'clicked-panel',
    title,
    close: vi.fn(),
    moveTo: clickedMoveTo,
    onDidTitleChange: vi.fn(() => ({ dispose: vi.fn() })),
  });
  const siblingApi = mock<DockviewPanelApi>({
    id: 'active-sibling',
    title: 'active-sibling.ts',
    moveTo: siblingMoveTo,
  });
  Object.defineProperty(clickedApi, 'group', { value: group });
  Object.defineProperty(siblingApi, 'group', { value: group });

  const clickedPanel = mock<IDockviewPanel>({ id: clickedApi.id });
  const siblingPanel = mock<IDockviewPanel>({ id: siblingApi.id });
  Object.defineProperty(clickedPanel, 'api', { value: clickedApi });
  Object.defineProperty(siblingPanel, 'api', { value: siblingApi });
  group.panels.push(clickedPanel, siblingPanel);

  const containerApi = mock<DockviewApi>({ addGroup });
  Object.defineProperty(containerApi, 'activePanel', { value: siblingPanel });

  return {
    properties: {
      api: clickedApi,
      containerApi,
      params,
      tabLocation: 'header',
    },
    clickedMoveTo,
    siblingMoveTo,
    addGroup,
  };
};

const surfaces: ReadonlyArray<{
  readonly name: string;
  readonly Component: FunctionComponent<IDockviewPanelHeaderProps>;
  readonly params: Record<string, unknown>;
}> = [
  {
    name: 'Workbench',
    Component: EditorDockviewTab,
    params: { filePath: 'src/main.ts' },
  },
  {
    name: 'Viewer',
    Component: ViewerDockviewTab,
    params: { entryPath: 'src/main.ts', viewId: 'view:main' },
  },
];

describe.each(surfaces)('$name tab context-menu split', ({ Component, params }) => {
  it.each([
    { item: 'Split Right', position: 'right' },
    { item: 'Split Down', position: 'bottom' },
  ] as const)(
    'should move the right-clicked tab to $position without creating an empty group',
    async ({ item, position }) => {
      const user = userEvent.setup();
      const fixture = createTabFixture({ params, title: 'main.ts' });

      render(
        <TooltipProvider>
          <Component {...fixture.properties} />
        </TooltipProvider>,
      );

      fireEvent.contextMenu(screen.getByText('main.ts'));
      await user.click(await screen.findByRole('menuitem', { name: item }));

      expect(fixture.clickedMoveTo).toHaveBeenCalledExactlyOnceWith({
        group: fixture.properties.api.group,
        position,
      });
      expect(fixture.siblingMoveTo).not.toHaveBeenCalled();
      expect(fixture.addGroup).not.toHaveBeenCalled();
    },
  );
});
