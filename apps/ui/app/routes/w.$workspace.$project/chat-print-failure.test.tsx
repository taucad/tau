// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { MachineClient, MachineDirectoryEntry } from '@taucad/runtime/machine';
import { FailureEvidence } from '#routes/w.$workspace.$project/chat-print-controls.js';
import { entry as createEntry } from '#routes/w.$workspace.$project/chat-print.fixture.js';

const entry = createEntry();
const failed = (): MachineDirectoryEntry => ({
  ...entry,
  snapshot: {
    ...entry.snapshot,
    alerts: [{ code: '0500-402F', message: 'The microSD card has damaged sector data.' }],
  },
});
const captureStill = vi.fn<MachineClient['captureStill']>();
const client = mock<MachineClient>({ captureStill });
const createObjectURL = vi.fn(() => 'blob:failure');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.stubGlobal(
    'URL',
    class extends URL {
      public static override createObjectURL = createObjectURL;
      public static override revokeObjectURL = revokeObjectURL;
    },
  );
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  captureStill.mockReset().mockResolvedValue({
    bytes: new Uint8Array([1, 2, 3]),
    mediaType: 'image/jpeg',
    capturedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('failure camera evidence', () => {
  it('should capture automatically once per failure and rearm after it clears', async () => {
    const view = render(<FailureEvidence client={client} entry={failed()} />);
    expect(await screen.findByRole('img', { name: 'Failure still from Workshop X1C' })).toHaveAttribute(
      'src',
      'blob:failure',
    );
    expect(screen.getByText(/0500-402F/)).toBeVisible();
    view.rerender(<FailureEvidence client={client} entry={failed()} />);
    expect(captureStill).toHaveBeenCalledTimes(1);
    view.rerender(<FailureEvidence client={client} entry={entry} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:failure');
    view.rerender(<FailureEvidence client={client} entry={failed()} />);
    await waitFor(() => {
      expect(captureStill).toHaveBeenCalledTimes(2);
    });
  });

  it.each(['stale', 'disconnected', 'warning', 'info'] as const)(
    'should not capture for %s observations',
    async (condition) => {
      const machine = failed();
      render(
        <FailureEvidence
          client={client}
          entry={{
            ...machine,
            freshness: condition === 'stale' ? 'stale' : machine.freshness,
            snapshot: {
              ...machine.snapshot,
              connection: condition === 'disconnected' ? 'disconnected' : 'connected',
              alerts:
                condition === 'warning' || condition === 'info'
                  ? [{ code: 'notice', message: 'Notice', severity: condition }]
                  : machine.snapshot.alerts,
            },
          }}
        />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      expect(captureStill).not.toHaveBeenCalled();
    },
  );

  it('should explain unavailable capture without retrying on every observation', async () => {
    captureStill.mockRejectedValue(new Error('BAMBU_CAMERA_UNAVAILABLE'));
    const view = render(<FailureEvidence client={client} entry={failed()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/camera/i);
    view.rerender(<FailureEvidence client={client} entry={failed()} />);
    expect(captureStill).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Capture still' })).toBeEnabled();
  });

  it('should preserve evidence across stale telemetry without capturing again on reconnect', async () => {
    const view = render(
      <StrictMode>
        <FailureEvidence client={client} entry={failed()} />
      </StrictMode>,
    );
    await screen.findByRole('img');
    view.rerender(
      <StrictMode>
        <FailureEvidence client={client} entry={{ ...failed(), freshness: 'stale' }} />
      </StrictMode>,
    );
    expect(screen.getByRole('img')).toBeVisible();
    view.rerender(
      <StrictMode>
        <FailureEvidence client={client} entry={failed()} />
      </StrictMode>,
    );
    expect(captureStill).toHaveBeenCalledOnce();
  });

  it('should keep the first failure still when a printing run becomes terminal', async () => {
    const machine = failed();
    const view = render(
      <FailureEvidence
        client={client}
        entry={{ ...machine, snapshot: { ...machine.snapshot, activeRunId: 'run-1', run: { state: 'printing' } } }}
      />,
    );
    await screen.findByRole('img');
    view.rerender(
      <FailureEvidence
        client={client}
        entry={{ ...machine, snapshot: { ...machine.snapshot, run: { state: 'failed' } } }}
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:failure');
    expect(captureStill).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('should explain unsupported cameras and capture a failed run without an alert code', async () => {
    const machine = failed();
    const view = render(
      <FailureEvidence client={client} entry={{ ...machine, descriptor: { ...machine.descriptor, operations: [] } }} />,
    );
    expect(screen.getByText('Still capture is unavailable for this printer.')).toBeVisible();
    expect(captureStill).not.toHaveBeenCalled();
    view.rerender(
      <FailureEvidence
        client={client}
        entry={{ ...entry, snapshot: { ...entry.snapshot, run: { state: 'failed' } } }}
      />,
    );
    await screen.findByRole('img');
    expect(screen.getByText('Camera at failure · Print failed')).toBeVisible();
  });

  it('should remove expired image bytes and offer a fresh capture', async () => {
    vi.useFakeTimers();
    try {
      captureStill.mockResolvedValue({
        bytes: new Uint8Array([1]),
        mediaType: 'image/jpeg',
        capturedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15_000).toISOString(),
      });
      render(<FailureEvidence client={client} entry={failed()} />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByRole('img')).toBeVisible();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('The failure still expired.');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:failure');
      expect(captureStill).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should abort a pending capture when the machine is removed', async () => {
    const pending = Promise.withResolvers<Awaited<ReturnType<MachineClient['captureStill']>>>();
    captureStill.mockReturnValue(pending.promise);
    const view = render(<FailureEvidence client={client} entry={failed()} />);
    await waitFor(() => {
      expect(captureStill).toHaveBeenCalledOnce();
    });
    const { signal } = captureStill.mock.calls[0]![0];
    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      pending.resolve({
        bytes: new Uint8Array(),
        mediaType: 'image/jpeg',
        capturedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      });
    });
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
