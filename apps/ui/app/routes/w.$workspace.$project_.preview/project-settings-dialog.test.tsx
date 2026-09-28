// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ProjectSettingsDialog } from '#routes/w.$workspace.$project_.preview/project-settings-dialog.js';

const { deleteProject, navigate, toastSuccess } = vi.hoisted(() => ({
  deleteProject: vi.fn(async () => true),
  navigate: vi.fn(async () => undefined),
  toastSuccess: vi.fn(),
}));

vi.mock('#routes/w.$workspace.$project_.preview/preview-project-context.js', () => ({
  usePreviewProject: () => ({
    project: {
      id: 'proj_one',
      name: 'Project one',
      description: '',
      tags: [],
      assets: { main: { entryPath: 'main.ts' } },
    },
    updateName: vi.fn(),
    updateDescription: vi.fn(),
  }),
}));
vi.mock('#hooks/use-projects.js', () => ({ useProjects: () => ({ deleteProject }) }));
vi.mock('#components/ui/sonner.js', () => ({ toast: { success: toastSuccess, error: vi.fn() } }));
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));

describe('ProjectSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('moves the previewed project to recoverable Trash after confirmation', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <ProjectSettingsDialog />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Project settings' }));
    await user.click(screen.getByRole('button', { name: 'Move to Trash' }));
    expect(screen.getByRole('alertdialog', { name: 'Move Project one to Trash?' })).toBeInTheDocument();
    expect(deleteProject).not.toHaveBeenCalled();

    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Move to Trash' }));
    await waitFor(() => {
      expect(deleteProject).toHaveBeenCalledExactlyOnceWith('proj_one');
      expect(navigate).toHaveBeenCalledWith('/projects?trash=1');
      expect(toastSuccess).toHaveBeenCalledWith('Moved Project one to Trash');
    });
  });
});
