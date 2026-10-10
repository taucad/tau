import type { CompleteNodeMachineBindingInput, RemoveNodeMachineBindingInput } from '@taucad/runtime/host/node';
import type { MachineBindingOutcome, MachineBindingRemoval, MachineCandidate } from '@taucad/runtime/machine';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { completeMachineBinding } from '#machine-binding-ceremony.js';
import type { CompleteMachineBindingInput, MachineBindingCeremonyEvent } from '#machine-binding-ceremony.js';
import { createMachineSecretStore, defaultMachineProviders } from '#machine-host.js';
import type { probeCertificateTrust } from '#machine-host.js';
import { createMemorySecretVault } from '#secret-vault.js';
import type { SecretVault } from '#secret-vault.js';

type Pinned = Awaited<ReturnType<typeof probeCertificateTrust>>;

const pin = (fill: string): Pinned => ({ type: 'pinned', digest: `sha256:${fill.repeat(64)}` as Pinned['digest'] });

const printerCode = '12345678';
const serial = '00M00A391800004';
const reference = `vault:machine/bambu/${serial}`;

const candidateAt = (address: string, claimedSerial?: string): MachineCandidate => ({
  id: `bambu:${claimedSerial ?? address}`,
  name: 'Workshop X1C',
  endpoint: { transport: 'network', address, interface: 'en0' },
  claimedIdentity: claimedSerial === undefined ? { model: 'X1C' } : { serial: claimedSerial, model: 'X1C' },
  observedAt: '2026-09-26T00:00:00.000Z',
  expiresAt: '2026-09-26T00:00:30.000Z',
});

/* The TLS services a Bambu binding pins, as its manifests declare them: MQTT required, the camera best effort. */
const bambuCameraPorts = new Map([
  ['bambu', 322],
  ['bambu-a1-mini', 6000],
]);

/* The registrations every Tau host serves: what each provider declares drives the ceremony. A Bambu manifest that
 * does not declare its services yet is given the declaration above; one that does is used as it is. */
let providers: CompleteMachineBindingInput['providers'] = [];
beforeAll(async () => {
  const served = await defaultMachineProviders();
  providers = served.map((provider) => {
    const camera = bambuCameraPorts.get(provider.id);
    const { connection } = provider.manifest;
    return camera === undefined || connection.services !== undefined
      ? provider
      : {
          ...provider,
          manifest: {
            ...provider.manifest,
            connection: {
              ...connection,
              services: [
                { id: 'mqtt', port: 8883, required: true },
                { id: 'camera', port: camera, required: false },
              ],
            },
          },
        };
  });
});

/**
 * One pending ceremony on a host whose provider connects only with the
 * machine's own code, resolved through the store the way a provider resolves it.
 *
 * @param options - The provider and candidate, the vault behind the store, the printer's MQTT certificate and whether its camera answers.
 * @returns The completion and every seam it touches.
 */
const ceremony = (
  options: Readonly<{
    providerId?: string;
    candidate?: MachineCandidate;
    vault?: SecretVault;
    certificate?: Pinned;
    camera?: boolean;
    /** The providers the host serves; defaults to every default provider. */
    served?: CompleteMachineBindingInput['providers'];
  }> = {},
) => {
  const providerId = options.providerId ?? 'bambu';
  const candidate = options.candidate ?? candidateAt('192.168.0.112', serial);
  const secrets = createMachineSecretStore({ vault: options.vault ?? createMemorySecretVault() });
  const resolvedDuringConnect: string[] = [];
  const completeBinding = vi.fn(async (binding: CompleteNodeMachineBindingInput): Promise<MachineBindingOutcome> => {
    if (binding.secretRef !== 'none') {
      const code = await secrets.resolve(binding.secretRef);
      resolvedDuringConnect.push(code);
      if (code !== printerCode) {
        throw new Error('BAMBU_MQTT_TRANSPORT_FAILED');
      }
    }
    return { status: 'bound', machineId: 'workshop-x1c' };
  });
  const removeBinding = vi.fn(
    async ({ machineId }: RemoveNodeMachineBindingInput): Promise<MachineBindingRemoval> => ({
      status: 'removed',
      machineId,
    }),
  );
  const host: CompleteMachineBindingInput['host'] = {
    describeBinding: (ceremonyId) => (ceremonyId === 'ceremony-1' ? { providerId, candidate } : undefined),
    completeBinding,
    removeBinding,
  };
  const probe = vi.fn(async ({ port }: Readonly<{ address: string; port: number }>): Promise<Pinned> => {
    if (port !== 8883 && options.camera === false) {
      throw new Error('MACHINE_CERTIFICATE_PROBE_FAILED');
    }
    return port === 8883 ? (options.certificate ?? pin('a')) : pin('c');
  });
  const events: MachineBindingCeremonyEvent[] = [];
  const complete = async (input: Readonly<{ accessCode?: string; ceremonyId?: string }> = {}) =>
    completeMachineBinding({
      host,
      secrets,
      providers: options.served ?? providers,
      ceremonyId: input.ceremonyId ?? 'ceremony-1',
      ...(input.accessCode === undefined ? {} : { accessCode: input.accessCode }),
      probeCertificateTrust: probe,
      onEvent: (event) => {
        events.push(event);
      },
    });
  return { complete, completeBinding, events, probe, removeBinding, resolvedDuringConnect, secrets };
};

