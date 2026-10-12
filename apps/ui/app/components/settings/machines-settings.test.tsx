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
import { bambuA1MiniMachine } from '@taucad/bambu';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import {
  boundEntry,
  simulatedEntry,
  simulatorProvider,
  workshopEntry,
  x1cProvider,
} from '#components/settings/machine-details.fixture.js';
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
  endpoint: { address: 'simulator', interface: 'lo' },
  claimedIdentity: {},
  observedAt: '2026-09-24T00:00:00.000Z',
  expiresAt: '2026-09-24T00:01:00.000Z',
};

/** A printer heard on the LAN whose access code the host already holds. */
const savedCandidate: MachineCandidate = {
  ...candidate,
  id: 'bambu:00M1',
  name: 'Workshop X1C',
  endpoint: { address: '192.168.0.112', interface: 'udp4' },
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
    <TooltipProvider>
      <MachinesSettings />
    </TooltipProvider>,
  );

const bindingField = (name: string): HTMLElement =>
  screen.getByRole('textbox', { name: new RegExp(`^Input for ${name.split(' ')[0]}`, 'u') });

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
    expect(await screen.findByText('No printers yet.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Printers set up here are available in every project on this computer. Their access codes are kept in your Keychain.',
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
      expect.objectContaining({ providerId: 'bambu-simulator', configuration: { logicalId: 'Simulated X1C' } }),
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

  it("should offer the simulator's demo speed from its binding declaration and bind with the chosen speed", async () => {
    const facet = facetWith([]);
    state.facet = facet;
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Simulated X1C' }));
    const simulator = screen.getByRole('region', { name: 'Simulated X1C' });
    expect(simulator).toHaveTextContent('Its settings only change the simulation; they are not printer settings.');
    const speed = await within(simulator).findByRole('spinbutton', { name: 'Input for Demo Speed' });
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
        configuration: { speed: 60, logicalId: 'Simulated X1C' },
      }),
    );
  });

  it('should bind an X1C from the form and hand the access code to the shell, never keeping it', async () => {
    const facet = facetWith([]);
    state.facet = facet;
    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Enter address' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enter address' }));
    const bind = screen.getByRole('button', { name: 'Bind' });
    await waitFor(() => {
      expect(bind).toBeEnabled();
    });
    await screen.findByRole('textbox', { name: 'Input for Name' });
    fireEvent.change(bindingField('Name'), { target: { value: 'shop-x1c' } });
    fireEvent.change(bindingField('Address'), { target: { value: '10.0.0.5' } });
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

  it('should find printers on the network and fill the form from the one picked, leaving the access code', async () => {
    const facet = facetWith([]);
    const heard = (serial: string, name: string, address: string): MachineCandidate => ({
      ...candidate,
      id: `bambu:${serial}`,
      name,
      endpoint: { address, interface: 'udp4' },
      claimedIdentity: { model: 'X1C', serial },
    });
    facet.discover.mockImplementation(async function* () {
      yield { type: 'found', candidate: heard('00M1', 'Workshop X1C', '192.168.0.112') };
      yield { type: 'found', candidate: heard('00M2', 'Office X1C', '192.168.0.113') };
      yield { type: 'updated', candidate: heard('00M1', 'Workshop X1C', '192.168.0.112') };
    });
    state.facet = facet;
    renderSettings();
    const find = screen.getByRole('button', { name: 'Find on network' });
    await waitFor(() => {
      expect(find).toBeEnabled();
    });

    fireEvent.click(find);

    const office = await screen.findByRole('button', { name: 'Office X1C X1C · 192.168.0.113' });
    expect(screen.getAllByRole('button', { name: /X1C · 192\.168/u })).toHaveLength(2);
    /* Broadcast discovery: no address, nothing sent to a printer. */
    expect(facet.discover).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ providerId: 'bambu', configuration: { logicalId: 'discovery' } }),
    );

    fireEvent.click(office);

    await screen.findByRole('textbox', { name: 'Input for Name' });

    expect(bindingField('Name')).toHaveValue('Office X1C');
    expect(bindingField('Address')).toHaveValue('192.168.0.113');
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
          endpoint: { address: '192.168.0.112', interface: 'udp4' },
          claimedIdentity: { model: 'X1C', serial: '00M1' },
        },
      };
      await passEnds;
    });
    state.facet = facet;
    renderSettings();
    const find = screen.getByRole('button', { name: 'Find on network' });
    await waitFor(() => {
      expect(find).toBeEnabled();
    });

    fireEvent.click(find);

    fireEvent.click(await screen.findByRole('button', { name: 'Workshop X1C X1C · 192.168.0.112' }));
    await waitFor(() => {
      expect(bindingField('Address')).toHaveValue('192.168.0.112');
    });
    expect(bindingField('Name')).toHaveValue('Workshop X1C');
    expect(screen.getByRole('status')).toHaveTextContent('Listening for more printers…');
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
    facet.listProviders.mockResolvedValue([x1cProvider, bambuA1MiniMachine(), simulatorProvider]);
    const mini: MachineCandidate = {
      ...savedCandidate,
      id: 'bambu-a1-mini:0300EA652800550',
      name: 'Mini',
      endpoint: { address: '192.0.2.145', interface: 'udp4' },
      claimedIdentity: { model: 'A1 mini', serial: '0300EA652800550' },
      credential: undefined,
    };
    facet.discover.mockImplementation(async function* ({ providerId }) {
      yield { type: 'found', candidate: providerId === 'bambu-a1-mini' ? mini : savedCandidate };
    });
    state.facet = facet;
    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Find on network' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find on network' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mini A1 mini · 192.0.2.145' }));
    expect(screen.getByRole('combobox', { name: 'Printer model' })).toHaveValue('bambu-a1-mini');
    await screen.findByRole('textbox', { name: 'Input for Name' });
    expect(document.querySelector('form form')).toBeNull();
    fireEvent.change(bindingField('Name'), { target: { value: 'My Mini' } });
    const accessCode = screen.getByLabelText('Access code');
    fireEvent.change(accessCode, { target: { value: '12345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find on network' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Find on network' })).toBeEnabled();
    });
    expect(bindingField('Name')).toHaveValue('My Mini');
    expect(accessCode).toHaveValue('12345678');
    fireEvent.submit(screen.getByRole('form', { name: 'Connect a Bambu Lab printer' }));
    await waitFor(() => {
      expect(facet.beginBinding).toHaveBeenCalledWith({ candidate: mini, name: 'My Mini' });
    });
    expect(facet.discover).toHaveBeenLastCalledWith(
      expect.objectContaining({
        providerId: 'bambu-a1-mini',
        configuration: { logicalId: 'My Mini', address: '192.0.2.145', serial: '0300EA652800550' },
      }),
    );
    expect(accessCode).toHaveValue('');
  });

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
    state.facet = facetWith([orphan]);
    renderSettings();

    fireEvent.click(await screen.findByRole('button', { name: 'Old printer Bambu Lab X1C' }));

    expect(
      screen.getByText('This host no longer offers the retired-provider provider, so its manifest cannot be shown.'),
    ).toBeInTheDocument();
  });

  it('should say another Tau app holds the printers when the machine store is owned elsewhere', async () => {
    const client = facetWith([]);
    client.list.mockRejectedValue(new Error('MACHINE_STORE_OWNED_ELSEWHERE'));
    state.facet = createMachinesFacet({
      dial: async () => new MessageChannel().port1,
      connect: async () => Object.assign(client, { ready: Promise.resolve(), close: () => undefined }),
    });

    renderSettings();

    expect(await screen.findByRole('alert')).toHaveTextContent(printersInUseElsewhere);
    // The list is unknown, not empty.
    expect(screen.queryByText('No printers yet.')).not.toBeInTheDocument();
  });

  describe('saved access codes', () => {
    /** Render with every discovery answering `heard`, then find it on the network. */
    const findSaved = async (heard: MachineCandidate = savedCandidate) => {
      const facet = facetWith([]);
      facet.discover.mockImplementation(async function* () {
        yield { type: 'found', candidate: heard };
      });
      state.facet = facet;
      renderSettings();
      const find = screen.getByRole('button', { name: 'Find on network' });
      await waitFor(() => {
        expect(find).toBeEnabled();
      });
      fireEvent.click(find);
      await waitFor(() => {
        expect(find).toBeEnabled();
      });
      fireEvent.click(
        await screen.findByRole('button', {
          name: `${heard.name} ${heard.claimedIdentity.model} · ${heard.endpoint.address}`,
        }),
      );
      await screen.findByRole('textbox', { name: 'Input for Name' });
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
      expect(state.completeBinding).toHaveBeenCalledExactlyOnceWith({
        ceremonyId: 'ceremony-1',
        address: '192.168.0.112',
      });
    });

    it('should ask for the code before any ceremony when none is typed and none is saved', async () => {
      const facet = facetWith([]);
      state.facet = facet;
      renderSettings();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Enter address' })).toBeEnabled();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Enter address' }));
      const bind = screen.getByRole('button', { name: 'Bind' });
      await waitFor(() => {
        expect(bind).toBeEnabled();
      });
      expect(screen.getByLabelText('Access code')).not.toBeRequired();
      await screen.findByRole('textbox', { name: 'Input for Name' });
      fireEvent.change(bindingField('Name'), { target: { value: 'shop-x1c' } });
      fireEvent.change(bindingField('Address'), { target: { value: '10.0.0.5' } });

      submit();

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('Enter the access code shown on the printer.');
      });
      expect(facet.discover).toHaveBeenCalledOnce();
      expect(facet.beginBinding).not.toHaveBeenCalled();
      expect(state.completeBinding).not.toHaveBeenCalled();
      /* Only the code is cleared, so the retry needs nothing but the code. */
      expect(bindingField('Name')).toHaveValue('shop-x1c');
      expect(bindingField('Address')).toHaveValue('10.0.0.5');
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
        address: '192.168.0.112',
        accessCode: '87654321',
      });
      expect(accessCode).toHaveValue('');
    });

    it("should explain a changed certificate from the shell's refusal and ask for the code again", async () => {
      state.completeBinding.mockRejectedValueOnce(
        new Error(
          "Error invoking remote method 'tau:machines:complete-binding': Error: MACHINE_CREDENTIAL_TRUST_CHANGED",
        ),
      );
      await findSaved();

      submit();

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent(
          "The printer's certificate changed since the code was saved. Enter the access code to bind it again.",
        );
      });
      expect(screen.getByLabelText('Access code')).toHaveAttribute('type', 'password');
      expect(screen.queryByText('Saved in your Keychain')).not.toBeInTheDocument();
      expect(bindingField('Name')).toHaveValue('Workshop X1C');
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
        'Tau stops watching it and forgets its saved access code. A print in progress keeps running on the printer.',
      );
      expect(within(confirmation).getByRole('button', { name: 'Cancel' })).toHaveFocus();
      expect(facet.removeBinding).not.toHaveBeenCalled();

      fireEvent.click(within(confirmation).getByRole('button', { name: 'Remove' }));

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('Workshop X1C is removed.');
      });
      expect(facet.removeBinding).toHaveBeenCalledExactlyOnceWith({ machineId: 'workshop-x1c' });
      /* The list follows the host's directory. */
      expect(await screen.findByText('No printers yet.')).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Bound machines' })).not.toBeInTheDocument();
    });

    it('should keep a printer with pending requests and say what to resolve first', async () => {
      const { facet, remove } = await renderWith([workshopEntry]);
      facet.removeBinding.mockRejectedValue(new Error('MACHINE_BINDING_BUSY'));
      facet.list.mockResolvedValue(snapshotOf([workshopEntry]));
      fireEvent.click(remove);
      const confirmation = screen.getByRole('alertdialog', { name: 'Remove Workshop X1C?' });

      fireEvent.click(within(confirmation).getByRole('button', { name: 'Remove' }));

      expect(await within(confirmation).findByRole('alert')).toHaveTextContent(
        "Resolve this printer's pending print requests first.",
      );
      expect(within(confirmation).getByRole('button', { name: 'Remove' })).toBeEnabled();
      expect(screen.getByRole('list', { name: 'Bound machines' })).toBeInTheDocument();

      fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(remove).toHaveFocus();
    });

    it('should quietly re-read the list when the printer is already gone', async () => {
      const { facet, remove } = await renderWith([workshopEntry]);
      facet.removeBinding.mockRejectedValue(new Error('MACHINE_DIRECTORY_UNKNOWN_MACHINE'));
      fireEvent.click(remove);

      fireEvent.click(
        within(screen.getByRole('alertdialog', { name: 'Remove Workshop X1C?' })).getByRole('button', {
          name: 'Remove',
        }),
      );

      expect(await screen.findByText('No printers yet.')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('');
    });
  });
});
