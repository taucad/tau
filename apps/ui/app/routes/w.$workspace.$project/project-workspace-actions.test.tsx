import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IDockviewHeaderActionsProps } from 'dockview-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type * as ProjectWorkspaceContext from '#routes/w.$workspace.$project/project-workspace-context.js';

const state = vi.hoisted(() => ({
  isMobile: false,
  isTopRight: true,
  openMobile: false,
  lanes: { chat: true, workbench: true },
}));

const openPanel = vi.hoisted(() => vi.fn());

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown }, selector: (snapshot: unknown) => unknown) =>
    selector(actor.getSnapshot()),
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectRef: { getSnapshot: () => ({ context: { project: { name: 'Rotor housing' } } }) },
  }),
}));
/* The trigger has its own suite (`revision-status-action.test.tsx`); here it
 * only has to lead the project group (S29). */
vi.mock('#routes/w.$workspace.$project/revision-status-action.js', () => ({
  RevisionStatusAction: () => <span data-testid='revision-trigger' />,
}));
vi.mock('#components/panes/use-is-top-right-group.js', () => ({
  useIsTopRightGroup: () => state.isTopRight,
}));
vi.mock('#components/ui/sidebar.js', () => ({
  SidebarTrigger: ({ children, ...properties }: React.ComponentProps<'button'>) => (
    <button type='button' {...properties}>
      {children}
    </button>
  ),
  useSidebar: () => ({ isMobile: state.isMobile, openMobile: state.openMobile }),
}));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ProjectWorkspaceContext>()),
  useProjectWorkspace: () => ({ openPanel }),
  useWorkspaceLanes: () => state.lanes,
}));

const { ProjectWorkspaceActions } = await import('./project-workspace-actions.js');

const properties = (): IDockviewHeaderActionsProps =>
  ({ group: {}, containerApi: {} }) as unknown as IDockviewHeaderActionsProps;

const renderActions = () =>
  render(
    <TooltipProvider>
      <ProjectWorkspaceActions {...properties()} />
    </TooltipProvider>,
  );

describe('ProjectWorkspaceActions', () => {
  beforeEach(() => {
    state.isMobile = false;
    state.isTopRight = true;
    state.openMobile = false;
    state.lanes = { chat: true, workbench: true };
    vi.clearAllMocks();
  });

  it('renders the project group only in the top-right viewer group, without a chat control', () => {
    renderActions();

    expect(screen.getByTestId('revision-trigger')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toggle Chat lane' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rotor housing/ })).not.toBeInTheDocument();

    state.isTopRight = false;
    const { container } = renderActions();
    expect(container).toBeEmptyDOMElement();
  });

  it('sets the cluster apart with a hairline before the project group', () => {
    const { container } = renderActions();

    const cluster = container.firstElementChild;
    expect(cluster?.firstElementChild).toHaveAttribute('data-orientation', 'vertical');
    expect(cluster?.children[1]).toBe(screen.getByTestId('revision-trigger'));
  });

  it('reserves the workbench toggle slot behind its own hairline only while that lane is hidden', () => {
    renderActions();
    expect(screen.queryByTestId('workbench-toggle-slot')).not.toBeInTheDocument();

    state.lanes = { chat: true, workbench: false };
    renderActions();
    const slot = screen.getByTestId('workbench-toggle-slot');
    expect(slot).toHaveClass('size-7');
    expect(slot.previousElementSibling).toHaveAttribute('data-orientation', 'vertical');
  });

  it('opens Share and Export in the workbench, as labelled pane buttons that fold to icons', async () => {
    const user = userEvent.setup();
    renderActions();

    const share = screen.getByRole('button', { name: 'Share' });
    expect(share).toHaveAttribute('data-slot', 'pane-button');
    expect(share).toHaveClass('@max-xl/viewer:w-7');
    await user.click(share);
    await user.click(screen.getByRole('button', { name: 'Export' }));

    expect(openPanel.mock.calls).toEqual([['share'], ['export']]);
  });

  it('keeps Share, Export, and sidebar recovery on mobile without desktop lane controls', () => {
    state.isMobile = true;
    state.lanes = { chat: false, workbench: false };
    renderActions();

    expect(screen.queryByRole('button', { name: 'Toggle Workbench lane' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rotor housing/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.queryByTestId('workbench-toggle-slot')).not.toBeInTheDocument();
  });
});
