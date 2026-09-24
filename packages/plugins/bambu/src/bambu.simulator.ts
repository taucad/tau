import { defineConfiguration } from '@taucad/runtime/configuration';
import { defineMachine } from '@taucad/runtime/machine';
import type {
  MachineCommandReceipt,
  MachineDescriptor,
  MachineSession,
  MachineSnapshot,
  MachineSubmissionReceipt,
  MachineTransferReceipt,
} from '@taucad/runtime/machine';
import { quantityKinds } from '@taucad/units/quantity';
import { z } from 'zod';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
import { bambuAcceptedContainers, bambuSubmissionConfiguration } from '#bambu.machine.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
import { bambuX1cManifest } from '#bambu.manifest.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
import { bambuQuantity, bambuRemoteName, parseBambuStill } from '#bambu.protocol.js';

/** Deterministic fault switches accepted by the simulator. @internal */
export type BambuSimulatorFault =
  | 'approval-required-not-honored'
  | 'camera-unavailable'
  | 'certificate-changed'
  | 'partial-transfer'
  | 'protected-mode'
  | 'reply-lost-after-accept'
  | 'storage-full'
  | 'timeout'
  | 'wrong-credential';

/** Socket-free simulator handle used by protocol, host, UI, and tool conformance. @internal */
export type BambuSimulator = Readonly<{
  session: MachineSession<
    Readonly<{
      amsMapping: readonly number[];
      bedLeveling: boolean;
      expectedBedType: string;
      expectedFilamentDiameter: Readonly<{
        value: number;
        unit: string;
        kind: string;
        space: 'linear';
      }>;
      expectedMaterials: ReadonlyArray<Readonly<{ slot: number; materialId: string }>>;
      expectedModel: 'X1C';
      expectedNozzleDiameter: Readonly<{
        value: number;
        unit: string;
        kind: string;
        space: 'linear';
      }>;
      flowCalibration: boolean;
      timelapse: boolean;
    }>
  >;
  reconnect(): void;
  /** Remote names the simulator holds after an accepted upload; a start never adds one. */
  uploadedNames(): readonly string[];
  /** Every physical write in order: `upload:<remoteName>`, `start:<operationId>`, `<command>:<operationId>`. */
  writes(): readonly string[];
}>;

const nozzle = bambuQuantity({
  value: 0.4,
  unit: 'mm',
  kind: quantityKinds.diameter,
  space: 'linear',
});
const nozzleTemperature = bambuQuantity({
  value: 215,
  unit: 'Cel',
  kind: quantityKinds.temperature,
  space: 'point',
});
const bedTemperature = bambuQuantity({
  value: 60,
  unit: 'Cel',
  kind: quantityKinds.temperature,
  space: 'point',
});

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
const simulatedSerial = 'simulated-x1c';

/** Create one deterministic, socket-free X1C simulator for conformance and UI fixtures.
 * @param input - Optional closed fault selection.
 * @returns Deterministic simulator and its machine session.
 */
