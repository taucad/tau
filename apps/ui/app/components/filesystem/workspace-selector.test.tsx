import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { WorkspaceSelector } from '#components/filesystem/workspace-selector.js';
import { TooltipProvider } from '#components/ui/tooltip.js';
import type { ProjectCreationLocationState } from '#hooks/use-project-creation-location.js';

const homeOnly: ProjectCreationLocationState = {
  phase: 'ready',
  hasWebAccessCapability: false,
  shouldShowPicker: false,
  value: { kind: 'home' },
  options: [{ location: { kind: 'home' }, status: 'ready', label: 'Home', detail: 'in this browser' }],
  canCreate: true,
};

type CapableReadyState = Extract<ProjectCreationLocationState, { phase: 'ready'; hasWebAccessCapability: true }>;

const readyState = (overrides: Partial<CapableReadyState> = {}): CapableReadyState => ({
  phase: 'ready',
  hasWebAccessCapability: true,
  shouldShowPicker: true,
  value: { kind: 'home' },
  selectedOption: { location: { kind: 'home' }, status: 'ready', label: 'Home', detail: 'in this browser' },
  options: [
    { location: { kind: 'home' }, status: 'ready', label: 'Home', detail: 'in this browser' },
    {
      location: { kind: 'workspace', workspaceId: 'wsp_workshop' },
      status: 'connected',
      label: 'A very long workshop folder name',
      detail: 'on your disk',
    },
  ],
  canCreate: true,
  select: vi.fn(),
  connectWorkspace: vi.fn(async () => undefined),
  selectedWorkspaceRecovery: undefined,
  refresh: vi.fn(async () => undefined),
  ...overrides,
});

const renderPicker = (
  state: CapableReadyState,
  properties: Partial<React.ComponentProps<typeof WorkspaceSelector>> = {},
): void => {
  render(
    <TooltipProvider>
      <WorkspaceSelector state={state} variant='toolbar' {...properties} />
    </TooltipProvider>,
  );
};

