// @vitest-environment jsdom
import { createProjectFixture } from '#lib/project.fixture.js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectActionDropdown } from '#components/project-library/project-action-dropdown.js';
import type { ProjectActions } from '#components/project-library/project-library.js';
import type { ProjectListItem } from '#types/project-library.types.js';
import type * as NativeFileManager from '#hooks/use-native-file-manager.js';

let rowRuns = 0;
const { mockGetProjectClosePlan, mockCloseProject } = vi.hoisted(() => ({
  mockGetProjectClosePlan: vi.fn(),
  mockCloseProject: vi.fn(),
}));
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: () => ({ getProjectClosePlan: mockGetProjectClosePlan }),
}));
const { mockOpenInFileManager } = vi.hoisted(() => ({ mockOpenInFileManager: vi.fn(async () => undefined) }));
let canOpenInFileManager = false;
vi.mock('#hooks/use-native-file-manager.js', async (importOriginal) => ({
  ...(await importOriginal<typeof NativeFileManager>()),
  useOpenProjectInFileManager: () =>
    canOpenInFileManager
      ? { label: 'Open in Finder', icon: 'finder', isOpening: false, open: mockOpenInFileManager }
      : undefined,
}));
vi.mock('#hooks/use-sidebar-status.js', () => ({
  pluralize: (count: number, noun: string) => `${String(count)} ${noun}${count === 1 ? '' : 's'}`,
  useProjectSidebarRow: (projectId: string) => ({ projectId, runs: rowRuns }),
  useSidebarCommands: () => ({ closeProject: mockCloseProject }),
}));

const project = {
  ...createProjectFixture({
    id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
    name: 'Readable Project',
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  }),
  lastActivityAt: 1,
  locator: {
    backend: 'indexeddb',
    storageRootKey: 'indexeddb:tau',
    relativeDirectory: '/readable-project',
  },
} satisfies ProjectListItem;

const createActions = (): ProjectActions => ({
  handleDelete: vi.fn(),
  handlePermanentlyDelete: vi.fn(),
  handleDuplicate: vi.fn(),
  handleRename: vi.fn(),
  handleRestore: vi.fn(),
});

describe('ProjectActionDropdown', () => {
  beforeEach(() => {
    rowRuns = 0;
    canOpenInFileManager = false;
    vi.clearAllMocks();
    mockGetProjectClosePlan.mockResolvedValue({
      stoppableRunCount: 0,
      liveChatIds: [],
      continuingRuns: [],
    });
  });

  it('offers recoverable trash for an active project', async () => {
    const user = userEvent.setup();
    const actions = createActions();
    render(<ProjectActionDropdown project={project} actions={actions} />);

    await user.click(screen.getByRole('button', { name: 'Actions for Readable Project' }));

    expect(screen.getByRole('menuitem', { name: 'Move to Trash' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Delete permanently' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Move to Trash' }));
    expect(actions.handleDelete).toHaveBeenCalledWith(project);
  });

  it('opens a disk-backed project in the native file manager like the sidebar does', async () => {
    const user = userEvent.setup();
    const actions = createActions();
    const { unmount } = render(<ProjectActionDropdown project={project} actions={actions} />);
    await user.click(screen.getByRole('button', { name: 'Actions for Readable Project' }));
    expect(screen.queryByRole('menuitem', { name: 'Open in Finder' })).not.toBeInTheDocument();
    unmount();

    canOpenInFileManager = true;
    render(<ProjectActionDropdown project={project} actions={actions} />);
    await user.click(screen.getByRole('button', { name: 'Actions for Readable Project' }));
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveAccessibleName('Open in Finder');
    expect(items[0]?.querySelector('use[href="#finder"]')).toBeInTheDocument();
    await user.click(items[0]!);
    expect(mockOpenInFileManager).toHaveBeenCalledOnce();
  });

  it('asks before trashing a project with running work', async () => {
    rowRuns = 2;
    mockGetProjectClosePlan.mockResolvedValue({
      stoppableRunCount: 1,
      liveChatIds: ['chat-unseen'],
      continuingRuns: [],
    });
    const user = userEvent.setup();
    const actions = createActions();
    render(<ProjectActionDropdown project={project} actions={actions} />);

    await user.click(screen.getByRole('button', { name: 'Actions for Readable Project' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move to Trash' }));

    expect(actions.handleDelete).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('heading', { name: 'Stop 1 run and close Readable Project before deleting?' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Stop and close' }));
    expect(mockCloseProject).toHaveBeenCalledExactlyOnceWith(project.id);
    expect(actions.handleDelete).not.toHaveBeenCalled();
  });

  it('blocks Move to Trash while another build holds a run', async () => {
    mockGetProjectClosePlan.mockResolvedValue({
      stoppableRunCount: 0,
      liveChatIds: ['chat-foreign'],
      continuingRuns: [{ id: 'run-foreign', label: 'Foreign chat', reason: 'other-build' }],
    });
    const user = userEvent.setup();
    const actions = createActions();
    render(<ProjectActionDropdown project={project} actions={actions} />);
    await user.click(screen.getByRole('button', { name: 'Actions for Readable Project' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move to Trash' }));
    expect(mockGetProjectClosePlan).toHaveBeenCalledWith(project.id);
    expect(screen.queryByRole('heading', { name: /before deleting/u })).not.toBeInTheDocument();
    expect(actions.handleDelete).not.toHaveBeenCalled();
    expect(mockCloseProject).not.toHaveBeenCalled();
  });

  it('offers restore and permanent deletion only for a trashed project', async () => {
    const user = userEvent.setup();
    const actions = createActions();
    const trashedProject: ProjectListItem = { ...project, deletedAt: 2 };
    render(<ProjectActionDropdown project={trashedProject} actions={actions} />);

    await user.click(screen.getByRole('button', { name: 'Actions for Readable Project' }));

    expect(screen.getByRole('menuitem', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete permanently' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Move to Trash' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Delete permanently' }));
    expect(actions.handlePermanentlyDelete).toHaveBeenCalledWith(trashedProject);
  });
});
