// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type {
  MachineBindingOutcome,
  MachineCandidate,
  MachineClient,
  MachineDirectoryEntry,
  MachineDirectorySnapshot,
} from '@taucad/runtime/machine';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import {
  boundEntry,
  simulatedEntry,
  simulatorProvider,
  x1cProvider,
} from '#components/settings/machine-details.fixture.js';

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

/** A facet whose directory holds `entries`, whose host offers both Bambu providers, and whose ceremonies wait on the operator. */
const facetWith = (entries: readonly MachineDirectoryEntry[]) => {
  const client = mock<MachineClient>();
  const snapshot: MachineDirectorySnapshot = {
    cursor: {
      hostId: 'host',
      authorityId: 'authority',
      workspaceId: 'workspace',
      generation: 'g1',
      position: 0,
      revision: 0,
    },
    entries,
  };
  client.list.mockResolvedValue(snapshot);
  client.listProviders.mockResolvedValue([x1cProvider, simulatorProvider]);
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

const renderSettings = (): ReturnType<typeof render> =>
  render(
    <TooltipProvider>
      <MachinesSettings />
    </TooltipProvider>,
  );

afterEach(() => {
  state.project = undefined;
  state.completeBinding.mockClear();
});

describe('MachinesSettings', () => {
  it('should add the simulated X1C through discovery, binding and the native ceremony without a code', async () => {
    const facet = facetWith([]);
    state.project = projectWith(facet);
    renderSettings();
    expect(screen.getByText('No machines are bound to this project yet.')).toBeInTheDocument();
    const add = screen.getByRole('button', { name: 'Add simulated X1C' });
    await waitFor(() => {
      expect(add).toBeEnabled();
    });
    /* Left at its declared real-time default, the demo speed is not sent. */
    expect(await screen.findByRole('textbox', { name: 'Input for Demo Speed' })).toHaveValue('1');

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

  it("should offer the simulator's demo speed from its binding declaration and bind with the chosen speed", async () => {
    const facet = facetWith([]);
    state.project = projectWith(facet);
    renderSettings();
    const simulator = screen.getByRole('region', { name: 'Simulated X1C' });
    expect(simulator).toHaveTextContent('Its settings only change the simulation; they are not printer settings.');
    const speed = await within(simulator).findByRole('textbox', { name: 'Input for Demo Speed' });
    expect(speed).toHaveValue('1');
    expect(within(simulator).getByLabelText('Parameter: Demo Speed')).toHaveTextContent('Demo Speed');
    expect(
      within(simulator).getByText('Simulated seconds per real second, so a long print can be watched in minutes'),
    ).toBeInTheDocument();
    /* The host names the machine itself, so the declared logical id is not offered. */
    expect(within(simulator).queryByRole('textbox', { name: 'Input for Logical Id' })).not.toBeInTheDocument();
    expect(within(simulator).queryByRole('button', { name: /^Reset/u })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.clear(speed);
    await user.type(speed, '60');
    await user.keyboard('{Enter}');
    const add = within(simulator).getByRole('button', { name: 'Add simulated X1C' });
    await waitFor(() => {
      expect(add).toBeEnabled();
    });
    await user.click(add);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Simulated X1C is bound as bambu:sim.');
    });
    expect(facet.discover).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        providerId: 'bambu-simulator',
        configuration: { speed: 60, logicalId: 'simulated-x1c' },
      }),
    );
  });

  it('should bind an X1C from the form and hand the access code to the shell, never keeping it', async () => {
    const facet = facetWith([]);
    state.project = projectWith(facet);
    renderSettings();
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

  it('should list bound machines as one line each, marking the simulator, and explain a missing project or facet', async () => {
    state.project = projectWith(facetWith([simulatedEntry]));
    const { unmount } = renderSettings();
    const list = await screen.findByRole('list', { name: 'Bound machines' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    /* The desktop dry-run spec reads exactly this line. */
    expect(rows[0]?.textContent).toMatch(/^Simulated X1C\s*Bambu Lab X1C · Simulated$/u);
    expect(screen.getByText('Removing a machine is not available yet.')).toBeInTheDocument();
    unmount();

    state.project = projectWith({ available: false, reason: 'unsupported' });
    const unavailable = renderSettings();
    expect(screen.getByText('Machines are unavailable in this runtime (unsupported).')).toBeInTheDocument();
    unavailable.unmount();

    state.project = undefined;
    renderSettings();
    expect(screen.getByText('Open a project to manage the machines it prints to.')).toBeInTheDocument();
  });

  it('should open a bound machine onto its provider manifest and fold it away again', async () => {
    state.project = projectWith(facetWith([simulatedEntry]));
    renderSettings();
    const row = await screen.findByRole('button', { name: 'Simulated X1C Bambu Lab X1C · Simulated' });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /^Identity and firmware/u })).not.toBeInTheDocument();

    fireEvent.click(row);

    expect(row).toHaveAttribute('aria-expanded', 'true');
    const identity = screen.getByRole('button', { name: 'Identity and firmware Firmware simulator-1' });
    fireEvent.click(identity);
    expect(screen.getByText('Simulated, no printer attached')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Actions 6 qualified · 8 designed · 2 unsupported' }),
    ).toBeInTheDocument();

    fireEvent.click(row);

    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /^Identity and firmware/u })).not.toBeInTheDocument();
  });

  it('should explain a bound machine whose provider the host no longer offers', async () => {
    const orphan = boundEntry({
      machineId: 'old-printer',
      providerId: 'retired-provider',
      name: 'Old printer',
      firmware: '1.0',
    });
    state.project = projectWith(facetWith([orphan]));
    renderSettings();

    fireEvent.click(await screen.findByRole('button', { name: 'Old printer Bambu Lab X1C' }));

    expect(
      screen.getByText('This host no longer offers the retired-provider provider, so its manifest cannot be shown.'),
    ).toBeInTheDocument();
  });
});