/** A vault whose every write fails the way a locked or missing keychain does. */
const unwritableVault = (): SecretVault => ({
  ...createMemorySecretVault(),
  write: async () => {
    throw new Error('SECRET_VAULT_UNAVAILABLE', { cause: { exitCode: 51 } });
  },
});

describe('completeMachineBinding', () => {
  it('should refuse a ceremony the host is not holding', async () => {
    const { complete, completeBinding, probe } = ceremony();

    /* Typed by the ceremony itself, so every caller reads `code`, not the message. */
    await expect(complete({ ceremonyId: 'gone', accessCode: printerCode })).rejects.toMatchObject({
      code: 'MACHINE_BINDING_UNKNOWN_CEREMONY',
      message: 'MACHINE_BINDING_UNKNOWN_CEREMONY',
    });
    expect(probe).not.toHaveBeenCalled();
    expect(completeBinding).not.toHaveBeenCalled();
  });

  it('should refuse a candidate with no network address when its provider pins network services', async () => {
    const { complete, completeBinding, probe } = ceremony({
      candidate: {
        ...candidateAt('192.168.0.112', serial),
        endpoint: { transport: 'serial', path: '/dev/tty.usbserial' },
      },
    });

    await expect(complete({ accessCode: printerCode })).rejects.toThrow('MACHINE_BINDING_ENDPOINT_INVALID');
    expect(probe).not.toHaveBeenCalled();
    expect(completeBinding).not.toHaveBeenCalled();
  });

  it('should refuse a ceremony whose provider the host does not serve', async () => {
    const { complete, completeBinding, probe } = ceremony({ providerId: 'klipper' });

    await expect(complete({ accessCode: printerCode })).rejects.toThrow('MACHINE_PROVIDER_UNAVAILABLE');
    expect(probe).not.toHaveBeenCalled();
    expect(completeBinding).not.toHaveBeenCalled();
  });

  /* What the provider declares decides, never the address: each of these sits at an ordinary LAN address or port. */
  it.each([
    ['a simulator', 'bambu-simulator', '192.168.0.112'],
    ['a Grbl controller on a serial port', 'grbl', '/dev/tty.usbmodem1101'],
    ['a Carvera, whose identity is only claimed', 'makera-carvera', '192.168.0.120'],
  ])('should bind %s without a code, a secret or a probe', async (_name, providerId, address) => {
    const bind = ceremony({ providerId, candidate: candidateAt(address, 'CLAIMED-1') });

    await expect(bind.complete({ accessCode: printerCode })).resolves.toEqual({
      status: 'bound',
      machineId: 'workshop-x1c',
    });
    expect(bind.completeBinding).toHaveBeenCalledWith({
      ceremonyId: 'ceremony-1',
      secretRef: 'none',
      serviceTrust: {},
    });
    expect(bind.probe).not.toHaveBeenCalled();
    /* A code typed for a machine that takes none is never kept. */
    await expect(bind.secrets.has(`vault:machine/${providerId}/CLAIMED-1`)).resolves.toBe(false);
    /* And none is asked for. */
    await expect(ceremony({ providerId }).complete()).resolves.toEqual({ status: 'bound', machineId: 'workshop-x1c' });
  });

  it('should take a code from a machine that declares a secret though its identity is only claimed', async () => {
    const served = providers.map((provider): CompleteMachineBindingInput['providers'][number] =>
      provider.id === 'makera-carvera'
        ? {
            ...provider,
            manifest: {
              ...provider.manifest,
              connection: { ...provider.manifest.connection, credential: 'secret' },
            },
          }
        : provider,
    );
    const claimedSerial = 'CLAIMED-1';
    const bind = ceremony({
      providerId: 'makera-carvera',
      candidate: candidateAt('192.168.0.120', claimedSerial),
      served,
    });

    await expect(bind.complete()).rejects.toMatchObject({ code: 'MACHINE_CREDENTIAL_REQUIRED' });
    await expect(bind.complete({ accessCode: printerCode })).resolves.toEqual({
      status: 'bound',
      machineId: 'workshop-x1c',
    });
    expect(bind.completeBinding).toHaveBeenLastCalledWith({
      ceremonyId: 'ceremony-1',
      secretRef: `vault:machine/makera-carvera/${claimedSerial}`,
      serviceTrust: {},
    });
  });

  describe('a typed code', () => {
    it('should pin the address the provider connects to and save the code beside its pins once bound', async () => {
      const bind = ceremony();

      await expect(bind.complete({ accessCode: printerCode })).resolves.toEqual({
        status: 'bound',
        machineId: 'workshop-x1c',
      });

      expect(bind.probe.mock.calls.map(([probed]) => probed)).toEqual([
        { address: '192.168.0.112', port: 8883 },
        { address: '192.168.0.112', port: 322 },
      ]);
      expect(bind.completeBinding).toHaveBeenCalledWith({
        ceremonyId: 'ceremony-1',
        secretRef: reference,
        serviceTrust: { mqtt: pin('a'), camera: pin('c') },
      });
      /* The provider connected with the staged code, before anything was saved. */
      expect(bind.resolvedDuringConnect).toEqual([printerCode]);
      await expect(bind.secrets.facts(reference)).resolves.toEqual({ mqtt: pin('a').digest, camera: pin('c').digest });
      await expect(bind.secrets.resolve(reference)).resolves.toBe(printerCode);
      expect(bind.events).toEqual([{ type: 'credential-saved', providerId: 'bambu' }]);
    });

    it("should pin the camera on the port the A1 mini's provider declares, whatever model the candidate claims", async () => {
      const bind = ceremony({
        providerId: 'bambu-a1-mini',
        candidate: {
          ...candidateAt('192.0.2.145', '0300EA652800550'),
          claimedIdentity: { serial: '0300EA652800550', model: 'X1C' },
        },
      });
      await bind.complete({ accessCode: printerCode });
      expect(bind.probe.mock.calls.map(([probed]) => probed.port)).toEqual([8883, 6000]);
      expect(bind.completeBinding).toHaveBeenCalledWith(
        expect.objectContaining({
          secretRef: 'vault:machine/bambu-a1-mini/0300EA652800550',
          serviceTrust: { mqtt: pin('a'), camera: pin('c') },
        }),
      );
    });

    it('should leave the vault untouched and drop the staged code when the printer refuses it', async () => {
      const bind = ceremony();

      await expect(bind.complete({ accessCode: '87654321' })).rejects.toThrow('BAMBU_MQTT_TRANSPORT_FAILED');

      expect(bind.resolvedDuringConnect).toEqual(['87654321']);
      await expect(bind.secrets.has(reference)).resolves.toBe(false);
      await expect(bind.secrets.resolve(reference)).rejects.toThrow('MACHINE_SECRET_UNKNOWN');
      expect(bind.events).toEqual([]);
    });

    it('should bind with the MQTT pin alone when the camera does not answer', async () => {
      const bind = ceremony({ camera: false });

      await bind.complete({ accessCode: printerCode });

      expect(bind.completeBinding).toHaveBeenCalledWith({
        ceremonyId: 'ceremony-1',
        secretRef: reference,
        serviceTrust: { mqtt: pin('a') },
      });
      await expect(bind.secrets.facts(reference)).resolves.toEqual({ mqtt: pin('a').digest });
      expect(bind.events).toEqual([
        { type: 'service-unpinned', providerId: 'bambu', service: 'camera' },
        { type: 'credential-saved', providerId: 'bambu' },
      ]);
    });

    it('should refuse the binding when a required service does not answer', async () => {
      const bind = ceremony();
      bind.probe.mockRejectedValueOnce(new Error('MACHINE_CERTIFICATE_PROBE_FAILED'));

      await expect(bind.complete({ accessCode: printerCode })).rejects.toThrow('MACHINE_CERTIFICATE_PROBE_FAILED');
      expect(bind.completeBinding).not.toHaveBeenCalled();
      await expect(bind.secrets.has(reference)).resolves.toBe(false);
    });

    it('should remove the binding again and name only the vault code when the code cannot be saved', async () => {
      const bind = ceremony({ vault: unwritableVault() });

      const failure = await bind.complete({ accessCode: printerCode }).then(
        () => expect.fail('the ceremony should have failed'),
        (error: unknown) => error as Error,
      );

      expect(failure.message).toBe('MACHINE_CREDENTIAL_SAVE_FAILED');
      expect(failure.cause).toEqual({ code: 'SECRET_VAULT_UNAVAILABLE' });
      expect(JSON.stringify({ message: failure.message, cause: failure.cause })).not.toContain(printerCode);
      expect(bind.removeBinding).toHaveBeenCalledWith({ machineId: 'workshop-x1c' });
      await expect(bind.secrets.resolve(reference)).rejects.toThrow('MACHINE_SECRET_UNKNOWN');
      expect(bind.events).toEqual([]);
    });

    it('should report a rollback that could not remove the binding', async () => {
      const bind = ceremony({ vault: unwritableVault() });
      bind.removeBinding.mockRejectedValueOnce(new Error('MACHINE_BINDING_UNAVAILABLE'));

      await expect(bind.complete({ accessCode: printerCode })).rejects.toThrow('MACHINE_CREDENTIAL_SAVE_FAILED');
      expect(bind.events).toEqual([{ type: 'rollback-failed', providerId: 'bambu' }]);
    });
  });

  describe('no typed code', () => {
    it('should reuse the saved code while the printer presents the certificate it was saved with', async () => {
      const vault = createMemorySecretVault();
      await ceremony({ vault }).complete({ accessCode: printerCode });
      const rebind = ceremony({ vault });

      await expect(rebind.complete()).resolves.toEqual({ status: 'bound', machineId: 'workshop-x1c' });

      expect(rebind.completeBinding).toHaveBeenCalledWith({
        ceremonyId: 'ceremony-1',
        secretRef: reference,
        serviceTrust: { mqtt: pin('a'), camera: pin('c') },
      });
      expect(rebind.resolvedDuringConnect).toEqual([printerCode]);
      expect(rebind.events).toEqual([{ type: 'credential-reused', providerId: 'bambu' }]);
    });

    it('should refuse the saved code to a printer whose certificate changed', async () => {
      const vault = createMemorySecretVault();
      await ceremony({ vault }).complete({ accessCode: printerCode });
      /* Another device answering on the address and claiming the same serial. */
      const impostor = ceremony({ vault, certificate: pin('e') });

      await expect(impostor.complete()).rejects.toThrow('MACHINE_CREDENTIAL_TRUST_CHANGED');
      expect(impostor.completeBinding).not.toHaveBeenCalled();
      expect(impostor.resolvedDuringConnect).toEqual([]);
    });

    it('should ask for the code before probing when none is saved', async () => {
      const bind = ceremony();

      await expect(bind.complete()).rejects.toThrow('MACHINE_CREDENTIAL_REQUIRED');
      expect(bind.probe).not.toHaveBeenCalled();
      expect(bind.completeBinding).not.toHaveBeenCalled();
    });

    it('should never reuse a code saved for a printer that claimed no serial', async () => {
      const vault = createMemorySecretVault();
      const anonymous = candidateAt('192.168.0.113');
      const first = ceremony({ vault, candidate: anonymous });
      await first.complete({ accessCode: printerCode });
      const [firstBinding] = first.completeBinding.mock.calls[0] ?? [];
      expect(firstBinding?.secretRef).toMatch(/^vault:machine\/bambu\/unidentified-[\da-f-]{36}$/u);

      await expect(ceremony({ vault, candidate: anonymous }).complete()).rejects.toThrow('MACHINE_CREDENTIAL_REQUIRED');
    });
  });
});
