// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type {
  MachineBindingOutcome,
  MachineCandidate,
  MachineClient,
  MachineDirectoryEntry,
  MachineDirectorySnapshot,
  MachineProvider,
} from '@taucad/runtime/machine';

const state = vi.hoisted(() => ({
  project: undefined as unknown,
  completeBinding: vi.fn(
    async (_input: unknown): Promise<MachineBindingOutcome> => ({ status: 'bound', machineId: 'bambu:sim' }),
  ),
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => state.project }));
vi.mock('#filesystem/desktop-bridge.js', () => ({
  desktopBridge: () => ({ machines: { completeBinding: state.completeBinding } }),
}));

const { MachinesSettings } = await import('./machines-settings.js');

/** The smallest actor `useSelector` reads: a snapshot whose kernel client carries the facet. */
const projectWith = (machines: unknown) => ({
  mainEntryPath: 'main.ts',
  geometryUnits: new Map([
    [
      'main.ts',
      {
        subscribe: () => ({ unsubscribe: () => undefined }),
        getSnapshot: () => ({ context: { kernelClient: { machines } } }),
      },
    ],
  ]),
});

const candidate: MachineCandidate = {
  id: 'bambu:simulated-x1c',
  name: 'simulated-x1c',
  endpoint: { address: 'simulator', interface: 'lo' },
  claimedIdentity: {},
  observedAt: '2026-09-24T00:00:00.000Z',
  expiresAt: '2026-09-24T00:01:00.000Z',
};

const simulatedEntry = mock<MachineDirectoryEntry>({
  machineId: 'bambu:sim',
  providerId: 'bambu-simulator',
  freshness: 'current',
  descriptor: { name: 'simulated-x1c', vendor: 'Bambu Lab', model: 'X1C' },
});

/** A facet whose directory holds `entries` and whose ceremonies wait on the operator. */
const facetWith = (entries: readonly MachineDirectoryEntry[]) => {
  const client = mock<MachineClient>();
  client.list.mockResolvedValue(mock<MachineDirectorySnapshot>({ entries }));
  client.listProviders.mockResolvedValue([
    mock<MachineProvider>({ id: 'bambu' }),
    mock<MachineProvider>({ id: 'bambu-simulator' }),
  ]);
  // oxlint-disable-next-line require-yield -- a watch that only ends on abort yields nothing.
  client.watch.mockImplementation(async function* ({ signal }) {
    await new Promise<void>((resolve) => {
      signal?.addEventListener(
        'abort',
        () => {
          resolve();
        },
        { once: true },
      );
    });
  });
  client.discover.mockImplementation(async function* () {
    yield { type: 'found', candidate };
  });
  client.beginBinding.mockResolvedValue({ status: 'operator-action-required', ceremonyId: 'ceremony-1' });
  return Object.assign(client, { available: true });
};

afterEach(() => {
  state.project = undefined;
  state.completeBinding.mockClear();
});

describe('MachinesSettings', () => {
  it('should add the simulated X1C through discovery, binding and the native ceremony without a code', async () => {
    const facet = facetWith([]);
    state.project = projectWith(facet);
    render(<MachinesSettings />);
    expect(screen.getByText('No machines are bound to this project yet.')).toBeInTheDocument();
    const add = screen.getByRole('button', { name: 'Add simulated X1C' });
    await waitFor(() => {
      expect(add).toBeEnabled();
    });

    fireEvent.click(add);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Simulated X1C is bound as bambu:sim.');
    });
    expect(facet.discover).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ providerId: 'bambu-simulator', configuration: { logicalId: 'simulated-x1c' } }),
    );
    expect(facet.beginBinding).toHaveBeenCalledExactlyOnceWith({ candidate, name: 'simulated-x1c' });
    /* No address, no secret: the simulator's ceremony carries the id alone. */
    expect(state.completeBinding).toHaveBeenCalledExactlyOnceWith({ ceremonyId: 'ceremony-1' });
    /* The directory is re-read after the ceremony so the new entry shows. */
    expect(facet.list).toHaveBeenCalledTimes(2);
  });

  it('should bind an X1C from the form and hand the access code to the shell, never keeping it', async () => {
    const facet = facetWith([]);
    state.project = projectWith(facet);
    render(<MachinesSettings />);
    const bind = screen.getByRole('button', { name: 'Bind' });
    await waitFor(() => {
      expect(bind).toBeEnabled();
    });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'shop-x1c' } });
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: '10.0.0.5' } });
    const accessCode = screen.getByLabelText('Access code');
    fireEvent.change(accessCode, { target: { value: '12345678' } });

    fireEvent.submit(screen.getByRole('form', { name: 'Bind a Bambu Lab X1C' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('shop-x1c is bound as bambu:sim.');
    });
    expect(facet.discover).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ providerId: 'bambu', configuration: { logicalId: 'shop-x1c', address: '10.0.0.5' } }),
    );
    expect(state.completeBinding).toHaveBeenCalledExactlyOnceWith({
      ceremonyId: 'ceremony-1',
      address: '10.0.0.5',
      accessCode: '12345678',
    });
    expect(accessCode).toHaveValue('');
  });

  it('should list bound machines, marking the simulator, and explain a missing project or facet', async () => {
    state.project = projectWith(facetWith([simulatedEntry]));
    const { unmount } = render(<MachinesSettings />);
    const list = await screen.findByRole('list', { name: 'Bound machines' });
    expect(list).toHaveTextContent('simulated-x1c');
    expect(list).toHaveTextContent('Bambu Lab X1C · Simulated');
    expect(screen.getByText('Removing a machine is not available yet.')).toBeInTheDocument();
    unmount();

    state.project = projectWith({ available: false, reason: 'unsupported' });
    const unavailable = render(<MachinesSettings />);
    expect(screen.getByText('Machines are unavailable in this runtime (unsupported).')).toBeInTheDocument();
    unavailable.unmount();

    state.project = undefined;
    render(<MachinesSettings />);
    expect(screen.getByText('Open a project to manage the machines it prints to.')).toBeInTheDocument();
  });
});
