import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  mode: 'durable' as 'off' | 'memory' | 'durable',
  set: vi.fn(),
  available: true,
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
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project-a' }) }));
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
  state.inspect.mockReset();
  state.clear.mockReset();
  state.collect.mockReset();
  state.collect
    .mockResolvedValueOnce({ status: 'incomplete', reclaimed: 7, cursor: 'next' })
    .mockResolvedValueOnce({ status: 'complete', reclaimed: 3 });
});

it('offers labelled keyboard-native modes and applies the chosen mode', () => {
  render(<ComputeReuseSettings />);
  expect(screen.getByRole('radio', { name: /Durable/ })).toBeChecked();
  fireEvent.click(screen.getByRole('radio', { name: /Off/ }));
  expect(state.set).toHaveBeenCalledWith('off');
});

it('reports bounded collection and continues from its returned cursor', async () => {
  render(<ComputeReuseSettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Collect' }));
  expect(await screen.findByRole('status')).toHaveTextContent('7 bytes reclaimed; more remain');
  fireEvent.click(screen.getByRole('button', { name: 'Continue collect' }));
  expect(await screen.findByRole('status')).toHaveTextContent('3 bytes reclaimed; complete');
  expect(state.collect).toHaveBeenLastCalledWith({ budget: 20, cursor: 'next' });
});

it('disables controls without authority and reports failures and retained clear bytes', async () => {
  state.available = false;
  const unavailable = render(<ComputeReuseSettings />);
  expect(screen.getByRole('button', { name: 'Inspect' })).toBeDisabled();
  unavailable.unmount();

  state.available = true;
  state.inspect.mockRejectedValueOnce(new Error('inspect failed'));
  state.clear.mockResolvedValueOnce({ status: 'cleared', generation: 2, retained: 11 });
  render(<ComputeReuseSettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
  expect(await screen.findByRole('status')).toHaveTextContent('inspect failed');
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(screen.getByRole('button', { name: 'Confirm clear' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm clear' }));
  expect(await screen.findByRole('status')).toHaveTextContent('11 bytes retained');
});
