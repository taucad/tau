// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { DockviewGroupPanel, DockviewPanelApi, IDockviewPanel } from 'dockview-react';
import { DropdownMenu, DropdownMenuContent } from '@taucad/ui/components/dropdown-menu';
import { ViewerTabContextMenu } from '#components/panes/viewer-tab-context-menu.js';

const actions = vi.hoisted(() => ({ send: vi.fn(), openPanel: vi.fn() }));
vi.mock('@xstate/react', () => ({ useSelector: () => 'project' }));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ editorRef: { send: actions.send }, projectRef: {} }),
}));
vi.mock('#hooks/use-native-file-manager.js', () => ({
  useRevealInFileManager: () => undefined,
  NativeFileManagerIcon: () => null,
}));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel: actions.openPanel }),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const createGroup = () => {
  const panels: IDockviewPanel[] = [];
  const group = mock<DockviewGroupPanel>();
  Object.defineProperty(group, 'panels', { get: () => panels });
  const apis = ['left', 'selected', 'right'].map((id) => {
    const api = mock<DockviewPanelApi>();
    Object.defineProperties(api, { id: { value: id }, group: { value: group } });
    api.close.mockImplementation(() => {
      const index = panels.findIndex((panel) => panel.id === id);
      if (index !== -1) {
        panels.splice(index, 1);
      }
    });
    const panel = mock<IDockviewPanel>({ id });
    Object.defineProperty(panel, 'api', { value: api });
    panels.push(panel);
    return api;
  });
  return { panels, apis };
};

const menu = (api: DockviewPanelApi, onNavigate = vi.fn()) => (
  <DropdownMenu open>
    <DropdownMenuContent>
      <ViewerTabContextMenu api={api} params={{ entryPath: 'main.ts' }} variant='dropdown' onNavigate={onNavigate} />
    </DropdownMenuContent>
  </DropdownMenu>
);

describe('touch viewer actions', () => {
  it.each([
    ['Close', ['left', 'right']],
    ['Close Others', ['selected']],
    ['Close to the Right', ['left', 'selected']],
    ['Close to the Left', ['selected', 'right']],
    ['Close All', []],
  ] as const)('should apply %s only within the selected viewer group', (label, remaining) => {
    const group = createGroup();
    const otherGroup = createGroup();
    render(menu(group.apis[1]!));
    expect(screen.queryByRole('menuitem', { name: 'Split Right' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Split Down' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: label }));
    expect(group.panels.map((panel) => panel.id)).toEqual(remaining);
    expect(otherGroup.apis.every((api) => api.close.mock.calls.length === 0)).toBe(true);
  });

  it('should recompute disabled group actions when peers close without replacing the panel API', () => {
    const group = createGroup();
    const view = render(menu(group.apis[1]!));
    expect(screen.getByRole('menuitem', { name: 'Close Others' })).not.toHaveAttribute('aria-disabled', 'true');
    group.apis[0]!.close();
    group.apis[2]!.close();
    view.rerender(menu(group.apis[1]!));
    for (const label of ['Close Others', 'Close to the Right', 'Close to the Left']) {
      expect(screen.getByRole('menuitem', { name: label })).toHaveAttribute('aria-disabled', 'true');
    }
    expect(screen.getByRole('menuitem', { name: 'Close' })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('should open the selected view file in the phone editor through the existing owner', () => {
    const group = createGroup();
    const onNavigate = vi.fn();
    render(menu(group.apis[1]!, onNavigate));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in Editor' }));
    expect(actions.send).toHaveBeenCalledWith({ type: 'openFile', path: 'main.ts', source: 'user' });
    expect(onNavigate).toHaveBeenCalledWith('editor');
  });

  it('should navigate to Files before revealing the selected view file', () => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const group = createGroup();
    const onNavigate = vi.fn();
    render(menu(group.apis[1]!, onNavigate));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reveal in File Tree' }));
    expect(onNavigate).toHaveBeenCalledWith('files');
    expect(actions.openPanel).not.toHaveBeenCalled();
    expect(actions.send).toHaveBeenCalledWith({ type: 'revealFileInTree', path: 'main.ts' });
  });
});
