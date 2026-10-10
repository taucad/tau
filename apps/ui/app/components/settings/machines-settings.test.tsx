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
  grblProvider,
  miniProvider,
  simulatedEntry,
  simulatorProvider,
  workshopEntry,
  x1cProvider,
} from '#components/settings/machine-details.fixture.js';
import { KeyboardProvider } from '#hooks/use-keyboard.js';
import { createMachinesFacet, printersInUseElsewhere } from '#hooks/use-machines.js';
import type * as UseMachines from '#hooks/use-machines.js';

const state = vi.hoisted(() => ({
  facet: undefined as unknown,
  completeBinding: vi.fn(
    async (_input: unknown): Promise<MachineBindingOutcome> => ({ status: 'bound', machineId: 'bambu:sim' }),
  ),
}));
/* This computer's facet, with no project anywhere: printers are set up from Home as well. */
vi.mock('#hooks/use-machines.js', async (importOriginal) => ({
  ...(await importOriginal<typeof UseMachines>()),
  useMachinesFacet: () => state.facet ?? { available: false, reason: 'unsupported' },
}));
vi.mock('#filesystem/desktop-bridge.js', () => ({
  desktopBridge: () => ({ machines: { completeBinding: state.completeBinding } }),
}));

const { MachinesSettings } = await import('./machines-settings.js');

const candidate: MachineCandidate = {
  id: 'bambu:simulated-x1c',
  name: 'simulated-x1c',
  endpoint: { transport: 'network', address: 'simulator', interface: 'lo' },
  claimedIdentity: {},
  observedAt: '2026-09-24T00:00:00.000Z',
  expiresAt: '2026-09-24T00:01:00.000Z',
};

/** A printer heard on the LAN whose access code the host already holds. */
const savedCandidate: MachineCandidate = {
  ...candidate,
  id: 'bambu:00M1',
  name: 'Workshop X1C',
  endpoint: { transport: 'network', address: '192.168.0.112', interface: 'udp4' },
  claimedIdentity: { model: 'X1C', serial: '00M1' },
  credential: 'saved',
};

const snapshotOf = (entries: readonly MachineDirectoryEntry[]): MachineDirectorySnapshot => ({
  cursor: {
    hostId: 'host',
    authorityId: 'authority',
    generation: 'g1',
    position: 0,
    revision: 0,
  },
  entries,
});

/** A facet whose directory holds `entries`, whose host offers both Bambu providers, and whose ceremonies wait on the operator. */
const facetWith = (entries: readonly MachineDirectoryEntry[]) => {
  const client = mock<MachineClient>();
  client.list.mockResolvedValue(snapshotOf(entries));
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
    <KeyboardProvider>
      <TooltipProvider>
        <MachinesSettings />
      </TooltipProvider>
    </KeyboardProvider>,
  );

/** The name the person gives the machine: the card's own field, which travels in `beginBinding`. */
const nameField = (): HTMLElement => screen.getByRole('textbox', { name: 'Name' });

/** Where the machine is: the card's own field, not one of the provider's binding fields. */
const addressField = (): HTMLElement => screen.getByRole('textbox', { name: 'Address' });

afterEach(() => {
  state.facet = undefined;
  state.completeBinding.mockClear();
});

