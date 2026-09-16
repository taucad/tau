import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { useProjects } from '#hooks/use-projects.js';
import type * as SidebarStatusModule from '#hooks/use-sidebar-status.js';

const mockUseProjects = vi.fn();
const mockCreateChat = vi.fn();
const mockIsProjectExpanded = vi.fn();
const mockSetProjectDisclosure = vi.fn();
const mockNavigate = vi.fn();
const mockInvalidateQueries = vi.fn();
let pathname = '/';
let search = '';
let pendingLocation: { readonly pathname: string; readonly search: string } | undefined;

vi.mock('#hooks/use-projects.js', () => ({ useProjects: () => mockUseProjects() as ReturnType<typeof useProjects> }));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ createChat: mockCreateChat }) }));
vi.mock('#hooks/use-app-ui-preferences.js', () => ({
  useAppUiPreferences: () => ({
    isProjectExpanded: mockIsProjectExpanded,
    setProjectDisclosure: mockSetProjectDisclosure,
  }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }) }));
vi.mock('react-router', () => ({
  Link: ({
    children,
    to,
    onClick,
    ...properties
  }: {
    readonly children: ReactNode;
    readonly to: string;
    readonly onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a
      href={to}
      {...properties}
      rel='noreferrer'
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
  useLocation: () => ({ pathname, search }),
  useNavigate: () => mockNavigate,
  useNavigation: () => ({ location: pendingLocation, state: pendingLocation ? 'loading' : 'idle' }),
}));
vi.mock('#components/nav/project-chat-list.js', () => ({
  ProjectChatList: ({ project }: { readonly project: { readonly name: string } }) => (
    <div data-testid={`chats-${project.name}`} />
  ),
}));
vi.mock('#components/ui/sidebar.js', () => ({
  SidebarGroup: ({ children }: { readonly children: ReactNode }) => <section>{children}</section>,
  SidebarGroupLabel: ({ children }: { readonly children: ReactNode }) => <h2>{children}</h2>,
  SidebarMenu: ({ children }: { readonly children: ReactNode }) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children, ...properties }: { readonly children: ReactNode }) => (
    <li {...properties}>{children}</li>
  ),
  SidebarMenuButton: ({
    children,
    asChild,
    ...properties
  }: {
    readonly children: ReactNode;
    readonly asChild?: boolean;
  }): React.JSX.Element =>
    asChild ? (
      <span>{children}</span>
    ) : (
      <button type='button' {...properties}>
        {children}
      </button>
    ),
  useSidebar: () => ({ isMobile: false }),
}));
vi.mock('@taucad/ui/components/button', () => ({
  Button: ({ children, ...properties }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...properties}>
      {children}
    </button>
  ),
}));
vi.mock('@taucad/ui/components/tooltip', () => ({
  TooltipProvider: ({ children }: { readonly children: ReactNode }): ReactNode => children,
  Tooltip: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
  TooltipContent: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
}));
type DropdownMenuItemMockProps = Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'disabled'> & {
  readonly children: ReactNode;
  readonly onSelect?: () => void;
};
vi.mock('@taucad/ui/components/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
  DropdownMenuContent: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, disabled: isDisabled, onSelect, ...properties }: DropdownMenuItemMockProps) => (
    <button type='button' disabled={isDisabled} onClick={onSelect} {...properties}>
      {children}
    </button>
  ),
}));
vi.mock('#components/inline-text-editor.js', () => ({
  InlineTextEditor: ({ value, className }: { readonly value: string; readonly className?: string }) => (
    <div data-testid='inline-editor' className={className}>
      <input aria-label={`Rename ${value}`} value={value} readOnly />
    </div>
  ),
}));
vi.mock('#components/ui/sonner.js', () => ({ toast: { success: vi.fn() } }));
vi.mock('@taucad/ui/components/alert-dialog', () => ({
  AlertDialog: ({ children, ...properties }: { readonly children: ReactNode } & Record<string, unknown>) =>
    properties['open'] === false ? null : <div role='dialog'>{children}</div>,
  AlertDialogContent: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { readonly children: ReactNode }) => <h3>{children}</h3>,
  AlertDialogDescription: ({ children }: { readonly children: ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { readonly children: ReactNode }) => <button type='button'>{children}</button>,
  AlertDialogAction: ({ children, ...properties }: { readonly children: ReactNode } & Record<string, unknown>) => (
    <button type='button' onClick={properties['onClick'] as () => void}>
      {children}
    </button>
  ),
}));

