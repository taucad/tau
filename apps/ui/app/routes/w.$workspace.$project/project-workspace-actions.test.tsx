import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IDockviewHeaderActionsProps } from 'dockview-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type * as ProjectWorkspaceContext from '#routes/w.$workspace.$project/project-workspace-context.js';

const state = vi.hoisted(() => ({
  compact: false,
  isMobile: false,
  isTopRight: true,
  openMobile: false,
  sidebarState: 'expanded' as 'expanded' | 'collapsed',
  desktopLayout: {
    chatOpen: true,
    workbenchOpen: true,
    chatWidth: 320,
    workbenchWidth: 420,
    compactAuxiliary: 'chat' as 'chat' | 'workbench',
  },
  revisions: {
    canReturnToLatest: false,
    headRevision: undefined as { n: number } | undefined,
    isDirty: false,
  },
}));

const openPanel = vi.hoisted(() => vi.fn());
const setChatOpen = vi.hoisted(() => vi.fn());

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown }, selector: (snapshot: unknown) => unknown) =>
    selector(actor.getSnapshot()),
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    editorRef: { getSnapshot: () => ({ context: { panelState: { desktopLayout: state.desktopLayout } } }) },
    projectRef: { getSnapshot: () => ({ context: { project: { name: 'Rotor housing' } } }) },
  }),
}));
vi.mock('#hooks/use-revisions.js', () => ({ useVisibleRevisions: () => state.revisions }));
vi.mock('#components/panes/use-is-top-right-group.js', () => ({
  useIsTopRightGroup: () => state.isTopRight,
}));
vi.mock('#components/ui/sidebar.js', () => ({
  SidebarTrigger: ({ children, ...properties }: React.ComponentProps<'button'>) => (
    <button type='button' {...properties}>
      {children}
    </button>
  ),
  useSidebar: () => ({ state: state.sidebarState, isMobile: state.isMobile, openMobile: state.openMobile }),
}));
vi.mock('#routes/w.$workspace.$project/project-share-action.js', () => ({
  ProjectShareAction: () => <button type='button'>Share</button>,
}));
vi.mock('#routes/w.$workspace.$project/project-export-action.js', () => ({
  ProjectExportAction: () => <button type='button'>Export</button>,
}));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ProjectWorkspaceContext>()),
  useProjectWorkspace: () => ({ openPanel, setChatOpen }),
}));

const { ProjectWorkspaceActions } = await import('./project-workspace-actions.js');

const properties = (): IDockviewHeaderActionsProps => {
  const workspace = document.createElement('div');
  workspace.dataset['compact'] = String(state.compact);
  return {
    group: { element: { closest: () => workspace } },
    containerApi: {},
  } as unknown as IDockviewHeaderActionsProps;
};

const renderActions = () =>
  render(
    <TooltipProvider>
      <ProjectWorkspaceActions {...properties()} />
    </TooltipProvider>,
  );

describe('ProjectWorkspaceActions', () => {
  beforeEach(() => {
    state.compact = false;
    state.isMobile = false;
    state.isTopRight = true;
    state.openMobile = false;
    state.sidebarState = 'expanded';
    state.desktopLayout = {
      chatOpen: true,
      workbenchOpen: true,
      chatWidth: 320,
      workbenchWidth: 420,
      compactAuxiliary: 'chat',
    };
    state.revisions = { canReturnToLatest: false, headRevision: undefined, isDirty: false };
    vi.clearAllMocks();
  });

  it('renders the full project cluster only in the top-right viewer group', () => {
    state.desktopLayout.workbenchOpen = false;
    const { container } = renderActions();
    expect(screen.getByRole('button', { name: 'Toggle Chat lane' })).toBeInTheDocument();
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toggle Workbench lane' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    const slot = screen.getByTestId('workbench-toggle-slot');
    expect(slot).toHaveClass('size-7');
    expect(screen.queryByRole('button', { name: /Split/ })).not.toBeInTheDocument();

    state.isTopRight = false;
    const { container: secondaryContainer } = renderActions();
    expect(secondaryContainer.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid="workbench-toggle-slot"]')).toHaveLength(1);
  });

  it('does not reserve the viewer corner while the workbench is visible', () => {
    renderActions();

    expect(screen.queryByRole('button', { name: 'Toggle Workbench lane' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('workbench-toggle-slot')).not.toBeInTheDocument();
  });

  it('switches compact auxiliaries without closing the hidden open lane', async () => {
    const user = userEvent.setup();
    state.compact = true;
    renderActions();

    const chatToggle = screen.getByRole('button', { name: 'Toggle Chat lane' });
    expect(chatToggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('workbench-toggle-slot')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Toggle Chat lane' }));
    expect(setChatOpen).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('keeps Share, Export, and sidebar recovery on mobile without desktop lane controls', () => {
    state.isMobile = true;
    state.sidebarState = 'collapsed';
    renderActions();

    expect(screen.queryByRole('button', { name: 'Toggle Chat lane' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toggle Workbench lane' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rotor housing/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Split/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('workbench-toggle-slot')).not.toBeInTheDocument();
  });

  it('shows historical revision status only while away from latest', async () => {
    const user = userEvent.setup();
    state.revisions = { canReturnToLatest: true, headRevision: { n: 7 }, isDirty: true };
    renderActions();

    await user.click(screen.getByRole('button', { name: 'Open historical revision status: Revision 7 · modified' }));
    expect(openPanel).toHaveBeenCalledExactlyOnceWith('revisions');
    expect(screen.getByText('Revision 7 · modified')).toBeInTheDocument();
  });
});
