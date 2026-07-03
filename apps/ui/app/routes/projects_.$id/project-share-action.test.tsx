import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectShareAction } from '#routes/projects_.$id/project-share-action.js';
import { TooltipProvider } from '#components/ui/tooltip.js';

vi.mock('#machines/publish.machine.js', async () => {
  const { publishMachineForUiTests } = await import('#machines/publish.machine.ui-test-double.js');
  return { publishMachine: publishMachineForUiTests };
});

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ fileManagerRef: {} }),
}));

vi.mock('#environment.config.js', () => ({
  ENV: { TAU_API_URL: 'https://api.example' },
}));

vi.mock('#hooks/use-project.js', async () => {
  const { createActor, setup } = await import('xstate');

  const cadMachineTypes = {
    context: { geometry: undefined as unknown },
  } satisfies { context: { geometry: unknown } };

  const cadMachine = setup({
    types: cadMachineTypes,
  }).createMachine({
    context: { geometry: undefined },
    initial: 'idle',
    states: { idle: {} },
  });

  type ProjectMachineContext = {
    project?: {
      name: string;
      description: string;
      assets: { mechanical: { parameters: Record<string, unknown> } };
      updatedAt: string;
    };
  };

  const projectMachineTypes = {
    context: {},
  } satisfies { context: ProjectMachineContext };

  const projectMachine = setup({
    types: projectMachineTypes,
  }).createMachine({
    context: {
      project: {
        name: 'Header Demo',
        description: 'Sidebar copy',
        updatedAt: '2026-01-01T00:00:00.000Z',
        assets: { mechanical: { parameters: { width: 10 } } },
      },
    },
    initial: 'idle',
    states: { idle: {} },
  });

  const cadActor = createActor(cadMachine).start();
  const projectActor = createActor(projectMachine).start();

  return {
    useProject: () => ({
      geometryUnits: new Map([['main.ts', cadActor]]),
      mainEntryFile: 'main.ts',
      projectId: 'proj_header',
      projectRef: projectActor,
    }),
  };
});

describe('ProjectShareAction', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({
        project: { id: 'proj_header', name: null, description: null },
        currentPublication: null,
        snapshot: { state: 'unpublished' },
      })),
    });
  });

  it('keeps Share enabled when geometry has not rendered', async () => {
    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectShareAction />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /share/i })).not.toBeDisabled();
  });

  it('shows share tooltip copy', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectShareAction />
        </TooltipProvider>
      </MemoryRouter>,
    );

    await user.hover(screen.getByRole('button', { name: /share/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Share project').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('opens the source-context share dialog from Share control', async () => {
    render(
      <MemoryRouter>
        <TooltipProvider>
          <ProjectShareAction />
        </TooltipProvider>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: /share/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Header Demo')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Sidebar copy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish and copy link/i })).toBeInTheDocument();
  });
});