/* The registry and the selectors are W19's and this lane's own; these suites are
 * about the wiring, so the rows are handed in and the pins drive them. */
const mockRow = vi.fn();
const mockLiveNow = vi.fn();
const mockCloseProject = vi.fn();
let liveProjectIds: readonly string[] = [];
vi.mock('#hooks/use-sessions.js', () => ({
  useLiveProjectIds: () => liveProjectIds,
  useSessions: () => ({ on: () => ({ unsubscribe: () => undefined }) }),
}));
vi.mock('#hooks/use-sidebar-status.js', async (importOriginal) => {
  const original = await importOriginal<typeof SidebarStatusModule>();
  return {
    ...original,
    useProjectSidebarRow: (projectId: string) => mockRow(projectId) as unknown,
    useLiveNow: () => mockLiveNow() as unknown,
    useSidebarCommands: () => ({ closeProject: mockCloseProject, closeChat: vi.fn(), openProject: vi.fn() }),
  };
});

const closedRow = (projectId: string): SidebarStatusModule.ProjectSidebarRow => ({
  projectId,
  glyph: 'none',
  closing: false,
  attention: 0,
  conflicted: false,
  failed: 0,
  running: 0,
  unread: 0,
  detail: undefined,
  runs: 0,
});

const firstProject = {
  id: 'proj_one',
  name: 'One',
  description: 'First',
  lastActivityAt: 10,
  assets: { main: { entryPath: 'main.scad' } },
  slugs: { workspaceSlug: 'home', projectSlug: 'one' },
};
const secondProject = {
  ...firstProject,
  id: 'proj_two',
  name: 'Two',
  lastActivityAt: 20,
  slugs: { workspaceSlug: 'home', projectSlug: 'Two space' },
};

const projectsResult = {
  projects: [firstProject, secondProject],
  isLoading: false,
  error: undefined,
  deleteProject: vi.fn(),
  duplicateProject: vi.fn(),
  updateName: vi.fn(),
};

const { ProjectNavigation } = await import('#components/nav/project-navigation.js');

/** The sentence a link names through `aria-describedby`. */
const descriptionOf = (link: HTMLElement) =>
  document.querySelector(`#${link.getAttribute('aria-describedby') ?? 'missing'}`);

