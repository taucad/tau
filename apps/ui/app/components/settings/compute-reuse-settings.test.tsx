import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  mode: 'durable' as 'off' | 'memory' | 'durable',
  set: vi.fn(),
  available: true,
  projectId: 'project-a' as string | undefined,
  inspect: vi.fn(async (_input: unknown): Promise<unknown> => undefined),
  clear: vi.fn(async (_input: unknown): Promise<unknown> => undefined),
  collect: vi
    .fn(async (_input: unknown): Promise<unknown> => undefined)
    .mockResolvedValueOnce({ status: 'incomplete', reclaimed: 7, cursor: 'next' })
    .mockResolvedValueOnce({ status: 'complete', reclaimed: 3 }),
}));
vi.mock('#lib/compute-reuse-preference.js', () => ({
  useComputeReuseMode: () => state.mode,
  setComputeReuseMode: state.set,
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => (state.projectId ? { projectId: state.projectId } : undefined),
}));
vi.mock('#hooks/use-file-manager.js', () => ({
  useOptionalFileManager: () =>
    state.available
      ? {
          fileManagerRef: {
            getSnapshot: () => ({
              context: {
                computeControl: async (_projectId: string, action: 'inspect' | 'clear' | 'collect', input: unknown) => {
                  let result: unknown;
                  if (action === 'inspect') {
                    result = await state.inspect(input);
                  } else if (action === 'clear') {
                    result = await state.clear(input);
                  } else {
                    result = await state.collect(input);
                  }
                  return result;
                },
              },
            }),
          },
        }
      : undefined,
}));
vi.mock('#filesystem/desktop-bridge.js', () => ({ desktopBridge: () => undefined }));

const { ComputeReuseSettings } = await import('./compute-reuse-settings.js');

beforeEach(() => {
  state.set.mockReset();
  state.available = true;
  state.projectId = 'project-a';
  state.inspect.mockReset();
  state.clear.mockReset();
  state.collect.mockReset();
  state.collect
    .mockResolvedValueOnce({ status: 'incomplete', reclaimed: 7, cursor: 'next' })
    .mockResolvedValueOnce({ status: 'complete', reclaimed: 3 });
});

it('shows the current mode in a labelled select and applies the chosen mode', async () => {
  render(<ComputeReuseSettings />, { wrapper: TooltipProvider });
  const select = screen.getByRole('combobox', { name: 'Reuse results' });
  expect(select).toHaveTextContent('On this device');
  Element.prototype.scrollIntoView = vi.fn();
  select.focus();
  await userEvent.keyboard('{Enter}');
  expect(await screen.findByRole('option', { name: 'Off' })).toBeInTheDocument();
  await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
  expect(state.set).toHaveBeenCalledWith('off');
});

it('reports bounded collection and continues from its returned cursor', async () => {
  render(<ComputeReuseSettings />, { wrapper: TooltipProvider });
  fireEvent.click(screen.getByRole('button', { name: 'Free space' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Freed 7 B. More can be freed.');
  fireEvent.click(screen.getByRole('button', { name: 'Free more' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Freed 3 B.');
  expect(state.collect).toHaveBeenLastCalledWith({ budget: 20, cursor: 'next' });
});

it('disables controls without authority and reports failures and retained clear bytes', async () => {
  state.available = false;
  const unavailable = render(<ComputeReuseSettings />, { wrapper: TooltipProvider });
  expect(screen.getByRole('button', { name: 'Check size' })).toBeDisabled();
  unavailable.unmount();

  state.available = true;
  state.inspect.mockRejectedValueOnce(new Error('inspect failed'));
  state.clear.mockResolvedValueOnce({ status: 'cleared', generation: 2, retained: 11 });
  render(<ComputeReuseSettings />, { wrapper: TooltipProvider });
  fireEvent.click(screen.getByRole('button', { name: 'Check size' }));
  expect(await screen.findByRole('status')).toHaveTextContent('inspect failed');
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(screen.getByRole('button', { name: 'Confirm clear' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm clear' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Cleared. 11 B still in use.');
});

it('keeps cache controls unavailable without an active project', () => {
  state.projectId = undefined;
  render(<ComputeReuseSettings />, { wrapper: TooltipProvider });
  expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
});