export const createBambuSimulator = (
  input: Readonly<{ faults?: readonly BambuSimulatorFault[] }> = {},
): BambuSimulator => {
  const faults = new Set(input.faults ?? []);
  const uploaded = new Set<string>();
  const writeLog: string[] = [];
  const observations: MachineSnapshot[] = [];
  const commandResults = new Map<string, Readonly<{ command: string; receipt: MachineSubmissionReceipt }>>();
  let wake: (() => void) | undefined;
  const idle = async (signal: AbortSignal): Promise<void> =>
    new Promise<void>((resolve) => {
      wake = resolve;
      signal.addEventListener(
        'abort',
        () => {
          resolve();
        },
        { once: true },
      );
    });
  let generation = 1;
  let closed = false;
  let runId: string | undefined;

  const now = (): string => `2026-09-14T00:00:0${Math.min(generation, 9)}.000Z`;
  const snapshot = (): MachineSnapshot =>
    Object.freeze({
      connection: closed ? 'disconnected' : 'connected',
      readiness: runId ? 'busy' : 'idle',
      ...(runId ? { activeRunId: runId } : {}),
      observedAt: now(),
      setup: Object.freeze({
        toolId: 'nozzle-0.4',
        bedType: 'textured-pei',
        materials: Object.freeze([
          { slot: 0, state: 'loaded', materialId: 'pla' },
        ] satisfies MachineSnapshot['setup']['materials']),
      }),
      run: Object.freeze({
        state: runId ? 'printing' : 'idle',
        ...(runId ? { progress: 42, remainingSeconds: 180 } : {}),
      }),
      temperatures: Object.freeze({
        nozzle: nozzleTemperature,
        bed: bedTemperature,
      }),
    });
  const observe = (): void => {
    observations.push(snapshot());
    wake?.();
    wake = undefined;
  };
  const guardApproval = (write: string): void => {
    // The tripwire proves a host never touches the device before an explicit approval.
    if (faults.has('approval-required-not-honored')) {
      writeLog.push(`unapproved-${write}`);
      throw new Error('BAMBU_SIMULATOR_UNAPPROVED_WRITE');
    }
  };
  const receipt = (operation: string, command: string): MachineSubmissionReceipt => {
    const accepted: MachineSubmissionReceipt = Object.freeze({
      status: 'accepted',
      providerRunId: operation,
      observedAt: now(),
    });
    commandResults.set(operation, Object.freeze({ command, receipt: accepted }));
    if (faults.has('reply-lost-after-accept')) {
      return Object.freeze({
        status: 'unknown',
        reason: 'reply-lost-after-possible-acceptance',
        observedAt: now(),
      });
    }
    return accepted;
  };
  const descriptor: MachineDescriptor = Object.freeze({
    id: simulatedSerial,
    name: 'Simulated X1C',
    vendor: 'Bambu Lab',
    model: 'X1 Carbon',
    technology: 'additive.fff',
    firmware: 'simulator-1',
    accepts: bambuAcceptedContainers,
    operations: Object.freeze(['prepare', 'upload', 'submit', 'pause', 'resume', 'cancel', 'urgent-stop', 'still']),
    ratedEnvelope: Object.freeze({
      width: 0.256,
      depth: 0.256,
      height: 0.256,
      unit: 'm',
    }),
    printableEnvelope: Object.freeze({
      width: 0.256,
      depth: 0.256,
      height: 0.256,
      unit: 'm',
    }),
    tools: Object.freeze([
      Object.freeze({
        id: 'nozzle-0.4',
        kind: 'extruder',
        nozzleDiameter: nozzle,
      }),
    ]),
    materialSystem: Object.freeze({ kind: 'ams', slotCount: 4 }),
    bedTypes: Object.freeze(['cool', 'engineering', 'high-temperature', 'textured-pei']),
  });

  const session: BambuSimulator['session'] = Object.freeze({
    async getDescriptor() {
      if (faults.has('certificate-changed')) {
        throw new Error('BAMBU_CERTIFICATE_CHANGED');
      }
      if (faults.has('wrong-credential')) {
        throw new Error('BAMBU_AUTHENTICATION');
      }
      if (faults.has('protected-mode')) {
        throw new Error('BAMBU_PROTECTED_MODE');
      }
      if (faults.has('timeout')) {
        throw new Error('BAMBU_TIMEOUT');
      }
      return descriptor;
    },
    async getSnapshot() {
      return snapshot();
    },
    async *observe(input_) {
      while (!input_.signal.aborted) {
        const next = observations.shift();
        if (next) {
          yield Object.freeze({ type: 'snapshot', snapshot: next });
          continue;
        }
        // oxlint-disable-next-line eslint/no-await-in-loop -- the stream idles until the next physical change or abort.
        await idle(input_.signal);
      }
    },
    async preparePrint(input_) {
      if (input_.expectedMachineId !== simulatedSerial) {
        return Object.freeze({
          status: 'rejected',
          code: 'IDENTITY_MISMATCH',
          message: 'The prepared machine identity changed.',
          observedAt: now(),
        });
      }
      return Object.freeze({
        status: 'ready',
        remoteName: bambuRemoteName(input_.operationId),
        digest: input_.artifact.digest,
        length: input_.artifact.length,
        parser: Object.freeze({ id: 'tau.bambu.gcode-3mf', version: '1' }),
        providerData: Object.freeze({
          memberMd5: '00000000000000000000000000000000',
        }),
        observedAt: now(),
      });
    },
    async uploadPrint(input_): Promise<MachineTransferReceipt> {
      guardApproval(`upload:${input_.remoteName}`);
      if (faults.has('storage-full')) {
        return Object.freeze({
          status: 'rejected',
          code: 'STORAGE_FULL',
          message: 'Printer storage is full.',
          observedAt: now(),
        });
      }
      if (faults.has('partial-transfer')) {
        return Object.freeze({
          status: 'rejected',
          code: 'TRANSFER_PARTIAL',
          message: 'Artifact transfer was incomplete and the temporary object was removed.',
          observedAt: now(),
        });
      }
      writeLog.push(`upload:${input_.remoteName}`);
      uploaded.add(input_.remoteName);
      return Object.freeze({
        status: 'transferred',
        transferId: input_.remoteName,
        digest: input_.artifact.digest,
        length: input_.artifact.length,
        observedAt: now(),
      });
    },
    async submit(input_) {
      guardApproval(`start:${input_.operationId}`);
      if (!uploaded.has(input_.remoteName) || input_.transferId !== input_.remoteName) {
        return Object.freeze({
          status: 'rejected',
          code: 'PREPARATION_MISSING',
          message: 'The prepared artifact is not present.',
          observedAt: now(),
        });
      }
      writeLog.push(`start:${input_.operationId}`);
      runId = input_.operationId;
      observe();
      return receipt(input_.operationId, 'project_file');
    },
    async control(input_): Promise<MachineCommandReceipt> {
      if (input_.command !== 'urgent-stop' && input_.expectedProviderRunId !== runId) {
        return Object.freeze({
          status: 'rejected',
          code: 'STALE_RUN',
          message: 'Observed run changed.',
          observedAt: now(),
        });
      }
      writeLog.push(`${input_.command}:${input_.operationId}`);
      if (input_.command === 'cancel' || input_.command === 'urgent-stop') {
        runId = undefined;
      }
      observe();
      const command = input_.command === 'cancel' || input_.command === 'urgent-stop' ? 'stop' : input_.command;
      return receipt(input_.operationId, command);
    },
    async reconcile(input_) {
      const stored = commandResults.get(input_.operationId);
      if (!stored || stored.command !== input_.command) {
        return Object.freeze({
          status: 'unknown',
          reason: 'no-correlated-provider-reply',
          observedAt: now(),
        });
      }
      return stored.receipt;
    },
    stillCapture: faults.has('camera-unavailable')
      ? Object.freeze({
          type: 'supported',
          async capture() {
            throw new Error('BAMBU_CAMERA_UNAVAILABLE');
          },
        })
      : Object.freeze({
          type: 'supported',
          async capture() {
            return parseBambuStill(jpeg, now());
          },
        }),
    async close() {
      closed = true;
      wake?.();
      wake = undefined;
    },
    async dispose() {
      closed = true;
      wake?.();
      wake = undefined;
    },
  });

  return Object.freeze({
    session,
    reconnect() {
      generation += 1;
      closed = false;
      observe();
    },
    uploadedNames: () => Object.freeze([...uploaded]),
    writes: () => Object.freeze([...writeLog]),
  });
};

