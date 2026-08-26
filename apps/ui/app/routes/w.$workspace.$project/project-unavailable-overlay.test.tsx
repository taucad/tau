import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const projectSend = vi.fn();
let projectError: Error | undefined;
let fileManagerError: Error | undefined;

const projectRef = {
  send: projectSend,
  getSnapshot: () => ({
    context: { error: projectError },
    matches: (state: string) => state === 'error' && projectError !== undefined,
  }),
};
const fileManagerRef = {
  getSnapshot: () => ({
    context: { error: fileManagerError },
    matches: (state: string) => state === 'error' && fileManagerError !== undefined,
  }),
};

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown }, selector: (snapshot: unknown) => unknown) =>
    selector(actor.getSnapshot()),
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectRef }),
}));
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    fileManagerRef,
    unavailableReason: undefined,
    activeWorkspaceId: undefined,
    activeWorkspaceName: undefined,
  }),
}));

const { ProjectUnavailableOverlay } = await import('./project-unavailable-overlay.js');

describe('ProjectUnavailableOverlay', () => {
  beforeEach(() => {
    projectError = undefined;
    fileManagerError = undefined;
    projectSend.mockClear();
  });

  it('should classify a project load failure as unavailable and retry the same actor', async () => {
    projectError = new Error('Scoped tau.json could not be read');
    render(
      <MemoryRouter>
        <ProjectUnavailableOverlay />
      </MemoryRouter>,
    );

    expect(screen.getByText('Project Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Tau could not load this project.')).toBeInTheDocument();
    expect(screen.getByText('Scoped tau.json could not be read')).toBeInTheDocument();
    expect(screen.queryByText(/doesn't exist|deleted/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(projectSend).toHaveBeenCalledWith({ type: 'reloadProject' });
  });

  it('should use the same unavailable surface for a terminal file-manager error', () => {
    fileManagerError = new Error('Worker connection failed');
    render(
      <MemoryRouter>
        <ProjectUnavailableOverlay />
      </MemoryRouter>,
    );

    expect(screen.getByText('Project Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Worker connection failed')).toBeInTheDocument();
    expect(screen.queryByText(/doesn't exist|deleted/i)).not.toBeInTheDocument();
  });
});
