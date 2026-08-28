import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { useProjects } from '#hooks/use-projects.js';

const mockUseProjects = vi.fn();
const mockCreateChat = vi.fn();
const mockIsProjectExpanded = vi.fn();
const mockSetProjectDisclosure = vi.fn();
const mockNavigate = vi.fn();
const mockInvalidateQueries = vi.fn();
let pathname = '/';
let pendingLocation: { readonly pathname: string; readonly search: string } | undefined;

vi.mock('#hooks/use-projects.js', () => ({
  useProjects: () => mockUseProjects() as ReturnType<typeof useProjects>,
}));
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
  useLocation: () => ({ pathname }),
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
vi.mock('#components/ui/button.js', () => ({
  Button: ({ children, ...properties }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...properties}>
      {children}
    </button>
  ),
}));
vi.mock('#components/ui/tooltip.js', () => ({
  Tooltip: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
  TooltipContent: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
}));
vi.mock('#components/ui/dropdown-menu.js', () => ({
  DropdownMenu: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
  DropdownMenuContent: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, onSelect }: { readonly children: ReactNode; readonly onSelect?: () => void }) => (
    <button type='button' onClick={onSelect}>
      {children}
    </button>
  ),
}));
vi.mock('#components/inline-text-editor.js', () => ({
  InlineTextEditor: ({ value }: { readonly value: string }) => (
    <input aria-label={`Rename ${value}`} value={value} readOnly />
  ),
}));
vi.mock('#components/publish/project-share-dialog.js', () => ({ ProjectShareDialog: () => null }));
vi.mock('#components/ui/sonner.js', () => ({ toast: { success: vi.fn() } }));

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
  retry: vi.fn(),
  deleteProject: vi.fn(),
  duplicateProject: vi.fn(),
  updateName: vi.fn(),
};

const { ProjectNavigation } = await import('#components/nav/project-navigation.js');

describe('ProjectNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname = '/';
    pendingLocation = undefined;
    mockUseProjects.mockReturnValue(projectsResult);
    mockIsProjectExpanded.mockImplementation((_projectId: string, active: boolean) => active);
    mockSetProjectDisclosure.mockResolvedValue(undefined);
    mockNavigate.mockResolvedValue(undefined);
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

    fireEvent.click(screen.getByRole('button', { name: 'New chat in Two' }));
    await vi.waitFor(() => {
      expect(mockCreateChat).toHaveBeenCalledWith('proj_two', { name: 'New chat', messages: [] });
      expect(mockNavigate).toHaveBeenCalledWith('/w/home/Two%20space?chat=chat%2Ftwo');
    });
  });
});