beforeAll(() => {
  globalThis.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe('WorkspaceSelector', () => {
  it('mounts no interactive location UI without capability', () => {
    const { container } = render(<WorkspaceSelector state={homeOnly} variant='toolbar' />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Create in')).not.toBeInTheDocument();
  });

  it.each(['toolbar', 'field'] as const)('renders a disabled %s placeholder while capable state loads', (variant) => {
    render(
      <WorkspaceSelector
        state={{
          phase: 'loading',
          hasWebAccessCapability: true,
          shouldShowPicker: true,
          options: [],
          canCreate: false,
        }}
        variant={variant}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Loading project locations' });
    expect(trigger).toBeDisabled();
    expect(trigger.querySelector('svg')).toHaveClass('size-3.5');
  });

  it('matches the model selector geometry and explains the storage choice', async () => {
    const user = userEvent.setup();
    renderPicker(readyState());

    const trigger = screen.getByRole('button', { name: 'Create in Home' });
    expect(trigger).toHaveClass('h-7', 'rounded-full');
    expect(trigger.querySelector('svg')).toHaveClass('size-3.5');
    expect(trigger).toHaveTextContent('Home');
    expect(trigger).not.toHaveTextContent('in this browser');
    expect(trigger.querySelector('[title]')).toBeNull();

    await user.hover(trigger);
    const tooltipCopy = await screen.findAllByText(
      'Home uses browser storage, which can be cleared. Select to change location.',
    );
    expect(tooltipCopy[0]).toBeVisible();
  });

  it('explains direct disk storage without repeating the trigger label', async () => {
    const user = userEvent.setup();
    const base = readyState();
    const selectedOption = base.options[1]!;
    renderPicker(
      readyState({
        value: selectedOption.location,
        selectedOption,
      }),
    );

    const trigger = screen.getByRole('button', {
      name: 'Create in A very long workshop folder name',
    });
    expect(trigger).not.toHaveTextContent('on your disk');
    await user.hover(trigger);
    const tooltipCopy = await screen.findAllByText(
      'Projects are saved directly to this folder on your disk. Select to change location.',
    );
    expect(tooltipCopy[0]).toBeVisible();
  });

  it('left-aligns field copy beside the icon and keeps the chevron at the right edge', () => {
    render(<WorkspaceSelector state={readyState()} variant='field' />);

    const trigger = screen.getByRole('button', { name: 'Create in Home' });
    expect(trigger).toHaveClass('justify-start');
    expect(screen.getByText('Home')).toHaveClass('min-w-0', 'flex-1', 'text-left');
    expect(trigger).not.toHaveTextContent('in this browser');
    expect(trigger.lastElementChild).toHaveClass('ml-auto');
  });

  it('uses compact single-line options without search for a short list', async () => {
    const user = userEvent.setup();
    renderPicker(readyState());

    await user.click(screen.getByRole('button', { name: 'Create in Home' }));

    expect(screen.queryByPlaceholderText('Search locations...')).not.toBeInTheDocument();
    expect(screen.getByText('Create in')).toBeVisible();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('Home');
    expect(options[0]).toHaveTextContent('in this browser');
    expect(options[1]).toHaveTextContent('A very long workshop folder name');
    expect(options[1]).toHaveTextContent('on your disk');
    expect(options[0]).not.toHaveTextContent('·');
    expect(options[1]).not.toHaveTextContent('·');
    expect(screen.getByText('in this browser')).toHaveClass('text-xs');
    expect(screen.getByText('on your disk')).toHaveClass('text-xs');
    expect(screen.getByTitle('Home in this browser')).toHaveClass('gap-2');
    expect(screen.getByTitle('A very long workshop folder name on your disk')).toHaveClass('gap-2');
    expect(options[0]!.querySelector('[aria-label="Selected location"]')).toBeInTheDocument();
    expect(options[1]!.querySelector('[aria-label="Selected location"]')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect a folder…' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Manage locations…' })).toBeVisible();
  });

  it.each([
    [4, false],
    [5, true],
  ] as const)('handles %s locations with search enabled=%s', async (optionCount, enabled) => {
    const user = userEvent.setup();
    const base = readyState();
    const options: CapableReadyState['options'] = [
      base.options[0]!,
      ...Array.from({ length: optionCount - 1 }, (_, index): CapableReadyState['options'][number] => ({
        location: { kind: 'workspace', workspaceId: `wsp_${index}` },
        status: 'connected',
        label: `Workspace ${index + 1}`,
        detail: 'on your disk',
      })),
    ];
    renderPicker(readyState({ options }));

    await user.click(screen.getByRole('button', { name: 'Create in Home' }));

    if (enabled) {
      expect(screen.getByPlaceholderText('Search locations...')).toBeVisible();
    } else {
      expect(screen.queryByPlaceholderText('Search locations...')).not.toBeInTheDocument();
    }
  });

  it('closes and completes a connected selection', async () => {
    const user = userEvent.setup();
    const state = readyState();
    const onSelectionComplete = vi.fn();
    renderPicker(state, { onSelectionComplete });

    await user.click(screen.getByRole('button', { name: 'Create in Home' }));
    await user.click(screen.getByRole('option', { name: /A very long workshop folder name/u }));

    expect(state.select).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'wsp_workshop' });
    expect(onSelectionComplete).toHaveBeenCalledOnce();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('keeps an unavailable selection open for its exact recovery action', async () => {
    const user = userEvent.setup();
    const onSelectionComplete = vi.fn();
    const permissionOption: CapableReadyState['options'][number] = {
      location: { kind: 'workspace', workspaceId: 'wsp_permission' },
      status: 'permission',
      label: 'Permission folder',
      detail: 'on your disk',
    };
    const state = readyState({ options: [...readyState().options, permissionOption] });
    renderPicker(state, { onSelectionComplete });

    await user.click(screen.getByRole('button', { name: 'Create in Home' }));
    await user.click(screen.getByRole('option', { name: /Permission folder/u }));

    expect(state.select).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'wsp_permission' });
    expect(onSelectionComplete).not.toHaveBeenCalled();
    expect(screen.getByText('Create in')).toBeVisible();
  });

  it('runs only the selected unavailable location recovery from the footer', async () => {
    const user = userEvent.setup();
    const run = vi.fn(async () => undefined);
    const onSelectionComplete = vi.fn();
    const selected: CapableReadyState['selectedOption'] = {
      location: { kind: 'workspace', workspaceId: 'wsp_workshop' },
      status: 'permission',
      label: 'Workshop',
      detail: 'on your disk',
    };
    render(
      <WorkspaceSelector
        state={readyState({
          value: selected.location,
          selectedOption: selected,
          options: [readyState().options[0]!, selected],
          canCreate: false,
          selectedWorkspaceRecovery: { kind: 'grant', run },
        })}
        variant='field'
        onSelectionComplete={onSelectionComplete}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create in Workshop' }));
    await user.click(screen.getByRole('button', { name: 'Grant access' }));

    await waitFor(() => {
      expect(run).toHaveBeenCalledOnce();
    });
    expect(screen.queryByRole('button', { name: 'Reconnect folder' })).not.toBeInTheDocument();
    expect(onSelectionComplete).toHaveBeenCalledOnce();
  });

  it('preserves action callbacks and safe location management', async () => {
    const user = userEvent.setup();
    const state = readyState();
    const onSelectionComplete = vi.fn();
    const open = vi.spyOn(globalThis.window, 'open').mockReturnValue(null);
    renderPicker(state, { onSelectionComplete });

    const trigger = screen.getByRole('button', { name: 'Create in Home' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Connect a folder…' }));
    await waitFor(() => {
      expect(state.connectWorkspace).toHaveBeenCalledOnce();
    });
    expect(onSelectionComplete).toHaveBeenCalledOnce();

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Manage locations…' }));
    expect(open).toHaveBeenCalledWith('/files', '_blank', 'noopener,noreferrer');
    expect(onSelectionComplete).toHaveBeenCalledTimes(2);
  });

  it('restores focus after desktop cancellation but not nested cancellation', async () => {
    const user = userEvent.setup();
    const onRequestFocus = vi.fn();
    const { unmount } = render(
      <TooltipProvider>
        <WorkspaceSelector state={readyState()} variant='toolbar' onRequestFocus={onRequestFocus} />
      </TooltipProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Create in Home' }));
    await user.keyboard('{Escape}');
    expect(onRequestFocus).toHaveBeenCalledOnce();
    unmount();

    render(
      <TooltipProvider>
        <WorkspaceSelector state={readyState()} variant='toolbar' isNested onRequestFocus={onRequestFocus} />
      </TooltipProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Create in Home' }));
    await user.keyboard('{Escape}');
    expect(onRequestFocus).toHaveBeenCalledOnce();
  });
});
