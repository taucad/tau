import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectCreationLocationState } from '#hooks/use-project-creation-location.js';

const mockCreateProject = vi.fn();
const mockPresentLocationError = vi.fn(() => false);
const mockRefresh = vi.fn(async () => undefined);
let locationState: ProjectCreationLocationState;

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({ createProject: mockCreateProject }),
}));
vi.mock('#hooks/use-kernel.js', () => ({
  useKernel: () => ({ kernel: 'openscad', setKernel: vi.fn() }),
}));
vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: () => ({ formattedKeyCombination: '↵' }),
}));
vi.mock('#hooks/use-project-creation-location.js', () => ({
  useProjectCreationLocation: () => locationState,
}));
vi.mock('#hooks/use-project-creation-location-error.js', () => ({
  useProjectCreationLocationError: () => mockPresentLocationError,
}));
vi.mock('#components/filesystem/workspace-selector.js', () => ({
  WorkspaceSelector: ({ state }: { readonly state: ProjectCreationLocationState }) => (
    <div data-testid='location-picker'>{state.phase === 'ready' ? state.value.kind : 'loading'}</div>
  ),
}));
vi.mock('#components/icons/svg-icon.js', () => ({ SvgIcon: () => null }));

const { default: ProjectsNew } = await import('#routes/projects_.new/route.js');

const homeOnlyState = (): ProjectCreationLocationState => ({
  phase: 'ready',
  hasWebAccessCapability: false,
  shouldShowPicker: false,
  value: { kind: 'home' },
  options: [{ location: { kind: 'home' }, status: 'ready', label: 'Home', detail: 'in this browser' }],
  canCreate: true,
});

const workspaceState = (): ProjectCreationLocationState => ({
  phase: 'ready',
  hasWebAccessCapability: true,
  shouldShowPicker: true,
  value: { kind: 'workspace', workspaceId: 'wsp_workshop' },
  selectedOption: {
    location: { kind: 'workspace', workspaceId: 'wsp_workshop' },
    status: 'connected',
    label: 'Workshop',
    detail: 'on your disk',
  },
  options: [],
  canCreate: true,
  select: vi.fn(),
  connectWorkspace: vi.fn(async () => undefined),
  selectedWorkspaceRecovery: undefined,
  refresh: mockRefresh,
});

const renderRoute = (): void => {
  render(
    <MemoryRouter>
      <ProjectsNew />
    </MemoryRouter>,
  );
};

describe('/projects/new creation location', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    locationState = homeOnlyState();
    mockCreateProject.mockResolvedValue({ slugs: { workspaceSlug: 'home', projectSlug: 'bracket' } });
  });

  it('renders static Home and creates there when folder access is unavailable', async () => {
    renderRoute();

    expect(screen.getByText('Home in this browser')).toBeInTheDocument();
    expect(screen.queryByTestId('location-picker')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Project Name *'), 'Bracket');
    await userEvent.click(screen.getByRole('button', { name: /Create Project/ }));

    expect(mockCreateProject.mock.calls[0]?.[0]?.location).toEqual({ kind: 'home' });
  });

  it('uses the same controlled workspace selection and refreshes it after a typed failure', async () => {
    const error = new Error('disconnected');
    locationState = workspaceState();
    mockCreateProject.mockRejectedValue(error);
    mockPresentLocationError.mockReturnValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderRoute();

    expect(screen.getByTestId('location-picker')).toHaveTextContent('workspace');
    await userEvent.type(screen.getByLabelText('Project Name *'), 'Bracket');
    await userEvent.click(screen.getByRole('button', { name: /Create Project/ }));

    expect(mockCreateProject.mock.calls[0]?.[0]?.location).toEqual({
      kind: 'workspace',
      workspaceId: 'wsp_workshop',
    });
    expect(mockPresentLocationError).toHaveBeenCalledWith(error);
    expect(mockRefresh).toHaveBeenCalledOnce();
  });
});
