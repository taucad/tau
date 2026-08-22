// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { projectToManifest } from '@taucad/types';
import { ProjectActionDropdown } from '#components/project-library/project-action-dropdown.js';
import type { ProjectActions } from '#components/project-library/project-library.js';
import type { ProjectListItem } from '#types/project.types.js';

const project = {
  ...projectToManifest({
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