describe('ProjectNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname = '/';
    search = '';
    pendingLocation = undefined;
    mockUseProjects.mockReturnValue(projectsResult);
    mockIsProjectExpanded.mockImplementation((_projectId: string, active: boolean) => active);
    mockSetProjectDisclosure.mockResolvedValue(undefined);
    mockNavigate.mockResolvedValue(undefined);
    liveProjectIds = [];
    mockRow.mockImplementation((projectId: string) => closedRow(projectId));
    mockLiveNow.mockReturnValue({ projects: 0, idleProjectIds: [] });
  });

  it('renders one Projects group with every project in deterministic activity order', () => {
    render(<ProjectNavigation />);

    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['Two', 'One']);
    expect(screen.queryByRole('button', { name: 'Show more projects' })).not.toBeInTheDocument();
  });

  it('reveals projects five at a time and removes the terminal Show more action', () => {
    mockUseProjects.mockReturnValue({
      ...projectsResult,
      projects: Array.from({ length: 12 }, (_, index) => ({
        ...firstProject,
        id: `proj_${index + 1}`,
        name: `Project ${index + 1}`,
        lastActivityAt: index + 1,
        slugs: { workspaceSlug: 'home', projectSlug: `project-${index + 1}` },
      })),
    });
    render(<ProjectNavigation />);

    expect(screen.getAllByRole('link')).toHaveLength(5);
    const showMore = screen.getByRole('button', { name: 'Show more projects' });
    expect(showMore).toHaveTextContent('Show more projects');
    expect(showMore).not.toHaveClass('font-medium');
    fireEvent.click(showMore);
    expect(screen.getAllByRole('link')).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: 'Show more projects' }));
    expect(screen.getAllByRole('link')).toHaveLength(12);
    expect(screen.queryByRole('button', { name: 'Show more projects' })).not.toBeInTheDocument();
  });

  it('defaults only the active project open and persists explicit disclosure changes', () => {
    pathname = '/w/home/one';
    render(<ProjectNavigation />);

    expect(screen.getByTestId('chats-One')).toBeInTheDocument();
    expect(screen.queryByTestId('chats-Two')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand Two' }));
    expect(mockSetProjectDisclosure).toHaveBeenCalledWith('proj_two', true);
    fireEvent.click(screen.getByRole('link', { name: /Two/u }));
    expect(mockSetProjectDisclosure).toHaveBeenCalledWith('proj_two', true);
  });

  it('shows route loading only on the destination project', () => {
    pendingLocation = { pathname: '/w/home/Two%20space', search: '' };
    render(<ProjectNavigation />);

    const pendingLink = screen.getByRole('link', { name: 'Two' });
    const idleLink = screen.getByRole('link', { name: 'One' });
    expect(pendingLink).toHaveAttribute('aria-busy', 'true');
    expect(pendingLink.closest('[data-slot=project-trigger]')?.querySelector('.animate-spin')).toBeInTheDocument();
    expect(idleLink.closest('[data-slot=project-trigger]')?.querySelector('.animate-spin')).not.toBeInTheDocument();
  });

  it('creates a chat by project id before navigating to its canonical query URL', async () => {
    mockCreateChat.mockResolvedValue({ id: 'chat/two' });
    render(<ProjectNavigation />);

    const newChatButton = screen.getByRole('button', { name: 'New chat in Two' });
    expect(newChatButton.querySelector('svg')).toHaveClass('lucide-square-pen');
    fireEvent.click(newChatButton);
    await vi.waitFor(() => {
      expect(mockCreateChat).toHaveBeenCalledWith('proj_two', { name: 'New chat', messages: [] });
      expect(mockNavigate).toHaveBeenCalledWith('/w/home/Two%20space?chat=chat%2Ftwo', {
        state: { focusChatComposer: true },
      });
    });
  });

  it('opens Share for the active project without discarding its chat', () => {
    pathname = '/w/home/one';
    search = '?chat=chat_1&keep=1';
    render(<ProjectNavigation />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Share project' })[1]!);

    expect(mockNavigate).toHaveBeenCalledWith('/w/home/one?chat=chat_1&keep=1&workbench=share');
  });

  it('opens Share for another project without carrying the active project chat', () => {
    pathname = '/w/home/one';
    search = '?chat=chat_1';
    render(<ProjectNavigation />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Share project' })[0]!);

    expect(mockNavigate).toHaveBeenCalledWith('/w/home/Two%20space?workbench=share');
  });

  it('disables Share while a project has no canonical slugs', () => {
    mockUseProjects.mockReturnValue({ ...projectsResult, projects: [{ ...firstProject, slugs: undefined }] });
    render(<ProjectNavigation />);

    expect(screen.getByRole('button', { name: 'Share project' })).toBeDisabled();
  });

  /* D5, D19: the budget is two words on the label, and its way out is the
   * label's own menu. */
  it('counts live projects on the label and closes exactly the idle ones from its menu', () => {
    liveProjectIds = ['proj_one', 'proj_two'];
    mockLiveNow.mockReturnValue({ projects: 2, idleProjectIds: ['proj_two'] });
    render(<ProjectNavigation />);

    expect(screen.getByRole('heading', { name: 'Projects 2 live' })).toBeInTheDocument();
    expect(screen.queryByText('Live now')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions for projects' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close 1 idle project' }));
    expect(mockCloseProject).toHaveBeenCalledExactlyOnceWith('proj_two');
  });

  /* The row gap: the label counted a live project while the list said there
   * were none. The listing's own worker window is fixed at its owner (P67);
   * this is the sidebar's half — it never contradicts itself, whatever the
   * listing says. */
  it('never says there are no projects while it is counting a live one', () => {
    liveProjectIds = ['proj_live'];
    mockLiveNow.mockReturnValue({ projects: 1, idleProjectIds: [] });
    mockUseProjects.mockReturnValue({ ...projectsResult, projects: [] });

    render(<ProjectNavigation />);

    expect(screen.queryByText('No projects yet')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Projects 1 live' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions for projects' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('says nothing about liveness on the label while nothing is live', () => {
    render(<ProjectNavigation />);
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
  });

  /* D6, D18: no Retry anywhere; a failed refresh keeps the last good list. */
  it('shows a failure row with no control when nothing loaded, and nothing over a list', () => {
    mockUseProjects.mockReturnValue({ ...projectsResult, projects: [], error: new Error('offline') });
    const { unmount } = render(<ProjectNavigation />);
    const failure = document.querySelector('[data-slot=failure-row]');
    expect(failure).toHaveTextContent("Couldn't load projects");
    expect(failure?.querySelector('button, a')).toBeNull();
    expect(screen.queryByRole('button', { name: /retry/iu })).not.toBeInTheDocument();
    unmount();

    mockUseProjects.mockReturnValue({ ...projectsResult, error: new Error('offline') });
    render(<ProjectNavigation />);
    expect(document.querySelector('[data-slot=failure-row]')).toBeNull();
    expect(screen.queryByText(/refreshed/u)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('shows one-line skeletons while the first list loads', () => {
    mockUseProjects.mockReturnValue({ ...projectsResult, projects: [], isLoading: true });
    render(<ProjectNavigation />);
    const skeletons = screen.getAllByTestId('project-navigation-skeleton');
    expect(skeletons).toHaveLength(3);
    expect(skeletons[0]?.querySelectorAll('[data-slot=skeleton]')).toHaveLength(1);
  });

  /* D3, D11, D16: a collapsed project carries its chats' rollup on the
   * disclosure control; expanded, only its session's own facts. */
  it('puts the rollup on the disclosure control only while collapsed', () => {
    pathname = '/w/home/one';
    liveProjectIds = ['proj_one', 'proj_two'];
    mockRow.mockImplementation((projectId: string) => ({
      ...closedRow(projectId),
      glyph: 'busy',
      running: 1,
      attention: 2,
      runs: 2,
    }));
    render(<ProjectNavigation />);

    const collapsedToggle = screen.getByRole('button', { name: 'Expand Two' });
    const mark = collapsedToggle.querySelector<HTMLElement>('[data-glyph]');
    expect(mark?.dataset['glyph']).toBe('attention');
    expect(mark).toHaveClass('justify-center');
    expect(mark?.querySelector('.absolute')).toHaveTextContent('2');
    const collapsedLink = screen.getByRole('link', { name: 'Two' });
    expect(descriptionOf(collapsedLink)).toHaveTextContent('Live, busy · 2 need you');

    const expandedToggle = screen.getByRole('button', { name: 'Collapse One' });
    expect(expandedToggle.querySelector('[data-glyph]')).toBeNull();
    const expandedLink = screen.getByRole('link', { name: 'One' });
    expect(descriptionOf(expandedLink)).toHaveTextContent(/^Live, busy$/u);
  });

  /* D15: the name dissolves at the row's edge rather than clipping. */
  it('dissolves the name and overlays the actions without reserving width', () => {
    render(<ProjectNavigation />);
    const link = screen.getByRole('link', { name: 'Two' });
    const row = link.closest<HTMLElement>('[data-slot=project-trigger]');
    expect(row).toHaveClass('fade-row', 'h-7');
    expect(link.querySelector('.fade-label')).toHaveTextContent('Two');
    expect(row?.querySelector('.truncate')).toBeNull();
    const actions = screen.getByRole('button', { name: 'More actions for Two' }).closest('.fade-action');
    expect(actions).toHaveClass('absolute', 'hidden', 'group-hover/row:flex', 'pointer-coarse:flex');
  });

  /* D17: renaming outlines the row, and the Save button stays hidden. */
  it('outlines the whole row while it is renamed', () => {
    render(<ProjectNavigation />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename' })[0]!);
    const editor = screen.getByTestId('inline-editor');
    expect(editor.closest('[data-slot=project-trigger]')).toHaveClass('focus-outline');
    expect(editor.className).toContain('[&_[data-slot=save-button]]:hidden');
    expect(editor.className).toContain('[&_[data-slot=input]]:focus-visible:outline-none');
  });

  /* Pin (f): the dialog is the question, and it is asked only when there is
   * something to interrupt (I24). */
  it('closes an idle project outright and asks before stopping running agents', () => {
    liveProjectIds = ['proj_one', 'proj_two'];
    mockRow.mockImplementation((projectId: string) => ({
      ...closedRow(projectId),
      glyph: projectId === 'proj_one' ? 'idle' : 'busy',
      runs: projectId === 'proj_one' ? 0 : 2,
    }));
    render(<ProjectNavigation />);

    fireEvent.click(screen.getByRole('button', { name: 'Close One' }));
    expect(mockCloseProject).toHaveBeenCalledExactlyOnceWith('proj_one');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close Two' }));
    expect(screen.getByRole('heading', { name: 'Stop 2 agents and close Two?' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Their work so far is saved locally as revisions. If backup is unavailable, it stays queued for the next connection. You can reopen the project any time.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop and close' }));
    expect(mockCloseProject).toHaveBeenLastCalledWith('proj_two');
  });

  it('asks before trashing a project whose agents are running', async () => {
    mockRow.mockImplementation((projectId: string) => ({
      ...closedRow(projectId),
      glyph: projectId === 'proj_two' ? 'busy' : 'none',
      runs: projectId === 'proj_two' ? 2 : 0,
    }));
    render(<ProjectNavigation />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);

    expect(projectsResult.deleteProject).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Stop 2 agents and close Two?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stop and close' }));
    await waitFor(() => {
      expect(mockCloseProject).toHaveBeenLastCalledWith('proj_two');
      expect(projectsResult.deleteProject).toHaveBeenCalledExactlyOnceWith('proj_two');
    });
  });

  it('offers no Close on a project that is already closed', () => {
    render(<ProjectNavigation />);
    expect(screen.queryByRole('button', { name: 'Close One' })).not.toBeInTheDocument();
  });

  it('names a policy close as the sentence of the project it closed', () => {
    mockRow.mockImplementation((projectId: string) => ({
      ...closedRow(projectId),
      detail: projectId === 'proj_one' ? 'Closed to save memory · 30 min idle' : undefined,
    }));
    render(<ProjectNavigation />);
    const link = screen.getByRole('link', { name: 'One' });
    expect(descriptionOf(link)).toHaveTextContent('Closed to save memory · 30 min idle');
    expect(descriptionOf(screen.getByRole('link', { name: 'Two' }))).toHaveTextContent(/^Closed$/u);
  });

  it('folds what is no longer live under Earlier', () => {
    liveProjectIds = ['proj_two'];
    render(<ProjectNavigation />);
    expect(screen.getByText('Earlier')).toBeInTheDocument();
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['Two', 'One']);
  });
});
