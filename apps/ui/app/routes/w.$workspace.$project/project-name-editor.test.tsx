// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const { mockUpdateName } = vi.hoisted(() => ({
  mockUpdateName: vi.fn(),
}));

let mockProjectName = 'Birdhouse';
let mockIsLoading = false;
let mockIsProjectError = false;

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectRef: { send: vi.fn() },
    updateName: mockUpdateName,
  }),
}));

vi.mock('@xstate/react', () => ({
  useSelector: (
    _actor: unknown,
    selector: (state: {
      context: { project?: { name: string }; isLoading: boolean };
      matches: (state: string) => boolean;
    }) => unknown,
  ) =>
    selector({
      context: {
        project: { name: mockProjectName },
        isLoading: mockIsLoading,
      },
      matches: (state) => state === 'error' && mockIsProjectError,
    }),
}));

vi.mock('#components/ui/tooltip.js', () => ({
  Tooltip: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#components/ui/loader.js', () => ({
  Loader: () => <div data-testid='loader'>loader</div>,
}));

vi.mock('#components/inline-text-editor.js', () => ({
  InlineTextEditor: ({
    value,
    isDisabled,
    renderDisplay,
    onSave,
  }: {
    readonly value: string;
    readonly isDisabled?: boolean;
    readonly renderDisplay: (value: string) => React.ReactNode;
    readonly onSave: (value: string) => void;
  }) => (
    <div>
      <div data-testid='display'>{renderDisplay(value)}</div>
      <button disabled={isDisabled} onClick={() => onSave('Renamed Project')}>
        rename
      </button>
    </div>
  ),
}));

const { ProjectNameEditor } = await import('#routes/w.$workspace.$project/project-name-editor.js');

describe('ProjectNameEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectName = 'Birdhouse';
    mockIsLoading = false;
    mockIsProjectError = false;
  });

  it('renames the already-created project only when the user saves an edit', () => {
    render(<ProjectNameEditor />);

    expect(screen.getByTestId('display')).toHaveTextContent('Birdhouse');
    expect(mockUpdateName).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'rename' }));

    expect(mockUpdateName).toHaveBeenCalledWith('Renamed Project');
    expect(screen.getByTestId('display')).toHaveTextContent('Renamed Project');
  });

  it('shows the loader while the manifest name is unavailable', () => {
    mockProjectName = '';
    mockIsLoading = true;

    render(<ProjectNameEditor />);

    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('disables renaming and explains a missing project', () => {
    mockIsProjectError = true;

    render(<ProjectNameEditor />);

    expect(screen.getByTestId('display')).toHaveTextContent('Project unavailable');
    expect(screen.getByRole('button', { name: 'rename' })).toBeDisabled();
    expect(screen.getByText('Project unavailable', { selector: 'div > div' })).toBeInTheDocument();
  });
});