const simulatorBindingConfiguration = defineConfiguration({
  id: 'bambu.simulator.binding',
  version: '1.0.0',
  schema: z.object({ logicalId: z.string().min(1).max(64) }),
  ui: { version: 1, rjsf: {} },
});

const defineSimulator = (input: Readonly<{ simulator?: BambuSimulator }>) =>
  defineMachine({
    id: 'bambu-simulator',
    name: 'Simulated X1C',
    version: '1.0.0',
    protocolVersion: 1,
    vendor: 'Bambu Lab',
    technologies: ['additive.fff'],
    accepts: bambuAcceptedContainers,
    manifest: { ...bambuX1cManifest, identity: { ...bambuX1cManifest.identity, displayName: 'Simulated X1C' } },
    bindingConfiguration: simulatorBindingConfiguration,
    submissionConfiguration: bambuSubmissionConfiguration,
    async *discover(discoveryInput, runtime) {
      discoveryInput.signal.throwIfAborted();
      const observedAt = runtime.clock.now();
      yield {
        type: 'found',
        candidate: {
          id: 'bambu-simulator',
          name: 'Simulated X1C',
          endpoint: { address: 'simulator.invalid', interface: 'simulator' },
          claimedIdentity: { serial: simulatedSerial, model: 'X1C' },
          observedAt,
          expiresAt: new Date(Date.parse(observedAt) + 5 * 60_000).toISOString(),
        },
      };
    },
    async connect() {
      return (input.simulator ?? createBambuSimulator()).session;
    },
  });

/** Define the simulator provider around one explicit simulator, so a test can read its write ledger.
 * @param input - Optional simulator every connection returns; omitted means one fresh simulator per connection.
 * @returns The `bambu-simulator` provider factory.
 * @internal
 */
export const defineBambuSimulatorMachine = (
  input: Readonly<{ simulator?: BambuSimulator }> = {},
): ReturnType<typeof defineSimulator> => defineSimulator(input);

/** Selectable, explicitly labeled simulated X1C provider (blueprint D10); no sockets, no hardware. @public */
export const bambuSimulatorMachine = defineBambuSimulatorMachine();