describe('MachinesSettings', () => {
  it('should add the simulated X1C with no project open, through discovery, binding and the native ceremony', async () => {
    const facet = facetWith([]);
    state.facet = facet;
    renderSettings();
    /* Printers belong to the computer, not the project that happens to be open. */
    expect(await screen.findByText('No machines yet.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Machines set up here are available in every project on this computer. Their access codes are kept in your Keychain.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Simulated X1C' }));
    const add = screen.getByRole('button', { name: 'Add simulated X1C' });
    await waitFor(() => {
      expect(add).toBeEnabled();
    });
    /* Left at its declared real-time default, the demo speed is not sent. */
    expect(await screen.findByRole('spinbutton', { name: 'Input for Demo Speed' })).toHaveValue('1');

    fireEvent.click(add);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Simulated X1C is bound as bambu:sim.');
    });
    expect(facet.discover).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ providerId: 'bambu-simulator', configuration: {} }),
    );
    /* The display name; the host slugs it to the id `simulated-x1c`. */
    expect(facet.beginBinding).toHaveBeenCalledExactlyOnceWith({ candidate, name: 'Simulated X1C' });
    /* No address, no secret: the simulator's ceremony carries the id alone. */
    expect(state.completeBinding).toHaveBeenCalledExactlyOnceWith({ ceremonyId: 'ceremony-1' });
    /* The directory is re-read after the ceremony so the new entry shows; the re-read follows the status update. */
    await waitFor(() => {
      expect(facet.list).toHaveBeenCalledTimes(2);
    });
  });

  it('should offer every simulator the host serves by its manifest, and none it does not', async () => {
    const facet = facetWith([]);
    facet.listProviders.mockResolvedValue([
      simulatorProvider,
      { ...simulatorProvider, id: 'grbl-simulator', name: 'Simulated LongMill' },
      { ...simulatorProvider, id: 'makera-carvera-simulator', name: 'Simulated Carvera' },
      /* Hardware-qualified whatever its id says: a model to connect, not a simulator. */
      { ...x1cProvider, id: 'bambu-simulator-bench', name: 'Bench X1C' },
    ]);
    state.facet = facet;
    renderSettings();
    expect(await screen.findByRole('button', { name: 'Simulated LongMill' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simulated Carvera' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simulated X1C' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Simulated A1 mini' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bench X1C' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enter details' }));
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('bambu-simulator-bench');
  });

  it("should offer the simulator's demo speed from its binding declaration and bind with the chosen speed", async () => {
    const facet = facetWith([]);
    state.facet = facet;
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Simulated X1C' }));
    const simulator = screen.getByRole('region', { name: 'Simulated X1C' });
    expect(simulator).toHaveTextContent('Its settings only change the simulation; they are not machine settings.');
    const speed = await within(simulator).findByRole('spinbutton', { name: 'Input for Demo Speed' });
    expect(speed).toHaveValue('1');
    expect(within(simulator).getByLabelText('Parameter: Demo Speed')).toHaveTextContent('Demo Speed');
    expect(
      within(simulator).getByText('Simulated seconds per real second, so a long print can be watched in minutes'),
    ).toBeInTheDocument();
    /* The machine's name travels in `beginBinding`; no binding field carries it (U3-18). */
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
        configuration: { speed: 60 },
      }),
    );
  });

  it('should bind an X1C from the form and hand the access code to the shell, never keeping it', async () => {
    const facet = facetWith([]);
    state.facet = facet;
    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Enter details' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enter details' }));
    const bind = screen.getByRole('button', { name: 'Bind' });
    await waitFor(() => {
      expect(bind).toBeEnabled();
    });
    await screen.findByRole('textbox', { name: 'Name' });
    fireEvent.change(nameField(), { target: { value: 'shop-x1c' } });
    fireEvent.change(addressField(), { target: { value: '10.0.0.5' } });
    const accessCode = screen.getByLabelText('Access code');
    fireEvent.change(accessCode, { target: { value: '12345678' } });
    /* Masked by default; the toggle reveals it for checking and masks it again. */
    expect(accessCode).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(accessCode).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(accessCode).toHaveAttribute('type', 'password');

    fireEvent.submit(screen.getByRole('form', { name: 'Connect a Bambu Lab printer' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('shop-x1c is bound as bambu:sim.');
    });
    /* Where it is travels as the contract's endpoint, by the provider's transport; the configuration holds only its own fields. */
    expect(facet.discover).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        providerId: 'bambu',
        configuration: {},
        endpoint: { transport: 'network', address: '10.0.0.5' },
      }),
    );
    /* The shell pins from the provider's own endpoint: only the ceremony and the code travel. */
    expect(state.completeBinding).toHaveBeenCalledExactlyOnceWith({ ceremonyId: 'ceremony-1', accessCode: '12345678' });
    expect(accessCode).toHaveValue('');
  });

  it('should find machines and fill the form from the one picked, leaving the access code', async () => {
    const facet = facetWith([]);
    const heard = (serial: string, name: string, address: string): MachineCandidate => ({
      ...candidate,
      id: `bambu:${serial}`,
      name,
      endpoint: { transport: 'network', address, interface: 'udp4' },
      claimedIdentity: { model: 'X1C', serial },
    });
    facet.discover.mockImplementation(async function* () {
      yield { type: 'found', candidate: heard('00M1', 'Workshop X1C', '192.168.0.112') };
      yield { type: 'found', candidate: heard('00M2', 'Office X1C', '192.168.0.113') };
      yield { type: 'updated', candidate: heard('00M1', 'Workshop X1C', '192.168.0.112') };
    });
    state.facet = facet;
    renderSettings();
    const find = screen.getByRole('button', { name: 'Find machines' });
    await waitFor(() => {
      expect(find).toBeEnabled();
    });

    fireEvent.click(find);

    const office = await screen.findByRole('button', { name: 'Office X1C X1 Carbon · 192.168.0.113' });
    expect(screen.getAllByRole('button', { name: /X1 Carbon · 192\.168/u })).toHaveLength(2);
    /* Broadcast discovery: no address, nothing sent to a printer. */
    expect(facet.discover).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ providerId: 'bambu', configuration: {} }),
    );
    expect(facet.discover.mock.calls[0]?.[0]).not.toHaveProperty('endpoint');

    fireEvent.click(office);

    await screen.findByRole('textbox', { name: 'Name' });

    expect(nameField()).toHaveValue('Office X1C');
    expect(addressField()).toHaveValue('192.168.0.113');
    fireEvent.click(screen.getByRole('button', { name: 'Printer details' }));
    expect(await screen.findByRole('textbox', { name: /^Input for Serial/u })).toHaveValue('00M2');
    expect(screen.getByLabelText('Access code')).toHaveFocus();
  });

  it('should let the operator choose the first printer while listening without overwriting edits', async () => {
    const facet = facetWith([]);
    const { promise: passEnds, resolve: endPass } = Promise.withResolvers<void>();
    facet.discover.mockImplementation(async function* () {
      yield {
        type: 'found',
        candidate: {
          ...candidate,
          id: 'bambu:00M1',
          name: 'Workshop X1C',
          endpoint: { transport: 'network', address: '192.168.0.112', interface: 'udp4' },
          claimedIdentity: { model: 'X1C', serial: '00M1' },
        },
      };
      await passEnds;
    });
    state.facet = facet;
    renderSettings();
    const find = screen.getByRole('button', { name: 'Find machines' });
    await waitFor(() => {
      expect(find).toBeEnabled();
    });

    fireEvent.click(find);

    fireEvent.click(await screen.findByRole('button', { name: 'Workshop X1C X1 Carbon · 192.168.0.112' }));
    await waitFor(() => {
      expect(addressField()).toHaveValue('192.168.0.112');
    });
    expect(nameField()).toHaveValue('Workshop X1C');
    expect(screen.getByRole('status')).toHaveTextContent('Listening for more machines…');
    expect(find).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bind' })).toBeEnabled();

    endPass();
    await waitFor(() => {
      expect(find).toBeEnabled();
    });
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('should bind Mini through its provider without a later scan replacing its identity or typed code', async () => {
    const facet = facetWith([]);
    facet.listProviders.mockResolvedValue([x1cProvider, miniProvider, simulatorProvider]);
    const mini: MachineCandidate = {
      ...savedCandidate,
      id: 'bambu-a1-mini:0300EA652800550',
      name: 'Mini',
      endpoint: { transport: 'network', address: '192.0.2.145', interface: 'udp4' },
      claimedIdentity: { model: 'A1 mini', serial: '0300EA652800550' },
      credential: undefined,
    };
    facet.discover.mockImplementation(async function* ({ providerId }) {
      yield { type: 'found', candidate: providerId === 'bambu-a1-mini' ? mini : savedCandidate };
    });
    state.facet = facet;
    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Find machines' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find machines' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mini A1 mini · 192.0.2.145' }));
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('bambu-a1-mini');
    await screen.findByRole('textbox', { name: 'Name' });
    expect(document.querySelector('form form')).toBeNull();
    fireEvent.change(nameField(), { target: { value: 'My Mini' } });
    const accessCode = screen.getByLabelText('Access code');
    fireEvent.change(accessCode, { target: { value: '12345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find machines' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Find machines' })).toBeEnabled();
    });
    expect(nameField()).toHaveValue('My Mini');
    expect(accessCode).toHaveValue('12345678');
    fireEvent.submit(screen.getByRole('form', { name: 'Connect a Bambu Lab printer' }));
    await waitFor(() => {
      expect(facet.beginBinding).toHaveBeenCalledWith({ candidate: mini, name: 'My Mini' });
    });
    expect(facet.discover).toHaveBeenLastCalledWith(
      expect.objectContaining({
        providerId: 'bambu-a1-mini',
        configuration: { serial: '0300EA652800550' },
        endpoint: { transport: 'network', address: '192.0.2.145' },
      }),
    );
    expect(accessCode).toHaveValue('');
  });

  /* The host says which providers it cannot serve (no serial driver yet, C2-6): named with its reason, never offered. */
  it("should say why the host can't serve a machine, and ask only the providers it can", async () => {
    const facet = facetWith([]);
    const reason = 'This Tau cannot reach serial ports yet, so it cannot find or connect a machine on one.';
    facet.listProviders.mockResolvedValue([
      x1cProvider,
      { ...grblProvider, unavailable: { reason } },
      simulatorProvider,
    ]);
    state.facet = facet;
    renderSettings();
    const find = screen.getByRole('button', { name: 'Find machines' });
    await waitFor(() => {
      expect(find).toBeEnabled();
    });

    expect(
      within(screen.getByRole('list', { name: 'Machines that cannot be added here' })).getByRole('listitem'),
    ).toHaveTextContent(`${grblProvider.manifest.identity.displayName} can't be added here. ${reason}`);
    fireEvent.click(find);

    await waitFor(() => {
      expect(facet.discover).toHaveBeenCalled();
    });
    expect(facet.discover.mock.calls.map(([input]) => input.providerId)).toEqual(['bambu']);
    fireEvent.click(screen.getByRole('button', { name: 'Enter details' }));
    const model = await screen.findByRole('combobox', { name: 'Model' });
    expect(
      within(model)
        .getAllByRole('option')
        .map((option) => option.getAttribute('value')),
    ).toEqual(['bambu']);
  });

  it("should say a provider's own refusal as an alert, without the shell's wrapping", async () => {
    state.completeBinding.mockRejectedValueOnce(
      new Error("Error invoking remote method 'tau:machines:complete-binding': Error: The printer refused the code."),
    );
    const facet = facetWith([]);
    state.facet = facet;
    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Enter details' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enter details' }));
    await screen.findByRole('textbox', { name: 'Name' });
    fireEvent.change(nameField(), { target: { value: 'shop-x1c' } });
    fireEvent.change(addressField(), { target: { value: '10.0.0.5' } });
    fireEvent.change(screen.getByLabelText('Access code'), { target: { value: '12345678' } });

    fireEvent.submit(screen.getByRole('form', { name: 'Connect a Bambu Lab printer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/^The printer refused the code\.$/u);
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('should ask for where the machine is before discovering anything', async () => {
    const facet = facetWith([]);
    state.facet = facet;
    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Enter details' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enter details' }));
    await screen.findByRole('textbox', { name: 'Name' });
    fireEvent.change(nameField(), { target: { value: 'shop-x1c' } });

    fireEvent.submit(screen.getByRole('form', { name: 'Connect a Bambu Lab printer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter an address.');
    expect(facet.discover).not.toHaveBeenCalled();
  });

  it('should send a serial machine its typed path as a serial endpoint when the host serves it', async () => {
    const facet = facetWith([]);
    facet.listProviders.mockResolvedValue([grblProvider]);
    facet.discover.mockImplementation(async function* () {
      yield { type: 'found', candidate: { ...candidate, endpoint: { transport: 'serial', path: '/dev/ttyUSB0' } } };
    });
    state.facet = facet;
    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Enter details' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enter details' }));
    await screen.findByRole('textbox', { name: 'Name' });
    fireEvent.change(nameField(), { target: { value: 'LongMill' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Serial port' }), { target: { value: '/dev/ttyUSB0' } });

    fireEvent.submit(screen.getByRole('form', { name: 'Connect a Sienci Labs machine' }));

    await waitFor(() => {
      expect(facet.discover).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          providerId: 'grbl',
          configuration: {},
          endpoint: { transport: 'serial', path: '/dev/ttyUSB0' },
        }),
      );
    });
  });

  it.each([
    { credential: 'secret', isAsked: true },
    { credential: undefined, isAsked: false },
  ] as const)(
    'asks for an access code by the declared credential, not identity: $credential',
    async ({ credential, isAsked }) => {
      const facet = facetWith([]);
      /* Grbl's identity is `claimed`: only the declared credential says binding takes a secret. */
      const { connection } = grblProvider.manifest;
      facet.listProviders.mockResolvedValue([
        { ...grblProvider, manifest: { ...grblProvider.manifest, connection: { ...connection, credential } } },
      ]);
      state.facet = facet;
      renderSettings();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Enter details' })).toBeEnabled();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Enter details' }));
      await screen.findByRole('textbox', { name: 'Name' });
      expect(screen.queryByLabelText('Access code') !== null).toBe(isAsked);
    },
  );

  it('should list bound machines as one line each, marking the simulator, and explain a missing facet', async () => {
    state.facet = facetWith([simulatedEntry]);
    const { unmount } = renderSettings();
    const list = await screen.findByRole('list', { name: 'Bound machines' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    /* The desktop dry-run spec reads exactly this line: Remove is an icon named for the printer, not row text. */
    expect(rows[0]?.textContent).toMatch(/^Simulated X1C\s*Bambu Lab X1C · Simulated$/u);
    expect(within(list).getByRole('button', { name: 'Remove Simulated X1C' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    unmount();

    state.facet = undefined;
    renderSettings();
    expect(screen.getByText('Machines are unavailable in this runtime (unsupported).')).toBeInTheDocument();
  });

  it('should open a bound machine onto its provider manifest and fold it away again', async () => {
    state.facet = facetWith([simulatedEntry]);
    renderSettings();
    const row = await screen.findByRole('button', { name: 'Simulated X1C Bambu Lab X1C · Simulated' });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /^Identity and firmware/u })).not.toBeInTheDocument();

    fireEvent.click(row);

    expect(row).toHaveAttribute('aria-expanded', 'true');
    const identity = screen.getByRole('button', { name: 'Identity and firmware Firmware simulator-1' });
    fireEvent.click(identity);
    expect(screen.getByText('Simulated, no machine attached')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Controls 3 qualified · 14 designed' })).toBeInTheDocument();

    fireEvent.click(row);

    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /^Identity and firmware/u })).not.toBeInTheDocument();
  });

  it('should let a person turn Testing on for one machine, showing it pending until the host answers', async () => {
    const facet = facetWith([workshopEntry]);
    let answer: (entry: MachineDirectoryEntry) => void = () => undefined;
    facet.setTesting.mockImplementation(
      async () =>
        new Promise<MachineDirectoryEntry>((resolve) => {
          answer = resolve;
        }),
    );
    state.facet = facet;
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Workshop X1C Bambu Lab X1C' }));
    const testing = screen.getByRole('switch', { name: 'Testing for Workshop X1C' });
    expect(testing).not.toBeChecked();
    expect(testing).toHaveAccessibleDescription(
      'Lets you try controls designed for this machine but not yet qualified on it, so they can be qualified. Agents never get them.',
    );

    fireEvent.click(testing);

    expect(facet.setTesting).toHaveBeenCalledExactlyOnceWith({
      machineId: 'workshop-x1c',
      enabled: true,
      requestedBy: { kind: 'user', id: 'operator', label: 'You' },
    });
    expect(testing).toBeChecked();
    expect(testing).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Saving' })).toHaveAttribute('aria-busy', 'true');

    answer({ ...workshopEntry, testing: true });

    await waitFor(() => {
      expect(testing).toBeEnabled();
    });
    expect(testing).toBeChecked();
    expect(screen.queryByLabelText('Saving')).not.toBeInTheDocument();
  });

  it('should reflect Testing as the directory reports it and say when the host refuses a change', async () => {
    const facet = facetWith([{ ...workshopEntry, testing: true }]);
    facet.setTesting.mockRejectedValue(new Error('The machine is printing.'));
    state.facet = facet;
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Workshop X1C Bambu Lab X1C' }));
    const testing = screen.getByRole('switch', { name: 'Testing for Workshop X1C' });
    expect(testing).toBeChecked();

    fireEvent.click(testing);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Testing could not be changed: The machine is printing.',
    );
    expect(testing).toBeChecked();
    expect(testing).toBeEnabled();
  });

  it('should explain a bound machine whose provider the host no longer offers', async () => {
    const orphan = boundEntry({
      machineId: 'old-printer',
      providerId: 'retired-provider',
      name: 'Old printer',
      firmware: '1.0',
    });
    state.facet = facetWith([orphan]);
    renderSettings();

    fireEvent.click(await screen.findByRole('button', { name: 'Old printer Bambu Lab X1C' }));

    expect(
      screen.getByText('This host no longer offers the retired-provider provider, so its manifest cannot be shown.'),
    ).toBeInTheDocument();
  });

  it('should say another Tau app holds the printers when the machine store is owned elsewhere', async () => {
    const client = facetWith([]);
    client.list.mockRejectedValue(
      Object.assign(new Error('MACHINE_STORE_OWNED_ELSEWHERE'), { code: 'MACHINE_STORE_OWNED_ELSEWHERE' }),
    );
    state.facet = createMachinesFacet({
      dial: async () => new MessageChannel().port1,
      connect: async () => Object.assign(client, { ready: Promise.resolve(), close: () => undefined }),
    });

    renderSettings();

    expect(await screen.findByRole('alert')).toHaveTextContent(printersInUseElsewhere);
    // The list is unknown, not empty.
    expect(screen.queryByText('No machines yet.')).not.toBeInTheDocument();
  });

  describe('saved access codes', () => {
    /** Render with every discovery answering `heard`, then find it on the network. */
    const findSaved = async () => {
      const heard = savedCandidate;
      const facet = facetWith([]);
      facet.discover.mockImplementation(async function* () {
        yield { type: 'found', candidate: heard };
      });
      state.facet = facet;
      renderSettings();
      const find = screen.getByRole('button', { name: 'Find machines' });
      await waitFor(() => {
        expect(find).toBeEnabled();
      });
      fireEvent.click(find);
      await waitFor(() => {
        expect(find).toBeEnabled();
      });
      fireEvent.click(
        await screen.findByRole('button', {
          name: `${heard.name} X1 Carbon · 192.168.0.112`,
        }),
      );
      await screen.findByRole('textbox', { name: 'Name' });
      return facet;
    };
    const submit = (): void => {
      fireEvent.submit(screen.getByRole('form', { name: 'Connect a Bambu Lab printer' }));
    };

    it('should bind a printer whose code is saved without asking for one', async () => {
      const facet = await findSaved();

      const code = screen.getByRole('group', { name: 'Access code' });
      expect(code).toHaveTextContent('Saved in your Keychain');
      /* The only thing named "Access code" is that line: no field asks for the code. */
      expect(screen.getByLabelText('Access code')).toBe(code);
      fireEvent.click(screen.getByRole('button', { name: 'Printer details' }));
      expect(await screen.findByRole('textbox', { name: /^Input for Serial/u })).toHaveValue('00M1');
      expect(screen.getByRole('button', { name: 'Bind' })).toBeEnabled();

      submit();

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('Workshop X1C is bound as bambu:sim.');
      });
      expect(facet.beginBinding).toHaveBeenCalledExactlyOnceWith({ candidate: savedCandidate, name: 'Workshop X1C' });
      /* No code leaves the page: the host reuses the one it saved. */
      expect(state.completeBinding).toHaveBeenCalledExactlyOnceWith({ ceremonyId: 'ceremony-1' });
    });

    it('should ask for the code before any ceremony when none is typed and none is saved', async () => {
      const facet = facetWith([]);
      state.facet = facet;
      renderSettings();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Enter details' })).toBeEnabled();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Enter details' }));
      const bind = screen.getByRole('button', { name: 'Bind' });
      await waitFor(() => {
        expect(bind).toBeEnabled();
      });
      expect(screen.getByLabelText('Access code')).not.toBeRequired();
      await screen.findByRole('textbox', { name: 'Name' });
      fireEvent.change(nameField(), { target: { value: 'shop-x1c' } });
      fireEvent.change(addressField(), { target: { value: '10.0.0.5' } });

      submit();

      expect(await screen.findByRole('alert')).toHaveTextContent('Enter the access code shown on the machine.');
      expect(screen.getByRole('status')).toHaveTextContent('');
      expect(facet.discover).toHaveBeenCalledOnce();
      expect(facet.beginBinding).not.toHaveBeenCalled();
      expect(state.completeBinding).not.toHaveBeenCalled();
      /* Only the code is cleared, so the retry needs nothing but the code. */
      expect(nameField()).toHaveValue('shop-x1c');
      expect(addressField()).toHaveValue('10.0.0.5');
    });

    it('should send a newly typed code over the saved one after "Use a different code"', async () => {
      await findSaved();

      fireEvent.click(screen.getByRole('button', { name: 'Use a different code' }));

      const accessCode = screen.getByLabelText('Access code');
      expect(accessCode).toHaveFocus();
      expect(screen.queryByText('Saved in your Keychain')).not.toBeInTheDocument();
      fireEvent.change(accessCode, { target: { value: '87654321' } });

      submit();

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('Workshop X1C is bound as bambu:sim.');
      });
      expect(state.completeBinding).toHaveBeenCalledExactlyOnceWith({
        ceremonyId: 'ceremony-1',
        accessCode: '87654321',
      });
      expect(accessCode).toHaveValue('');
    });

    it("should explain a changed certificate from the host's typed refusal and ask for the code again", async () => {
      // As the desktop bridge rejects a failed ceremony: the host's message, with its code on the error.
      state.completeBinding.mockRejectedValueOnce(
        Object.assign(new Error('The certificate changed.'), { code: 'MACHINE_CREDENTIAL_TRUST_CHANGED' }),
      );
      await findSaved();

      submit();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        "The machine's certificate changed since the code was saved. Enter the access code to bind it again.",
      );
      expect(screen.getByLabelText('Access code')).toHaveAttribute('type', 'password');
      expect(screen.queryByText('Saved in your Keychain')).not.toBeInTheDocument();
      expect(nameField()).toHaveValue('Workshop X1C');
    });
  });

  describe('removing a printer', () => {
    const renderWith = async (entries: readonly MachineDirectoryEntry[]) => {
      const facet = facetWith(entries);
      state.facet = facet;
      renderSettings();
      const remove = await screen.findByRole('button', { name: 'Remove Workshop X1C' });
      /* From here on the host lists nothing: the removal, or the earlier one, took the printer away. */
      facet.list.mockResolvedValue(snapshotOf([]));
      return { facet, remove };
    };

    it('should remove a printer only once the person confirms what removing does', async () => {
      const { facet, remove } = await renderWith([workshopEntry]);
      facet.removeBinding.mockResolvedValue({ status: 'removed', machineId: 'workshop-x1c' });

      fireEvent.click(remove);

      expect(remove).toHaveAttribute('aria-expanded', 'true');
      const confirmation = screen.getByRole('alertdialog', { name: 'Remove Workshop X1C?' });
      expect(confirmation).toHaveAccessibleDescription(
        'Tau stops watching it and forgets its saved access code. A job in progress keeps running on the printer.',
      );
      expect(within(confirmation).getByRole('button', { name: 'Cancel' })).toHaveFocus();
      expect(facet.removeBinding).not.toHaveBeenCalled();

      fireEvent.click(within(confirmation).getByRole('button', { name: 'Remove' }));

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('Workshop X1C is removed.');
      });
      expect(facet.removeBinding).toHaveBeenCalledExactlyOnceWith({ machineId: 'workshop-x1c' });
      /* The list follows the host's directory. */
      expect(await screen.findByText('No machines yet.')).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Bound machines' })).not.toBeInTheDocument();
    });

    it('should keep a printer with open jobs and say what to resolve first', async () => {
      const { facet, remove } = await renderWith([workshopEntry]);
      facet.removeBinding.mockRejectedValue(
        Object.assign(new Error('MACHINE_BINDING_BUSY'), { code: 'MACHINE_BINDING_BUSY' }),
      );
      facet.list.mockResolvedValue(snapshotOf([workshopEntry]));
      fireEvent.click(remove);
      const confirmation = screen.getByRole('alertdialog', { name: 'Remove Workshop X1C?' });

      fireEvent.click(within(confirmation).getByRole('button', { name: 'Remove' }));

      expect(await within(confirmation).findByRole('alert')).toHaveTextContent(
        "Resolve this machine's open jobs first.",
      );
      expect(within(confirmation).getByRole('button', { name: 'Remove' })).toBeEnabled();
      expect(screen.getByRole('list', { name: 'Bound machines' })).toBeInTheDocument();

      fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(remove).toHaveFocus();
    });

    it('should answer the question with Escape, leaving the settings dialog open', async () => {
      const { facet, remove } = await renderWith([workshopEntry]);
      fireEvent.click(remove);
      const confirmation = screen.getByRole('alertdialog', { name: 'Remove Workshop X1C?' });
      /* The settings dialog hears Escape on the document, in the capture phase. */
      const dialogEscape = vi.fn();
      document.addEventListener('keydown', dialogEscape, { capture: true });

      fireEvent.keyDown(within(confirmation).getByRole('button', { name: 'Cancel' }), { key: 'Escape' });

      document.removeEventListener('keydown', dialogEscape, { capture: true });
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(remove).toHaveFocus();
      expect(dialogEscape).not.toHaveBeenCalled();
      expect(facet.removeBinding).not.toHaveBeenCalled();
    });

    it('should quietly re-read the list when the printer is already gone', async () => {
      const { facet, remove } = await renderWith([workshopEntry]);
      facet.removeBinding.mockRejectedValue(
        Object.assign(new Error('MACHINE_DIRECTORY_UNKNOWN_MACHINE'), { code: 'MACHINE_DIRECTORY_UNKNOWN_MACHINE' }),
      );
      fireEvent.click(remove);

      fireEvent.click(
        within(screen.getByRole('alertdialog', { name: 'Remove Workshop X1C?' })).getByRole('button', {
          name: 'Remove',
        }),
      );

      expect(await screen.findByText('No machines yet.')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('');
    });
  });
});
