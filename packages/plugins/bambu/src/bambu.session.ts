/**
 * One Bambu printer session (provider ABI v2) over any MQTT-shaped link: the LAN host's pinned MQTTS connection or
 * the simulator's in-memory printer. It reads the printer's pushes into a component report, sends exactly one
 * command per action, and decides every action's effect from later reports: a reply is a hint, never proof.
 *
 * @module
 */

import { createHash } from 'node:crypto';
import { on } from 'node:events';

import type {
  ComponentObservation,
  MachineActionConfirmation,
  MachineActivity,
  MachineAvailability,
  MachineCheck,
  MachineClock,
  MachineCommandReceipt,
  MachineCompleteConfigurationInput,
  MachineComponentValue,
  MachineJobFailureCode,
  MachineLogEntry,
  MachineManifest,
  MachineObservation,
  MachinePreparation,
  MachineProviderActionInput,
  MachinePrompt,
  MachineProviderDescriptor,
  MachineReport,
  MachineRun,
  MachineSession,
  MachineStillCaptureCapability,
  MaterialSlotSnapshot,
} from '@taucad/runtime/machine';
import { checkMachineActionAtSend } from '@taucad/runtime/machine';
import { checkOperation, createQuantity, quantityKinds } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';

import type { BambuPreparedArtifact, BambuSlicedFilament } from '#bambu.archive.js';
import {
  bambuAmsControl,
  bambuCalibrationDelete,
  bambuCalibrationResultRequest,
  bambuCalibrationRun,
  bambuCalibrationSave,
  bambuCalibrationSelect,
  bambuCalibrationTableRequest,
  bambuChamberLight,
  bambuChangeTemperature,
  bambuFanLevel,
  bambuGenericPresets,
  bambuGetVersion,
  bambuHome,
  bambuJog,
  bambuLoad,
  bambuMaterialClear,
  bambuMaterialSetting,
  bambuPrintSpeed,
  bambuPrinterCalibration,
  bambuPushAll,
  bambuReadTag,
  bambuRunCommand,
  bambuSlotLabel,
  bambuUnload,
} from '#bambu.commands.js';
import type { BambuCalibrationFilament, BambuRequest, BambuWireForm, bambuFanIndexes } from '#bambu.commands.js';
import {
  bambuAmsUnit,
  bambuCalibrateSchemas,
  bambuExternalUnit,
  bambuJogSchema,
  bambuNozzle,
  bambuSlotSchema,
  bambuSpeedSchema,
} from '#bambu.manifest.js';
import { bambuPlateForBedType } from '#bambu.plate.js';
import type {
  BambuCalibrationResult,
  BambuCalibrationRow,
  BambuMaterial,
  BambuModel,
  BambuReply,
  BambuStatus,
} from '#bambu.protocol.js';
import {
  bambuBit,
  bambuCalibrationResults,
  bambuCalibrationTable,
  bambuCommandVerificationAlert,
  BambuProtocolError,
  bambuExternalSpoolSlot,
  bambuModels,
  bambuQuantity,
  bambuRemoteName,
  bambuStage,
  definedFields,
  developerModeRemedy,
  mergeBambuStatus,
  parseBambuReply,
  parseBambuStatusPayload,
  parseBambuVersionPayload,
} from '#bambu.protocol.js';
import { bambuAddressOf, bambuSlotOf } from '#bambu.settings.js';

/** One MQTT-shaped conversation with one printer: requests out, reports in. @internal */
export type BambuLink = Readonly<{
  /** Publish one request; resolves once the bytes are handed to the transport. */
  publish(payload: string): Promise<void>;
  /** The one listener for report payloads. */
  subscribe(listener: (bytes: Uint8Array<ArrayBuffer>) => void): void;
  onClose(listener: () => void): void;
  connected(): boolean;
  close(): Promise<void>;
}>;

/**
 * The admitted submission form. The `expected*` keys are what the slice says it was made for, as completion reads
 * them from the file; preparation checks the file's own facts, so a stated value cannot make a check pass.
 * @internal
 */
export type BambuSubmission = Readonly<{
  amsMapping: readonly number[];
  bedLeveling: boolean;
  expectedBedType?: string;
  expectedFilamentDiameter?: number;
  expectedMaterials: ReadonlyArray<Readonly<{ slot: number; materialId: string }>>;
  expectedModel?: BambuModel;
  expectedNozzleDiameter?: number;
  /** The plate a person or agent says is installed, for a printer that does not report one. */
  operatorConfirmedBedType?: string;
  flowCalibration: boolean;
  timelapse: boolean;
}>;

/** What a session needs from its host. @internal */
export type BambuSessionInput = Readonly<{
  model: BambuModel;
  /** The physical serial: the descriptor id, and what `get_version` must report. */
  serial: string;
  name: string;
  link: BambuLink;
  clock: MachineClock;
  signal: AbortSignal;
  /** The serializable manifest the session reports actions and capabilities from. */
  manifest: MachineManifest;
  /** Which variant of the commands the clients disagree on to send. */
  form: BambuWireForm;
  /** Real printers run only Bambu Studio output; the simulator runs anything. */
  requireBambuStudio: boolean;
  stillCapture: MachineStillCaptureCapability;
  /** Milliseconds to wait for a correlated reply before answering without one. */
  replyWindow?: number;
  /** Milliseconds to wait for the printer's first status and firmware. */
  openWindow?: number;
  log(entry: MachineLogEntry): Promise<void>;
  readArtifact(
    artifact: Parameters<MachineJobs['prepare']>[0]['artifact'],
    signal: AbortSignal,
  ): Promise<BambuPreparedArtifact>;
  upload(
    input: Readonly<{ remoteName: string; artifact: BambuPreparedArtifact; signal: AbortSignal }>,
  ): Promise<number>;
}>;

type MachineJobs = Extract<MachineSession<BambuSubmission>['jobs'], { type: 'supported' }>;
type Configuration = MachineCompleteConfigurationInput['configuration'];
const isFields = (value: Configuration): value is Readonly<Record<string, Configuration>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
type StoredJobs = Extract<MachineJobs, { delivery: 'stored' }>;

const actionKey = (componentId: string, action: string): string => `${componentId}:${action}`;

/** The id Tau sends as `subtask_id`/`project_id` for a start, derived from its operation so a reply after a reconnect still names it. */
const bambuWireId = (operationId: string): string =>
  String(
    Number(BigInt(`0x${createHash('sha256').update(operationId).digest('hex').slice(0, 8)}`) % 2_147_483_646n) + 1,
  );
/**
 * The `sequence_id` an operation's command carries: 30000–89999, outside Bambu Studio's own 20000–29999 (whose
 * failures it shows as dialogs) and outside the session's reads. Two operations can share one; the session moves the
 * later one on while the earlier is in flight.
 * @param operationId - The operation.
 * @returns The sequence id.
 * @internal
 */
export const bambuWireSequenceId = (operationId: string): string =>
  String(30_000 + (Number(bambuWireId(operationId)) % 60_000));

/** Transfer failures the upload names itself: nothing was left half-sent. */
const bambuTransferRefusals: ReadonlySet<string> = new Set([
  'MACHINE_TRANSFER_STORAGE_FULL',
  'MACHINE_TRANSFER_PARTIAL',
  'MACHINE_TRANSFER_UNAVAILABLE',
]);

const remoteNamePattern = /^tau-[A-Za-z0-9_-]{1,64}\.gcode\.3mf$/u;
const memberMd5Pattern = /^[0-9a-f]{32}$/u;
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** `print_error` 0500-400E: "Printing was cancelled." */
const cancelledCode = '0500-400E';

/** `ams_status` main states (bits 8–15; DevDefs.h:41-52). */
const amsMain = {
  idle: 0,
  filamentChange: 1,
  readingTag: 2,
  assist: 3,
  calibration: 4,
  coldPull: 7,
  selfCheck: 0x10,
} as const;
const mainOf = (status: BambuStatus | undefined): number => Math.floor((status?.amsStatus ?? 0) / 256);
/* Busy is a procedure in progress, as Bambu Studio reads it (StatusPanel.cpp:6030-6130): a loaded AMS sits in
 * ASSIST (3), not IDLE, once a load finishes. */
const busyMains: ReadonlySet<number> = new Set([
  amsMain.filamentChange,
  amsMain.readingTag,
  amsMain.calibration,
  amsMain.coldPull,
  amsMain.selfCheck,
]);
const isFilamentBusy = (status: BambuStatus | undefined): boolean => busyMains.has(mainOf(status));
const stepOf = (status: BambuStatus | undefined): number => (status?.amsStatus ?? 0) % 256;

const liveStates: ReadonlySet<string> = new Set(['RUNNING', 'PREPARE', 'SLICING', 'PAUSE', 'INIT']);
const isLive = (status: BambuStatus | undefined): boolean => liveStates.has(status?.gcodeState ?? '');

/** Which calibration a system print is, from its G-code file name (DeviceManager.cpp:738-770, 1033-1070). */
const calibrationKindOf = (
  status: BambuStatus | undefined,
): 'pressure-advance' | 'flow-ratio' | 'printer' | undefined => {
  const file = status?.runFile ?? '';
  if (file.includes('extrusion_cali')) {
    return 'pressure-advance';
  }
  if (file.includes('flowrate')) {
    return 'flow-ratio';
  }
  return file.includes('auto_cali_for_user') ? 'printer' : undefined;
};

/** The run id a status names: the printer's `subtask_id`, else the run's name for a print started at the printer. */
const runIdOf = (status: BambuStatus | undefined): string =>
  status?.providerRunId !== undefined && status.providerRunId !== '0'
    ? status.providerRunId
    : (status?.runName ?? 'printer-run');

/** `flag3` bit 3: a slot may be edited during a print (BS/AMSMaterialsSetting.cpp:530-578). */
const editsDuringRun = (status: BambuStatus | undefined): boolean => bambuBit(status?.flag3 ?? 0, 3);
/** `flag3` bit 9: the new AMS protocol (`ams_get_rfid`; DeviceManager.cpp:3108-3115). */
const newAmsProtocol = (status: BambuStatus | undefined): boolean => bambuBit(status?.flag3 ?? 0, 9);

const millimetres = (quantity: Quantity | undefined): number | undefined =>
  quantity === undefined ? undefined : Number(quantity.value);

/**
 * How far apart two `#RRGGBB[AA]` colours are.
 * @param left - One colour.
 * @param right - The other.
 * @returns 0–3, or `undefined` when either is not a colour.
 */
const colorDistance = (left: string | undefined, right: string | undefined): number | undefined => {
  const channels = (color: string | undefined) =>
    /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})/iu
      .exec(color ?? '')
      ?.slice(1)
      .map((hex) => Number.parseInt(hex, 16) / 255);
  const [a, b] = [channels(left), channels(right)];
  return a === undefined || b === undefined
    ? undefined
    : a.reduce((sum, value, index) => sum + Math.abs(value - (b[index] ?? 0)), 0);
};

const sameDiameter = (observed: Quantity | undefined, declared: number): boolean => {
  if (!observed) {
    return false;
  }
  const expected = createQuantity({
    value: declared,
    unit: 'mm',
    kind: quantityKinds.diameter,
    space: 'linear',
    semanticMode: 'declared-only',
  });
  if (expected.status !== 'success') {
    return false;
  }
  const compared = checkOperation({ operator: 'compare', left: observed, right: expected.value });
  return compared.status === 'success' && compared.value.value === 0;
};

const celsius = (value: number): Quantity =>
  bambuQuantity({ value, unit: 'Cel', kind: quantityKinds.temperature, space: 'point' });

const refusal = (code: string, message: string) => ({ refused: { code, message } }) as const;

/** The filament-change steps Bambu Studio shows (FilamentLoad.cpp:154-200), with the `ams_status` step that is each. */
type StepPlan = ReadonlyArray<readonly [label: string, actor: 'machine' | 'person', steps: readonly number[]]>;
const heat = ['Heat the nozzle', 'machine', [0x02]] as const;
const cut = ['Cut the filament', 'machine', [0x03]] as const;
const pull = ['Pull back the current filament', 'machine', [0x04]] as const;
const push = ['Push the new filament into the extruder', 'machine', [0x05, 0x06]] as const;
const purge = ['Purge the old filament', 'machine', [0x07]] as const;
const check = ['Check the filament location', 'machine', [0x08, 0x0b]] as const;
const stepPlans = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- keyed by the model name.
  X1C: {
    load: [heat, cut, pull, push, purge],
    loadEmpty: [heat, push, purge],
    // External spool: the person pushes the filament in and confirms it comes out (StatusPanel.cpp:6048-6057).
    external: [
      heat,
      ['Push the filament into the extruder', 'person', [0x05]],
      ['Confirm the filament comes out of the nozzle', 'person', [0x06]],
      purge,
    ],
    unload: [heat, cut, pull],
  },
  'A1 mini': {
    load: [heat, check, cut, pull, push, purge],
    loadEmpty: [heat, check, cut, pull, push, purge],
    external: [
      heat,
      check,
      cut,
      pull,
      ['Push the filament into the extruder', 'person', [0x05]],
      ['Confirm the filament comes out of the nozzle', 'person', [0x06]],
      purge,
    ],
    unload: [heat, check, cut, pull],
  },
} as const satisfies Readonly<Record<BambuModel, Readonly<Record<string, StepPlan>>>>;

/** What one sent operation is, and what the session has seen of it since. */
type LedgerEntry = {
  readonly kind: 'action' | 'stop' | 'transfer' | 'start';
  readonly key: string;
  readonly sequence: string;
  readonly command: string;
  receipt?: MachineCommandReceipt;
  /** The printer showed the activity the command starts. */
  sawActivity: boolean;
  /** The calibration-table version when the command was sent. */
  readonly tableVersion?: number;
};

/** A filament change the printer is running, as the session followed it. */
type FilamentChange = {
  readonly activityId: string;
  readonly kind: 'material-load' | 'material-unload';
  readonly target?: number;
  readonly plan: StepPlan;
  readonly operationId?: string;
  promptStep?: number;
  promptCount: number;
};

/** A calibration the printer ran or is running, and what it measured. */
type Calibration = {
  readonly activityId: string;
  readonly method: 'pressure-advance' | 'flow-ratio' | 'printer';
  operationId?: string;
  results?: readonly BambuCalibrationResult[];
  requested: boolean;
  ended: boolean;
};

/** Milliseconds without a report before the session asks for the whole state again. */
const quietInterval = 20_000;
const ledgerCapacity = 512;

/**
 * Open one session: ask for the whole state and the firmware, wait for both, and check the printer is the one bound.
 *
 * @param input - The link, the printer's identity and the host services.
 * @returns The session.
 * @internal
 */
// oxlint-disable-next-line eslint/complexity, eslint/max-statements -- one session closure owns the whole printer conversation.
export const openBambuSession = async (input: BambuSessionInput): Promise<MachineSession<BambuSubmission>> => {
  const { model, serial, link, clock, manifest } = input;
  const facts = bambuModels[model];
  const printer = facts.plateFamily;
  const replyWindow = input.replyWindow ?? 5000;
  const updates = new EventTarget();
  const replies = new Map<string, BambuReply>();
  const ledger = new Map<string, LedgerEntry>();
  const startRunNames = new Map<string, string>();
  const answeredPrompts = new Set<string>();
  let status: BambuStatus | undefined;
  let statusAt: string | undefined;
  let lastReportAt = Date.now();
  let firmware: string | undefined;
  let versionSerial: string | undefined;
  let versionModel: string | undefined;
  /**
   * Developer Mode off, learnt from a refusal or the HMS row; cleared only when the printer reports it on (`fun`) or
   * accepts one of the session's own commands. A printer that sends no `fun` (A1 mini) keeps it until then.
   */
  let refusedForDeveloperMode = false;
  let table: { version?: number; rows: readonly BambuCalibrationRow[] } | undefined;
  let tableRequestedFor: number | undefined;
  let change: FilamentChange | undefined;
  let changes = 0;
  let calibration: Calibration | undefined;
  /** The calibration this session last asked for, so a system print without a known file name is still named. */
  let requestedCalibration: { method: Calibration['method']; operationId: string } | undefined;
  /**
   * A pause an agent asked for, until the run has shown it and left it: the printer reports every remote pause alike.
   * One the printer refused, or did not show within the reply window, is dropped so a later pause from the screen
   * reads as the person's.
   */
  let agentPause: { runId: string; shown: boolean; until: number } | undefined;
  let readSequence = 90_000;
  let lastEmitted: MachineReport | undefined;
  let closed = false;

  const now = (): string => clock.now();
  const nextReadSequence = (): string => {
    readSequence = readSequence >= 99_999 ? 90_000 : readSequence + 1;
    return String(readSequence);
  };
  const send = async (request: BambuRequest | string): Promise<void> => {
    await link.publish(typeof request === 'string' ? request : JSON.stringify(request.payload));
  };
  /** Send without waiting: a read or a keep-fresh push is a hint, so a failure is only a missed hint. */
  const sendQuietly = async (request: BambuRequest | string): Promise<void> => {
    try {
      await send(request);
    } catch {
      // The next report or keep-fresh push tries again.
    }
  };
  const read = (request: BambuRequest): void => {
    void sendQuietly(request);
  };
  const nozzleDiameter = (): number => millimetres(status?.nozzleDiameter) ?? 0.4;
  const developerMode = (): 'on' | 'off' | undefined =>
    status?.developerMode ?? (refusedForDeveloperMode ? 'off' : undefined);
  const trays = (): readonly BambuMaterial[] => [
    ...(status?.materials ?? []),
    ...(status?.externalMaterial ? [status.externalMaterial] : []),
  ];
  const trayOf = (slot: number): BambuMaterial | undefined => trays().find((tray) => tray.slot === slot);

  // ───────────── What the printer says ─────────────

  /** Follow the printer's filament changes, tag reads and calibrations, and fetch what the session needs to read. */
  const follow = (): void => {
    const main = mainOf(status);
    if (main === amsMain.filamentChange) {
      const target = status?.targetMaterialSlot;
      const unload = target === undefined;
      if (change === undefined || change.target !== target) {
        changes += 1;
        const plans = stepPlans[model];
        const operationId = [...ledger.entries()].findLast(
          ([, entry]) =>
            entry.kind === 'action' &&
            entry.key === actionKey('filament', unload ? 'material.unload' : 'material.load') &&
            !entry.sawActivity,
        )?.[0];
        change = {
          activityId: `filament-change-${String(changes)}`,
          kind: unload ? 'material-unload' : 'material-load',
          ...(target === undefined ? {} : { target }),
          plan: unload
            ? plans.unload
            : target === bambuExternalSpoolSlot
              ? plans.external
              : status?.currentMaterialSlot === undefined
                ? plans.loadEmpty
                : plans.load,
          ...(operationId === undefined ? {} : { operationId }),
          promptCount: 0,
        };
      }
      const person = change.plan.findIndex(([, actor, steps]) => actor === 'person' && steps.includes(stepOf(status)));
      if (person !== -1 && change.promptStep !== stepOf(status)) {
        change.promptCount += 1;
      }
      change.promptStep = person === -1 ? undefined : stepOf(status);
    } else {
      change = undefined;
    }
    for (const entry of ledger.values()) {
      if (
        (main === amsMain.filamentChange &&
          (entry.key === actionKey('filament', 'material.load') ||
            entry.key === actionKey('filament', 'material.unload'))) ||
        (main === amsMain.readingTag && entry.key === actionKey('filament', 'bambu.ams.read-tag'))
      ) {
        entry.sawActivity = true;
      }
    }
    const kind =
      calibrationKindOf(status) ??
      (status?.printType === 'system' && isLive(status) ? requestedCalibration?.method : undefined);
    if (kind !== undefined) {
      const activityId = `calibration-${String(status?.startTime ?? 'current')}`;
      // The printer may report the run before the session records that Tau asked for it.
      if (
        calibration?.activityId === activityId &&
        calibration.operationId === undefined &&
        requestedCalibration?.method === kind
      ) {
        calibration.operationId = requestedCalibration.operationId;
      }
      if (calibration?.activityId !== activityId) {
        calibration = {
          activityId,
          method: kind,
          ...(requestedCalibration?.method === kind ? { operationId: requestedCalibration.operationId } : {}),
          requested: false,
          ended: false,
        };
      }
      calibration.ended = !isLive(status);
      if (calibration.ended && !calibration.requested && calibration.method !== 'printer') {
        calibration.requested = true;
        read(bambuCalibrationResultRequest(nextReadSequence(), calibration.method, nozzleDiameter()));
      }
    }
    const version = status?.calibrationVersion;
    if (version !== undefined && tableRequestedFor !== version) {
      tableRequestedFor = version;
      read(bambuCalibrationTableRequest(nextReadSequence(), nozzleDiameter()));
      // The first table request after connecting often goes unanswered (bambuddy notes): ask once more.
      setTimeout(() => {
        if (!closed && table?.version !== version && tableRequestedFor === version) {
          read(bambuCalibrationTableRequest(nextReadSequence(), nozzleDiameter()));
        }
      }, 6000).unref();
    }
  };

  const handleReply = (reply: BambuReply): void => {
    if (reply.unauthorized) {
      refusedForDeveloperMode = true;
    } else if (
      reply.result === 'success' &&
      [...ledger.values()].some((entry) => entry.sequence !== '' && entry.sequence === reply.sequence)
    ) {
      // The printer took a command of ours, so it is not dropping them.
      refusedForDeveloperMode = false;
    }
    if (reply.sequence !== undefined) {
      replies.set(reply.sequence, reply);
      if (replies.size > 256) {
        replies.delete(replies.keys().next().value!);
      }
      updates.dispatchEvent(new Event(`reply:${reply.sequence}`));
    }
    // Every client sees every reply; a whole table or a result set is adopted whoever asked for it.
    const rows = bambuCalibrationTable(reply);
    if (rows !== undefined) {
      table = { ...definedFields({ version: status?.calibrationVersion }), rows };
    }
    const results = bambuCalibrationResults(reply);
    if (results !== undefined && calibration !== undefined && calibration.method !== 'printer') {
      calibration.results = results;
    }
    if (rows !== undefined || results !== undefined) {
      emit();
    }
  };

  link.subscribe((bytes) => {
    try {
      const version = parseBambuVersionPayload(bytes);
      firmware = version.firmware;
      versionSerial = version.serial;
      versionModel = version.model;
      updates.dispatchEvent(new Event('facts'));
      return;
    } catch {
      // A status push or a command reply.
    }
    const reply = parseBambuReply(bytes);
    if (reply !== undefined) {
      handleReply(reply);
      return;
    }
    try {
      status = mergeBambuStatus(status, parseBambuStatusPayload(bytes));
    } catch {
      // Untrusted payloads are discarded without retaining bytes or error detail.
      return;
    }
    statusAt = now();
    lastReportAt = Date.now();
    if (agentPause !== undefined) {
      if (status.gcodeState === 'PAUSE') {
        agentPause.shown = true;
      } else if (agentPause.shown || Date.now() > agentPause.until) {
        agentPause = undefined;
      }
    }
    if (status.developerMode === 'on') {
      refusedForDeveloperMode = false;
    }
    if (hasVerificationAlert()) {
      refusedForDeveloperMode = true;
    }
    follow();
    updates.dispatchEvent(new Event('facts'));
    emit();
  });
  link.onClose(() => {
    emit();
  });
  const hasVerificationAlert = (): boolean =>
    status?.alerts?.some((alert) => alert.code === bambuCommandVerificationAlert) === true;

  // ───────────── The report ─────────────

  const machineStatus = (): MachineReport['state'] => {
    const native = status?.gcodeState;
    const words = native === undefined ? {} : { native };
    const busy = isFilamentBusy(status);
    switch (native) {
      case 'IDLE':
      case 'FINISH':
      case 'FAILED': {
        return { status: busy ? 'active' : 'ready', ...words };
      }
      case 'RUNNING':
      case 'PREPARE':
      case 'SLICING':
      case 'INIT': {
        return { status: 'active', ...words };
      }
      case 'PAUSE': {
        const reason = bambuStage(status?.stageId);
        return { status: 'held', ...words, ...(reason === undefined ? {} : { reason }) };
      }
      default: {
        return { status: 'unknown', ...words };
      }
    }
  };

  const runOf = (): MachineRun | undefined => {
    if (status === undefined || status.gcodeState === undefined || status.gcodeState === 'IDLE') {
      return undefined;
    }
    if (calibrationKindOf(status) !== undefined || status.printType === 'system') {
      return undefined;
    }
    const state: MachineRun['state'] = (() => {
      switch (status.gcodeState) {
        case 'PREPARE':
        case 'SLICING':
        case 'INIT': {
          return 'starting';
        }
        case 'RUNNING': {
          return 'running';
        }
        case 'PAUSE': {
          return 'paused';
        }
        case 'FINISH': {
          return 'completed';
        }
        case 'FAILED': {
          return status.alerts?.some((alert) => alert.code === cancelledCode) ? 'cancelled' : 'failed';
        }
        default: {
          return 'unknown';
        }
      }
    })();
    const stage = isLive(status) ? bambuStage(status.stageId) : undefined;
    const { stageId } = status;
    const runId = runIdOf(status);
    const pausedBy =
      stageId === 5 || stageId === 30
        ? 'program'
        : stageId === 16 || stageId === undefined || stageId <= 0
          ? agentPause?.runId === runId
            ? 'agent'
            : 'person'
          : 'machine';
    return {
      runId,
      origin: status.runName?.startsWith('tau-') === true ? 'tau' : 'external',
      delivery: 'stored',
      state,
      ...(state === 'paused' ? { paused: { by: pausedBy, ...(stage === undefined ? {} : { reason: stage }) } } : {}),
      ...(status.runName === undefined ? {} : { program: { name: status.runName } }),
      ...(status.startTime === undefined ? {} : { startedAt: new Date(status.startTime * 1000).toISOString() }),
      progress: {
        basis: 'executed',
        ...definedFields({
          fraction: status.progress === undefined ? undefined : status.progress / 100,
          remaining: status.remainingSeconds === undefined ? undefined : status.remainingSeconds * 1000,
        }),
        counters:
          status.currentLayer === undefined
            ? []
            : [
                {
                  id: 'layer',
                  label: 'Layer',
                  current: status.currentLayer,
                  ...(status.totalLayers === undefined ? {} : { total: status.totalLayers }),
                },
              ],
      },
      ...(stage === undefined ? {} : { stage }),
    };
  };

  const editing = (tray: BambuMaterial): MaterialSlotSnapshot['editing'] => {
    const duringRun = editsDuringRun(status);
    if (developerMode() === 'off') {
      return { allowed: false, duringRun, reason: 'The printer ignores Tau until Developer Mode is on.' };
    }
    if (tray.tagged === true) {
      return {
        allowed: false,
        duringRun,
        reason: 'A Bambu spool’s tag identifies this slot, so its material is read-only.',
      };
    }
    if (runOf() !== undefined && isLive(status) && !duringRun) {
      return { allowed: false, duringRun, reason: 'This printer does not allow editing a slot during a print.' };
    }
    return { allowed: true, duringRun };
  };

  const slotSnapshot = (slot: number): MaterialSlotSnapshot => {
    const tray = trayOf(slot);
    if (tray === undefined) {
      return {
        slot: bambuAddressOf(slot),
        state: 'unknown',
        identifiedBy: 'unknown',
        editing: {
          allowed: false,
          duringRun: editsDuringRun(status),
          reason: 'The printer has not reported this slot.',
        },
      };
    }
    const identifiedBy = tray.materialId === undefined ? 'unset' : tray.tagged === true ? 'tag' : 'person';
    return {
      slot: bambuAddressOf(slot),
      state: tray.state,
      identifiedBy,
      ...(tray.materialId === undefined
        ? {}
        : {
            material: {
              materialType: tray.materialId,
              color: tray.color ?? '#00000000',
              preset: { profileId: tray.profileId ?? tray.materialId, settingId: tray.settingId ?? '' },
              ...(tray.nozzleMinimum === undefined || tray.nozzleMaximum === undefined
                ? {}
                : { nozzleTemperature: { min: celsius(tray.nozzleMinimum), max: celsius(tray.nozzleMaximum) } }),
              ...(tray.brand === undefined ? {} : { brand: tray.brand }),
              calibration:
                tray.calibrationIndex === undefined || tray.calibrationIndex < 0
                  ? { type: 'default' }
                  : { type: 'profile', profileId: String(tray.calibrationIndex) },
            },
          }),
      ...(tray.remainingPercent === undefined ? {} : { remainingPercent: tray.remainingPercent }),
      editing: editing(tray),
    };
  };

  /** AMS indexes the printer reports (none when it reports an empty list), else the one the manifest declares. */
  const amsUnits = (): readonly number[] => status?.materialUnits?.map(({ unit }) => unit) ?? [0];

  const materialValue = (): MachineComponentValue => ({
    kind: 'material-system',
    slots: [...amsUnits().flatMap((unit) => [0, 1, 2, 3].map((tray) => unit * 4 + tray)), bambuExternalSpoolSlot].map(
      (slot) => slotSnapshot(slot),
    ),
    ...(table === undefined || status?.calibrationVersion === undefined
      ? {}
      : {
          calibrations: {
            revision: String(status.calibrationVersion),
            ...definedFields({ capacity: facts.calibrationCapacity }),
            rows: table.rows.map((row) => ({
              profileId: String(row.index),
              name: row.name,
              preset: { profileId: row.filamentId, settingId: row.settingId },
              nozzleId: `nozzle-${row.nozzleDiameter ?? String(nozzleDiameter())}`,
              pressureAdvance: row.pressureAdvance,
            })),
          },
        }),
    routes: [
      {
        toolheadId: 'tool-0',
        current: status?.currentMaterialSlot === undefined ? null : bambuAddressOf(status.currentMaterialSlot),
        target: status?.targetMaterialSlot === undefined ? null : bambuAddressOf(status.targetMaterialSlot),
      },
    ],
    ...(status?.materialUnits === undefined
      ? {}
      : {
          units: status.materialUnits.map((unit) => ({
            unitId: bambuAmsUnit(unit.unit).id,
            ...definedFields({ humidityIndex: unit.humidityIndex, temperature: unit.temperature }),
          })),
        }),
  });

  const components = (): readonly ComponentObservation[] => {
    if (status === undefined || statusAt === undefined) {
      return [];
    }
    const receivedAt = statusAt;
    const known = (componentId: string, group: string, value: MachineComponentValue): ComponentObservation => ({
      componentId,
      group,
      receivedAt,
      knowledge: 'known',
      value,
    });
    const temperature = (
      id: string,
      label: string,
      [value, target]: readonly [Quantity | undefined, Quantity | undefined],
    ) => (value === undefined ? [] : [{ id, label, value, ...(target === undefined ? {} : { target }) }]);
    const plateId = status.bedType === undefined ? undefined : bambuPlateForBedType(status.bedType, printer)?.id;
    const fans = [
      ['part-fan', status.partFanPercent],
      ...(facts.chamber
        ? ([
            ['aux-fan', status.auxiliaryFanPercent],
            ['chamber-fan', status.chamberFanPercent],
          ] as const)
        : []),
    ] as const;
    return [
      known('controller', 'state', {
        kind: 'readings',
        values: [
          ...(status.wifiSignalDbm === undefined
            ? []
            : [{ id: 'wifi', label: 'Wi-Fi signal (dBm)', value: status.wifiSignalDbm }]),
          ...(status.removableStorage === undefined
            ? []
            : [{ id: 'storage', label: 'Storage card', value: status.removableStorage === 'present' }]),
        ],
      }),
      {
        componentId: 'motion',
        group: 'position',
        receivedAt,
        knowledge: 'unknown',
        reason: 'The printer does not report axis positions.',
      },
      known('tool-0', 'temperature', {
        kind: 'readings',
        values: temperature('nozzle', 'Nozzle', [status.nozzleTemperature, status.nozzleTargetTemperature]),
      }),
      known('bed', 'temperature', {
        kind: 'readings',
        values: [
          ...temperature('temperature', 'Bed', [status.bedTemperature, status.bedTargetTemperature]),
          // The installed plate by its manifest id, when the printer reports one Tau knows.
          ...(plateId === undefined ? [] : [{ id: 'plate', label: 'Build plate', value: plateId }]),
        ],
      }),
      ...(facts.chamber
        ? [
            known('chamber', 'temperature', {
              kind: 'readings',
              values: temperature('temperature', 'Chamber', [status.chamberTemperature, undefined]),
            }),
          ]
        : []),
      ...(facts.chamber && (status.chamberLight === 'on' || status.chamberLight === 'off')
        ? [known('chamber-light', 'accessories', { kind: 'switch', on: status.chamberLight === 'on' })]
        : []),
      ...(status.speedProfile === undefined || status.speedProfile === 'unknown'
        ? []
        : [known('speed', 'accessories', { kind: 'option', option: status.speedProfile })]),
      ...fans.flatMap(([componentId, percent]) =>
        percent === undefined ? [] : [known(componentId, 'accessories', { kind: 'level', ratio: percent / 100 })],
      ),
      known('filament', 'material', materialValue()),
    ];
  };

  const stepState = (index: number, current: number): 'todo' | 'done' | 'active' =>
    current === -1 || index > current ? 'todo' : index < current ? 'done' : 'active';

  const prompt = (current: FilamentChange): MachinePrompt & Readonly<{ kind: 'confirmation' }> => {
    const [label] = current.plan.find((entry) => entry[2].includes(current.promptStep ?? -1)) ?? ['Check the filament'];
    return {
      kind: 'confirmation',
      promptId: `${current.activityId}:${String(current.promptCount)}`,
      label: current.promptStep === 0x06 ? 'Has the filament come out of the nozzle?' : label,
      answers:
        current.promptStep === 0x06
          ? [
              { id: 'done', label: 'Done, it comes out', role: 'confirm' },
              { id: 'retry', label: 'Not yet, try again', role: 'retry' },
            ]
          : [{ id: 'done', label: 'Done', role: 'confirm' }],
      effects: ['material', 'motion', 'thermal'],
      safety: { authority: 'person', attended: false, interlocks: [] },
    };
  };

  const activities = (): readonly MachineActivity[] => {
    const list: MachineActivity[] = [];
    if (change !== undefined) {
      const current = change.plan.findIndex((entry) => entry[2].includes(stepOf(status)));
      const steps = change.plan.map(([label, actor], index) => ({
        id: `step-${String(index + 1)}`,
        label,
        actor,
        state: stepState(index, current),
      }));
      const target = change.target === undefined ? undefined : bambuSlotLabel(change.target);
      list.push({
        activityId: change.activityId,
        componentId: 'filament',
        kind: change.kind,
        label: change.kind === 'material-unload' ? 'Unloading filament' : `Loading ${target ?? 'filament'}`,
        ...(isLive(status) ? { runId: runIdOf(status) } : {}),
        ...(change.operationId === undefined ? {} : { operationId: change.operationId }),
        state: change.promptStep === undefined ? 'in-progress' : 'needs-person',
        steps,
        ...(current === -1 ? {} : { progress: current / change.plan.length }),
        ...(change.promptStep === undefined ? {} : { awaiting: prompt(change) }),
        cancel: { componentId: 'filament', action: 'bambu.filament.abort' },
      });
    }
    if (mainOf(status) === amsMain.readingTag) {
      list.push({
        activityId: 'read-tag',
        componentId: 'filament',
        kind: 'bambu.read-tag',
        label: 'Reading the spool tag',
        state: 'in-progress',
        steps: [{ id: 'step-1', label: 'Turn the spool past the reader', actor: 'machine', state: 'active' }],
      });
    }
    if (calibration !== undefined) {
      const labels = {
        'pressure-advance': ['Calibrating pressure advance', 'Pressure advance measured'],
        'flow-ratio': ['Calibrating flow ratio', 'Flow ratio measured'],
        printer: ['Running the printer’s calibration', 'Printer calibration finished'],
      } as const;
      const { results } = calibration;
      const measuring = calibration.method !== 'printer';
      const steps = [
        ['Heat and home', 'machine'],
        [calibration.method === 'printer' ? 'Calibrate' : 'Print and measure test lines', 'machine'],
        ...(measuring ? ([['Review the result', 'person']] as const) : []),
      ] as const;
      const done = calibration.ended ? (measuring ? 2 : steps.length) : status?.stageId === 13 ? 0 : 1;
      list.push({
        activityId: calibration.activityId,
        componentId: calibration.method === 'printer' ? 'controller' : 'filament',
        kind: 'calibration',
        label: labels[calibration.method][calibration.ended ? 1 : 0],
        ...(calibration.operationId === undefined ? {} : { operationId: calibration.operationId }),
        state: calibration.ended
          ? status?.gcodeState === 'FAILED'
            ? 'failed'
            : measuring
              ? 'needs-person'
              : 'succeeded'
          : 'in-progress',
        steps: steps.map(([label, actor], index) => ({
          id: `step-${String(index + 1)}`,
          label,
          actor,
          state: index < done ? 'done' : index === done ? 'active' : 'todo',
        })),
        ...(calibration.ended && measuring && status?.gcodeState !== 'FAILED'
          ? { awaiting: { kind: 'instruction', label: 'Keep a result: save it as a profile, or leave it.' } }
          : {}),
        ...(results === undefined
          ? {}
          : {
              results: results.map((result, index) => ({
                id: `result-${String(index + 1)}`,
                label: `${bambuSlotLabel(result.slot)} · ${result.filamentId}`,
                confidence: result.confidence,
                value: {
                  ...bambuAddressOf(result.slot),
                  profileId: result.filamentId,
                  settingId: result.settingId,
                  ...(result.pressureAdvance === undefined ? {} : { pressureAdvance: result.pressureAdvance }),
                  ...(result.flowRatio === undefined ? {} : { flowRatio: result.flowRatio }),
                },
              })),
            }),
      });
    }
    return list;
  };

  const checks = (): readonly MachineCheck[] => [
    {
      id: 'developer-mode',
      label: 'Developer Mode on',
      state: developerMode() === 'off' ? 'blocked' : developerMode() === 'on' ? 'passed' : 'unknown',
      source: 'observed',
      ...(developerMode() === 'on'
        ? {}
        : { detail: 'Without it, firmware from 01.08.03.00 ignores every command from Tau.' }),
      ...(developerMode() === 'off' ? { remedy: developerModeRemedy } : {}),
    },
    {
      id: 'storage',
      label: 'Storage card inserted',
      state:
        status?.removableStorage === 'absent'
          ? 'blocked'
          : status?.removableStorage === 'present'
            ? 'passed'
            : 'unknown',
      source: 'observed',
      ...(status?.removableStorage === 'absent'
        ? { remedy: { type: 'person', instruction: 'Insert the printer’s storage card.' } as const }
        : {}),
    },
  ];

  /** Why an action cannot be used now, beyond what the descriptor's statuses already say. */
  const unavailableBecause = (componentId: string, action: string): MachineAvailability | undefined => {
    const unavailable = (
      code: Extract<MachineAvailability, { state: 'unavailable' }>['code'],
      message: string,
      remedy?: Extract<MachineAvailability, { state: 'unavailable' }>['remedy'],
    ): MachineAvailability => ({
      componentId,
      id: action,
      state: 'unavailable',
      code,
      message,
      ...(remedy ? { remedy } : {}),
    });
    if (developerMode() === 'off') {
      return unavailable(
        'MACHINE_ACTION_UNSUPPORTED',
        'This printer ignores commands from Tau until Developer Mode is on.',
        developerModeRemedy,
      );
    }
    const main = mainOf(status);
    switch (actionKey(componentId, action)) {
      case 'filament:material.load':
      case 'filament:material.unload':
      case 'filament:bambu.ams.read-tag': {
        return isFilamentBusy(status)
          ? unavailable('MACHINE_ACTION_BUSY', 'Wait for the filament system to finish.')
          : undefined;
      }
      case 'filament:interaction.respond': {
        return change?.promptStep === undefined
          ? unavailable('MACHINE_ACTION_PROMPT_STALE', 'The printer is not asking anything.')
          : undefined;
      }
      case 'filament:bambu.filament.abort': {
        return main === amsMain.filamentChange
          ? undefined
          : unavailable('MACHINE_ACTION_PRECONDITION_FAILED', 'No filament change is in progress.');
      }
      case 'filament:material.calibration.select':
      case 'filament:material.calibration.save':
      case 'filament:material.calibration.delete': {
        return status?.calibrationVersion === undefined
          ? unavailable('MACHINE_ACTION_UNSUPPORTED', 'This printer’s firmware keeps no pressure-advance profiles.')
          : undefined;
      }
      default: {
        return undefined;
      }
    }
  };

  const availability = (): readonly MachineAvailability[] =>
    manifest.actions.map(
      ({ componentId, id }) => unavailableBecause(componentId, id) ?? { componentId, id, state: 'available' },
    );

  const report = (): MachineReport => ({
    connection: link.connected() && !closed ? 'connected' : 'disconnected',
    observedAt: statusAt ?? now(),
    state: machineStatus(),
    ...definedFields({ run: runOf() }),
    components: components(),
    activities: activities(),
    checks: checks(),
    availability: availability(),
    alerts: status?.alerts ?? [],
  });

  /** Publish the report to observers: a `changed` delta when only component readings moved. */
  const emit = (): void => {
    const next = report();
    const previous = lastEmitted;
    lastEmitted = next;
    const rest = ({ components: _components, observedAt: _observedAt, ...others }: MachineReport): string =>
      JSON.stringify(others);
    const observation: MachineObservation =
      previous !== undefined && rest(previous) === rest(next)
        ? { type: 'changed', observedAt: next.observedAt, components: next.components }
        : { type: 'snapshot', snapshot: next };
    updates.dispatchEvent(new CustomEvent('observation', { detail: observation }));
  };

  // ───────────── Opening ─────────────

  try {
    await send(bambuPushAll);
    await send(bambuGetVersion);
    if (!status || !firmware || !versionSerial) {
      await new Promise<void>((resolve) => {
        const openTimer = setTimeout(finish, input.openWindow ?? 15_000);
        function finish(): void {
          clearTimeout(openTimer);
          updates.removeEventListener('facts', observed);
          input.signal.removeEventListener('abort', finish);
          resolve();
        }
        function observed(): void {
          if (status && firmware && versionSerial) {
            finish();
          }
        }
        updates.addEventListener('facts', observed);
        input.signal.addEventListener('abort', finish, { once: true });
        observed();
      });
    }
    input.signal.throwIfAborted();
    if (
      !status ||
      !firmware ||
      versionSerial !== serial ||
      (versionModel !== undefined && versionModel !== model) ||
      (status.model !== undefined && status.model !== model)
    ) {
      throw new BambuProtocolError(
        'BAMBU_INITIAL_FACTS_INVALID',
        'The device at this address is not the bound printer, or did not report its serial, model and firmware.',
      );
    }
  } catch (error) {
    await link.close().catch(() => undefined);
    // A wrong printer at the address and a cancelled open keep their own codes; anything else is the link failing.
    if (input.signal.aborted || (error instanceof BambuProtocolError && error.code === 'BAMBU_INITIAL_FACTS_INVALID')) {
      throw error;
    }
    throw new BambuProtocolError(
      'BAMBU_MQTT_CONNECT_FAILED',
      'Could not connect to the printer. Check that it is on and on this network, then try again.',
    );
  }
  // A printer that pushes only what changes goes quiet while idle; ask for the whole state before it reads as stale.
  const keepFresh = setInterval(() => {
    if (Date.now() - lastReportAt >= quietInterval) {
      void sendQuietly(bambuPushAll);
    }
  }, quietInterval / 2);
  keepFresh.unref();

  // ───────────── Sending ─────────────

  /**
   * Wait for the reply under a sequence, or for a report that settles the command, up to the reply window.
   * @param sequence - The command's `sequence_id`; `undefined` waits on the reports alone.
   * @param settled - Whether the latest report already shows the effect.
   * @param signal - Ends the wait early.
   * @returns The reply, if one came.
   */
  const waitForReply = async (
    sequence: string | undefined,
    settled: () => boolean,
    signal: AbortSignal,
  ): Promise<BambuReply | undefined> => {
    if ((sequence === undefined || !replies.has(sequence)) && !settled()) {
      await new Promise<void>((resolve) => {
        const eventName = `reply:${sequence ?? ''}`;
        const replyTimer = setTimeout(finish, replyWindow);
        function finish(): void {
          clearTimeout(replyTimer);
          updates.removeEventListener(eventName, finish);
          updates.removeEventListener('facts', observed);
          signal.removeEventListener('abort', finish);
          resolve();
        }
        function observed(): void {
          if (settled()) {
            finish();
          }
        }
        if (sequence !== undefined) {
          updates.addEventListener(eventName, finish, { once: true });
        }
        updates.addEventListener('facts', observed);
        signal.addEventListener('abort', finish, { once: true });
      });
    }
    return sequence === undefined ? undefined : replies.get(sequence);
  };

  const remember = (operationId: string, entry: LedgerEntry): void => {
    ledger.set(operationId, entry);
    if (ledger.size > ledgerCapacity) {
      ledger.delete(ledger.keys().next().value!);
    }
  };

  const rejected = (code: string, message: string): MachineCommandReceipt => ({
    status: 'rejected',
    code,
    message,
    observedAt: now(),
  });

  const unauthorizedReceipt = (): MachineCommandReceipt =>
    rejected('MACHINE_ACTION_PROVIDER_REJECTED', 'The printer refused the command because Developer Mode is off.');

  type Planned = Readonly<{ request: BambuRequest; after?: () => void }> | ReturnType<typeof refusal>;

  /** Build the one command for an admitted action, re-checking what only the latest report can tell. */
  // oxlint-disable-next-line eslint/complexity -- one dispatch over the declared actions.
  const plan = (action: MachineProviderActionInput, sequence: string): Planned => {
    const parameters: Readonly<Record<string, unknown>> = isRecord(action.parameters) ? action.parameters : {};
    const slotParameter = (value: unknown): number | undefined => {
      const address = bambuSlotSchema.safeParse(value);
      return address.success ? bambuSlotOf(address.data) : undefined;
    };
    const invalid = refusal('MACHINE_ACTION_PARAMETERS_INVALID', 'This printer has no such slot.');
    // The host validated the parameters; the wire-bound ones are parsed again here, so nothing unchecked is sent.
    const malformed = refusal('MACHINE_ACTION_PARAMETERS_INVALID', 'The parameters do not fit this control.');
    switch (actionKey(action.componentId, action.action)) {
      case 'chamber-light:switch.set': {
        return { request: bambuChamberLight(sequence, parameters['on'] === true) };
      }
      case 'speed:option.set': {
        const speed = bambuSpeedSchema.safeParse(action.parameters);
        return speed.success ? { request: bambuPrintSpeed(sequence, speed.data.option) } : malformed;
      }
      case 'controller:run.pause':
      case 'controller:run.resume':
      case 'controller:run.cancel': {
        if (!isLive(status) || action.expectedRunId !== runIdOf(status)) {
          return refusal('MACHINE_ACTION_STALE_RUN', 'The run you saw has ended or changed.');
        }
        const command = action.action === 'run.pause' ? 'pause' : action.action === 'run.resume' ? 'resume' : 'stop';
        const runId = runIdOf(status);
        return {
          request: bambuRunCommand(sequence, command),
          after: () => {
            if (command === 'pause') {
              agentPause =
                action.requestedBy.kind === 'agent'
                  ? { runId, shown: false, until: Date.now() + replyWindow }
                  : undefined;
            }
          },
        };
      }
      case 'part-fan:level.set':
      case 'aux-fan:level.set':
      case 'chamber-fan:level.set': {
        return {
          request: bambuFanLevel(
            sequence,
            action.componentId as keyof typeof bambuFanIndexes,
            Number(parameters['ratio']),
          ),
        };
      }
      case 'filament:material.load': {
        const slot = slotParameter(parameters['slot']);
        if (slot === undefined || parameters['toolheadId'] !== 'tool-0') {
          return invalid;
        }
        if (isFilamentBusy(status)) {
          return refusal('MACHINE_ACTION_BUSY', 'Wait for the filament system to finish.');
        }
        if (trayOf(slot)?.state === 'empty') {
          return refusal('MACHINE_ACTION_PRECONDITION_FAILED', 'The selected slot is empty.');
        }
        if (status?.currentMaterialSlot === slot) {
          return refusal('MACHINE_ACTION_PRECONDITION_FAILED', 'That slot is already loaded.');
        }
        const current = status?.currentMaterialSlot === undefined ? undefined : trayOf(status.currentMaterialSlot);
        return {
          request: bambuLoad(sequence, {
            slot,
            form: input.form,
            currentTemperature: bambuChangeTemperature(current),
            targetTemperature: bambuChangeTemperature(trayOf(slot)),
          }),
        };
      }
      case 'filament:material.unload': {
        const slot = slotParameter(parameters['slot']);
        if (slot === undefined || parameters['toolheadId'] !== 'tool-0') {
          return invalid;
        }
        if (isFilamentBusy(status)) {
          return refusal('MACHINE_ACTION_BUSY', 'Wait for the filament system to finish.');
        }
        if (status?.currentMaterialSlot !== slot) {
          return refusal('MACHINE_ACTION_PRECONDITION_FAILED', 'The selected slot is not loaded in the extruder.');
        }
        const temperature = Math.max(millimetres(status.nozzleTemperature) ?? 0, 0);
        return {
          request: bambuUnload(sequence, {
            slot,
            form: input.form,
            temperature: temperature >= 180 ? Math.round(temperature) : bambuChangeTemperature(trayOf(slot)),
          }),
        };
      }
      case 'filament:material.set':
      case 'filament:material.clear': {
        const slot = slotParameter(parameters['slot']);
        if (slot === undefined) {
          return invalid;
        }
        const tray = trayOf(slot);
        const allowed = tray === undefined ? undefined : editing(tray);
        if (tray?.tagged === true) {
          return refusal(
            'MACHINE_ACTION_MATERIAL_READ_ONLY',
            'A Bambu spool’s tag identifies this slot, so its material is read-only.',
          );
        }
        if (allowed?.allowed === false) {
          return refusal('MACHINE_ACTION_PRECONDITION_FAILED', allowed.reason ?? 'This slot cannot be edited now.');
        }
        if (action.action === 'material.clear') {
          return { request: bambuMaterialClear(sequence, { slot, form: input.form }) };
        }
        const material = isRecord(parameters['material']) ? parameters['material'] : {};
        const preset = isRecord(material['preset']) ? material['preset'] : {};
        const range = isRecord(material['nozzleTemperature']) ? material['nozzleTemperature'] : {};
        const color = typeof material['color'] === 'string' ? material['color'] : '';
        const minimum = Number(range['min']);
        const maximum = Number(range['max']);
        if (!/^#[0-9A-Fa-f]{8}$/u.test(color) || !(minimum <= maximum) || typeof preset['profileId'] !== 'string') {
          return refusal(
            'MACHINE_ACTION_PARAMETERS_INVALID',
            'The colour must be #RRGGBBAA and the minimum temperature at most the maximum.',
          );
        }
        return {
          request: bambuMaterialSetting(sequence, {
            slot,
            form: input.form,
            material: {
              materialType: String(material['materialType']),
              color,
              profileId: preset['profileId'],
              settingId: typeof preset['settingId'] === 'string' ? preset['settingId'] : '',
              nozzleMinimum: minimum,
              nozzleMaximum: maximum,
            },
          }),
        };
      }
      case 'filament:material.calibration.select': {
        const slot = slotParameter(parameters['slot']);
        if (slot === undefined) {
          return invalid;
        }
        const filamentId = trayOf(slot)?.profileId;
        if (filamentId === undefined) {
          return refusal(
            'MACHINE_ACTION_PRECONDITION_FAILED',
            'Set the slot’s material first: a profile belongs to one filament.',
          );
        }
        const profileId = String(parameters['profileId']);
        const row = table?.rows.find(({ index }) => String(index) === profileId);
        if (profileId !== 'default' && row === undefined) {
          return refusal('MACHINE_ACTION_PRECONDITION_FAILED', 'The printer holds no such profile.');
        }
        if (row !== undefined && row.filamentId !== filamentId) {
          return refusal('MACHINE_ACTION_PRECONDITION_FAILED', 'That profile is for another filament.');
        }
        return {
          request: bambuCalibrationSelect(sequence, {
            slot,
            form: input.form,
            index: row?.index ?? -1,
            filamentId,
            nozzleDiameter: nozzleDiameter(),
          }),
        };
      }
      case 'filament:material.calibration.save': {
        const rows = table?.rows ?? [];
        const capacity = facts.calibrationCapacity;
        if (capacity !== undefined && rows.length >= capacity) {
          return refusal(
            'MACHINE_ACTION_PRECONDITION_FAILED',
            `This printer holds at most ${String(capacity)} profiles per nozzle. Delete one first.`,
          );
        }
        const name = typeof parameters['name'] === 'string' ? parameters['name'] : '';
        if (parameters['source'] === 'manual') {
          const preset = isRecord(parameters['preset']) ? parameters['preset'] : {};
          if (parameters['nozzleId'] !== `nozzle-${String(nozzleDiameter())}`) {
            return refusal('MACHINE_ACTION_PRECONDITION_FAILED', 'That nozzle is not the one installed.');
          }
          return {
            request: bambuCalibrationSave(sequence, {
              form: input.form,
              slot: 0,
              filamentId: String(preset['profileId']),
              settingId: typeof preset['settingId'] === 'string' ? preset['settingId'] : '',
              name,
              pressureAdvance: Number(parameters['pressureAdvance']),
              coefficient: '0.0',
              nozzleDiameter: nozzleDiameter(),
            }),
          };
        }
        if (
          calibration === undefined ||
          calibration.activityId !== parameters['activityId'] ||
          calibration.results === undefined
        ) {
          return refusal(
            'MACHINE_ACTION_PRECONDITION_FAILED',
            'That calibration and its results are no longer on the printer.',
          );
        }
        const result =
          calibration.results[Number(/^result-(\d+)$/u.exec(String(parameters['resultId']))?.[1] ?? 0) - 1];
        if (result === undefined) {
          return refusal('MACHINE_ACTION_PRECONDITION_FAILED', 'The calibration has no such result.');
        }
        if (result.pressureAdvance === undefined) {
          return refusal(
            'MACHINE_ACTION_PRECONDITION_FAILED',
            'A flow-ratio result belongs in the slicer’s filament preset; the printer stores none.',
          );
        }
        if (result.confidence === 'failed') {
          return refusal(
            'MACHINE_ACTION_PRECONDITION_FAILED',
            'This result failed its measurement and cannot be kept.',
          );
        }
        return {
          request: bambuCalibrationSave(sequence, {
            form: input.form,
            slot: result.slot,
            filamentId: result.filamentId,
            settingId: result.settingId,
            name,
            pressureAdvance: result.pressureAdvance,
            coefficient: result.coefficient ?? '0.0',
            nozzleDiameter: nozzleDiameter(),
          }),
        };
      }
      case 'filament:material.calibration.delete': {
        const row = table?.rows.find(({ index }) => String(index) === String(parameters['profileId']));
        if (row === undefined) {
          return refusal('MACHINE_ACTION_PRECONDITION_FAILED', 'The printer holds no such profile.');
        }
        return {
          request: bambuCalibrationDelete(sequence, {
            index: row.index,
            filamentId: row.filamentId,
            nozzleDiameter: nozzleDiameter(),
          }),
        };
      }
      case 'filament:material.calibration.run': {
        const method = parameters['method'] === 'flow-ratio' ? 'flow-ratio' : 'pressure-advance';
        if (method === 'flow-ratio') {
          return refusal(
            'MACHINE_ACTION_UNSUPPORTED',
            facts.flowRatioCalibration
              ? 'Tau cannot keep a flow-ratio result yet: it belongs in the slicer’s filament preset.'
              : 'Only the X1 series measures flow ratio automatically.',
          );
        }
        if (parameters['nozzleId'] !== `nozzle-${String(nozzleDiameter())}`) {
          return refusal('MACHINE_ACTION_PRECONDITION_FAILED', 'That nozzle is not the one installed.');
        }
        if (!facts.fineNozzleCalibration && nozzleDiameter() === 0.2) {
          return refusal(
            'MACHINE_ACTION_PRECONDITION_FAILED',
            'Automatic calibration is unreliable with a 0.2 mm nozzle; calibrate by hand.',
          );
        }
        const filaments: BambuCalibrationFilament[] = [];
        for (const address of Array.isArray(parameters['slots']) ? parameters['slots'] : []) {
          const slot = slotParameter(address);
          const tray = slot === undefined ? undefined : trayOf(slot);
          if (slot === undefined || tray?.materialId === undefined || tray.profileId === undefined) {
            return refusal('MACHINE_ACTION_PRECONDITION_FAILED', 'Every slot to calibrate needs its material set.');
          }
          if (tray.profileId === 'GFU03' || tray.profileId === 'GFU04') {
            return refusal(
              'MACHINE_ACTION_PRECONDITION_FAILED',
              'TPU 90A and TPU 85A are too soft to calibrate automatically.',
            );
          }
          const [nozzle, bed, speed, flowRatio] = bambuGenericPresets[
            tray.materialId.toLowerCase().split('-')[0] ?? ''
          ] ?? [220, 60, 12, 1];
          filaments.push({
            slot,
            filamentId: tray.profileId,
            settingId: tray.settingId ?? '',
            nozzleTemperature: Math.min(Math.max(nozzle, tray.nozzleMinimum ?? nozzle), tray.nozzleMaximum ?? nozzle),
            bedTemperature: bed,
            maximumVolumetricSpeed: speed,
            flowRatio,
          });
        }
        return {
          request: bambuCalibrationRun(sequence, {
            method,
            form: input.form,
            nozzleDiameter: nozzleDiameter(),
            filaments,
          }),
          after: () => {
            requestedCalibration = { method, operationId: action.operationId };
          },
        };
      }
      case 'filament:interaction.respond': {
        const promptId = String(parameters['promptId']);
        if (change?.promptStep === undefined || change.activityId !== parameters['activityId']) {
          return refusal('MACHINE_ACTION_PROMPT_STALE', 'The printer is no longer asking that.');
        }
        const asked = prompt(change);
        if (asked.promptId !== promptId) {
          return answeredPrompts.has(promptId)
            ? refusal('MACHINE_ACTION_PROMPT_CONSUMED', 'That question has been answered.')
            : refusal('MACHINE_ACTION_PROMPT_STALE', 'The printer is asking something else now.');
        }
        if (answeredPrompts.has(promptId)) {
          return refusal('MACHINE_ACTION_PROMPT_CONSUMED', 'That question has been answered.');
        }
        const { answer } = parameters;
        if (!asked.answers.some(({ id }) => id === answer)) {
          return refusal('MACHINE_ACTION_PARAMETERS_INVALID', 'That is not one of the answers.');
        }
        return {
          request: bambuAmsControl(sequence, answer === 'retry' ? 'resume' : 'done'),
          after: () => {
            answeredPrompts.add(promptId);
          },
        };
      }
      case 'filament:bambu.ams.read-tag': {
        const slot = slotParameter(parameters);
        if (slot === undefined) {
          return invalid;
        }
        if (slot === bambuExternalSpoolSlot) {
          return refusal('MACHINE_ACTION_PRECONDITION_FAILED', 'The external spool has no tag reader.');
        }
        if (status?.currentMaterialSlot !== undefined) {
          return refusal(
            'MACHINE_ACTION_PRECONDITION_FAILED',
            'Cannot read filament info: the filament is loaded to the toolhead. Unload it and try again.',
          );
        }
        return { request: bambuReadTag(sequence, { slot, newProtocol: newAmsProtocol(status) }) };
      }
      case 'filament:bambu.filament.abort': {
        return mainOf(status) === amsMain.filamentChange
          ? { request: bambuAmsControl(sequence, 'abort') }
          : refusal('MACHINE_ACTION_PRECONDITION_FAILED', 'No filament change is in progress.');
      }
      case 'motion:motion.home': {
        return { request: bambuHome(sequence) };
      }
      case 'motion:motion.jog': {
        const jog = bambuJogSchema.safeParse(action.parameters);
        return jog.success ? { request: bambuJog(sequence, jog.data) } : malformed;
      }
      case 'controller:bambu.printer.calibrate': {
        const calibrate = bambuCalibrateSchemas[model].safeParse(action.parameters);
        if (!calibrate.success) {
          return malformed;
        }
        return {
          request: bambuPrinterCalibration(sequence, calibrate.data.routines),
          after: () => {
            requestedCalibration = { method: 'printer', operationId: action.operationId };
          },
        };
      }
      default: {
        return refusal('MACHINE_ACTION_UNDECLARED', 'This printer does not declare that action.');
      }
    }
  };

  const confirms = (componentId: string, action: string): MachineManifest['actions'][number]['confirms'] =>
    manifest.actions.find((descriptor) => descriptor.componentId === componentId && descriptor.id === action)
      ?.confirms ?? 'observation';

  /**
   * Admission repeated at the moment of sending, over this session's own latest report: connection, declaration,
   * the session's own availability (Developer Mode, filament busy, `cali_version`), state, the run fence, freshness
   * and interlocks. Who may send was the host's to settle.
   * @param action - The admitted intent.
   * @returns The rejected receipt, or undefined when it may be sent.
   */
  const admit = (action: MachineProviderActionInput): MachineCommandReceipt | undefined => {
    const refused = checkMachineActionAtSend({
      name: input.name,
      capabilities: capabilities(),
      report: report(),
      observations: manifest.observations,
      componentId: action.componentId,
      action: action.action,
      expectedRunId: action.expectedRunId,
      now: Date.parse(now()),
    });
    return refused === undefined ? undefined : rejected(refused.code, refused.message);
  };

  /**
   * The `sequence_id` for one command: the operation's own, moved on past any still in flight, so two operations never
   * read each other's reply. A remembered reply under it is dropped first.
   * @param operationId - The operation sending it.
   * @returns The sequence id.
   */
  const sequenceFor = (operationId: string): string => {
    const inFlight = new Set(
      [...ledger.values()].filter((entry) => entry.receipt === undefined).map((entry) => entry.sequence),
    );
    let sequence = Number(bambuWireSequenceId(operationId));
    while (inFlight.has(String(sequence))) {
      sequence = 30_000 + ((sequence - 30_000 + 1) % 60_000);
    }
    replies.delete(String(sequence));
    return String(sequence);
  };

  /**
   * The answer to an operation id the session has already taken: its receipt, `unknown` while it is still being sent
   * (never a second send), or a conflict when the id was taken for another command.
   * @param existing - The ledger entry under the id.
   * @param key - What the caller is asking for under it.
   * @returns The receipt.
   */
  const replay = (existing: LedgerEntry, key: string): MachineCommandReceipt =>
    existing.key === key
      ? (existing.receipt ?? { status: 'unknown', reason: 'sending', observedAt: now() })
      : rejected('MACHINE_OPERATION_ID_CONFLICT', 'This operation id was used for another command.');

  const apply = async (action: MachineProviderActionInput): Promise<MachineCommandReceipt> => {
    const key = actionKey(action.componentId, action.action);
    const existing = ledger.get(action.operationId);
    if (existing !== undefined) {
      return replay(existing, key);
    }
    const refused = admit(action);
    if (refused !== undefined) {
      return refused;
    }
    action.signal.throwIfAborted();
    const sequence = sequenceFor(action.operationId);
    const planned = plan(action, sequence);
    if ('refused' in planned) {
      return rejected(planned.refused.code, planned.refused.message);
    }
    const entry: LedgerEntry = {
      kind: 'action',
      key,
      sequence,
      command: planned.request.command,
      sawActivity: false,
      ...definedFields({ tableVersion: status?.calibrationVersion }),
    };
    remember(action.operationId, entry);
    try {
      await send(planned.request);
    } catch {
      entry.receipt = { status: 'unknown', reason: 'publish-result-unknown', observedAt: now() };
      return entry.receipt;
    }
    planned.after?.();
    emit();
    const acknowledged = confirms(action.componentId, action.action) === 'acknowledgement';
    // An observation-confirmed action stops waiting as soon as a report shows its effect: many commands get no reply.
    const shown = (): boolean => !acknowledged && confirm(action).status === 'confirmed';
    const reply = await waitForReply(sequence, shown, action.signal);
    if (!acknowledged && reply?.result === 'fail' && !reply.unauthorized) {
      // A reply is a hint for these: the report decides. Keep what the printer said.
      await input
        .log({
          level: 'warning',
          message: `${planned.request.command} ${sequence} replied fail: ${(reply.reason ?? 'no reason').slice(0, 200)}`,
        })
        .catch(() => undefined);
    }
    entry.receipt =
      reply === undefined
        ? shown()
          ? { status: 'accepted', observedAt: now() }
          : { status: 'unknown', reason: 'no-reply', observedAt: now() }
        : reply.unauthorized
          ? unauthorizedReceipt()
          : acknowledged && reply.result === 'fail'
            ? rejected('MACHINE_ACTION_PROVIDER_REJECTED', reply.reason ?? 'The printer refused the command.')
            : { status: 'accepted', observedAt: now() };
    if (key === 'controller:run.pause' && entry.receipt.status !== 'accepted' && agentPause?.shown === false) {
      agentPause = undefined;
    }
    return entry.receipt;
  };

  // oxlint-disable-next-line eslint/complexity -- one dispatch over the declared actions.
  const confirm = (action: Omit<MachineProviderActionInput, 'signal'>): MachineActionConfirmation => {
    const entry = ledger.get(action.operationId);
    // An operation this session never sent (one replayed after a restart) is pending: the current report cannot say
    // whether it reached the printer, so a person reconciles it (contract R1).
    if (entry === undefined) {
      return { status: 'pending' };
    }
    if (entry.receipt?.status === 'rejected') {
      return { status: 'refuted', code: entry.receipt.code, message: entry.receipt.message };
    }
    const parameters: Readonly<Record<string, unknown>> = isRecord(action.parameters) ? action.parameters : {};
    const address = bambuSlotSchema.safeParse(parameters['slot']);
    const slot = address.success ? bambuSlotOf(address.data) : undefined;
    const tray = slot === undefined ? undefined : trayOf(slot);
    const confirmed = { status: 'confirmed' } as const;
    const pending = { status: 'pending' } as const;
    const when = (shown: boolean): MachineActionConfirmation => (shown ? confirmed : pending);
    const main = mainOf(status);
    const tableAfterSend = table?.version !== undefined && table.version !== entry.tableVersion;
    switch (actionKey(action.componentId, action.action)) {
      case 'chamber-light:switch.set': {
        return when(status?.chamberLight === (parameters['on'] === true ? 'on' : 'off'));
      }
      case 'speed:option.set': {
        return when(status?.speedProfile === parameters['option']);
      }
      case 'controller:run.pause':
      case 'controller:run.resume': {
        if (!isLive(status) || runIdOf(status) !== action.expectedRunId) {
          return {
            status: 'refuted',
            code: 'MACHINE_ACTION_STALE_RUN',
            message: 'The run ended before the printer showed the change.',
          };
        }
        return when(action.action === 'run.pause' ? status?.gcodeState === 'PAUSE' : status?.gcodeState !== 'PAUSE');
      }
      case 'controller:run.cancel': {
        return when(!isLive(status) || runIdOf(status) !== action.expectedRunId);
      }
      case 'part-fan:level.set':
      case 'aux-fan:level.set':
      case 'chamber-fan:level.set': {
        const percent = {
          'part-fan': status?.partFanPercent,
          'aux-fan': status?.auxiliaryFanPercent,
          'chamber-fan': status?.chamberFanPercent,
        }[action.componentId];
        return when(percent !== undefined && Math.abs(percent / 100 - Number(parameters['ratio'])) <= 1 / 15 + 0.001);
      }
      case 'filament:material.load': {
        if (!isFilamentBusy(status) && status?.currentMaterialSlot === slot && slot !== undefined) {
          return confirmed;
        }
        return entry.sawActivity && !isFilamentBusy(status)
          ? {
              status: 'refuted',
              code: 'MACHINE_ACTION_ABORTED',
              message: 'The load ended without the filament reaching the nozzle.',
            }
          : pending;
      }
      case 'filament:material.unload': {
        if (!isFilamentBusy(status) && status?.currentMaterialSlot === undefined) {
          return confirmed;
        }
        return entry.sawActivity && !isFilamentBusy(status)
          ? {
              status: 'refuted',
              code: 'MACHINE_ACTION_ABORTED',
              message: 'The unload ended with filament still in the extruder.',
            }
          : pending;
      }
      case 'filament:material.set': {
        const material = isRecord(parameters['material']) ? parameters['material'] : {};
        const preset = isRecord(material['preset']) ? material['preset'] : {};
        const range = isRecord(material['nozzleTemperature']) ? material['nozzleTemperature'] : {};
        return when(
          tray !== undefined &&
            tray.materialId === material['materialType'] &&
            tray.profileId === preset['profileId'] &&
            tray.color === String(material['color']).toUpperCase() &&
            (tray.nozzleMinimum === undefined || tray.nozzleMinimum === Math.round(Number(range['min']))) &&
            (tray.nozzleMaximum === undefined || tray.nozzleMaximum === Math.round(Number(range['max']))) &&
            (tray.settingId === undefined || tray.settingId === (preset['settingId'] ?? '')),
        );
      }
      case 'filament:material.clear': {
        return when(tray !== undefined && tray.materialId === undefined);
      }
      case 'filament:material.calibration.select': {
        const profileId = String(parameters['profileId']);
        return when(tray?.calibrationIndex === (profileId === 'default' ? -1 : Number(profileId)));
      }
      case 'filament:material.calibration.save': {
        const name = String(parameters['name']);
        return when(tableAfterSend && table?.rows.some((row) => row.name === name) === true);
      }
      case 'filament:material.calibration.delete': {
        return when(
          tableAfterSend && table?.rows.some((row) => String(row.index) === String(parameters['profileId'])) === false,
        );
      }
      case 'filament:material.calibration.run':
      case 'controller:bambu.printer.calibrate': {
        return when(calibration?.operationId === action.operationId);
      }
      case 'filament:interaction.respond': {
        return when(change?.promptStep === undefined || prompt(change).promptId !== parameters['promptId']);
      }
      case 'filament:bambu.ams.read-tag': {
        return when(entry.sawActivity && main !== amsMain.readingTag);
      }
      case 'filament:bambu.filament.abort': {
        return when(main !== amsMain.filamentChange);
      }
      default: {
        return pending;
      }
    }
  };

  // ───────────── Stop, jobs and reconciliation ─────────────

  /** The run a start produced: its `subtask_id` is the operation's wire id, or a live run carries the name it sent. */
  const startedRunId = (operationId: string, transferId?: string): string | undefined => {
    const wireId = bambuWireId(operationId);
    const runName =
      startRunNames.get(operationId) ??
      (transferId !== undefined && remoteNamePattern.test(transferId)
        ? transferId.replace('.gcode.3mf', '')
        : undefined);
    const isOurs =
      status?.providerRunId === wireId || (isLive(status) && runName !== undefined && status?.runName === runName);
    return isOurs ? runIdOf(status) : undefined;
  };

  /**
   * Nothing left running: no print and no filament procedure (`gcode_state` stays IDLE through a load or tag read).
   * @returns Whether the latest report shows the printer stopped.
   */
  const stopped = (): boolean => !isLive(status) && !isFilamentBusy(status);

  const stop: MachineSession<BambuSubmission>['stop'] = async (stopInput) => {
    const existing = ledger.get(stopInput.operationId);
    if (existing?.kind === 'stop' && existing.receipt !== undefined) {
      return existing.receipt;
    }
    const sequence = sequenceFor(stopInput.operationId);
    const entry: LedgerEntry = { kind: 'stop', key: 'stop', sequence, command: 'stop', sawActivity: false };
    remember(stopInput.operationId, entry);
    // Outside a print, `stop` does not end a filament procedure. Bambu Studio's Stop for a filament change sends
    // `ams_control abort` (StatusPanel.cpp:2783-2786, DeviceManager.cpp:1763-1775); a tag read has no abort and ends
    // by itself. Either way only a report that shows the AMS idle proves the stop.
    const procedure = !isLive(status) && isFilamentBusy(status);
    const aborting = procedure && mainOf(status) === amsMain.filamentChange;
    try {
      await send(bambuRunCommand(sequence, 'stop'));
      if (aborting) {
        await send(bambuAmsControl(sequenceFor(`${stopInput.operationId}:abort`), 'abort'));
      }
    } catch {
      entry.receipt = { status: 'unknown', reason: 'publish-result-unknown', observedAt: now() };
      return entry.receipt;
    }
    // During a procedure the reply to `stop` proves nothing, so wait on the report alone.
    await waitForReply(procedure ? undefined : sequence, stopped, stopInput.signal);
    const stopReply = replies.get(sequence);
    entry.receipt =
      stopReply?.unauthorized === true
        ? unauthorizedReceipt()
        : stopped()
          ? { status: 'accepted', observedAt: now() }
          : isFilamentBusy(status)
            ? { status: 'unknown', reason: 'reply-lost-after-possible-acceptance', observedAt: now() }
            : stopReply?.result === 'success'
              ? { status: 'accepted', observedAt: now() }
              : stopReply?.result === 'fail'
                ? rejected('MACHINE_ACTION_PROVIDER_REJECTED', stopReply.reason ?? 'The printer refused to stop.')
                : { status: 'unknown', reason: 'reply-lost-after-possible-acceptance', observedAt: now() };
    return entry.receipt;
  };

  /** A plate name from a file or the printer as its manifest id, so `hot_plate` and `high-temperature` agree. */
  const plateIdOf = (name: string | undefined): string | undefined =>
    name === undefined ? undefined : (bambuPlateForBedType(name, printer)?.id ?? name);

  /**
   * The loaded tray of a filament's material nearest its colour; the current tray wins a tie. An AMS tray comes before
   * the external spool, whose holder cannot report a spool and only remembers a setting, unless the extruder is fed
   * from the external spool now.
   * @param filament - A filament the plate prints.
   * @returns Its slot, or `undefined` when no loaded tray holds its material.
   */
  const nearestTray = (filament: BambuSlicedFilament): number | undefined =>
    trays()
      .filter((tray) => tray.state === 'loaded' && tray.materialId?.toLowerCase() === filament.type.toLowerCase())
      .map((tray) => ({
        slot: tray.slot,
        remembered: tray.slot === bambuExternalSpoolSlot && status?.currentMaterialSlot !== bambuExternalSpoolSlot,
        distance: colorDistance(tray.color, filament.color) ?? 0,
        current: tray.slot === status?.currentMaterialSlot,
      }))
      .sort(
        (left, right) =>
          Number(left.remembered) - Number(right.remembered) ||
          left.distance - right.distance ||
          Number(right.current) - Number(left.current),
      )[0]?.slot;

  /**
   * Complete a partial start form, in this provider's own keys. What the file was sliced for (model, nozzle, filament
   * diameter, plate, each filament's material) comes from the file, never from the printer, so a check cannot compare
   * the printer with itself. The printer fills only what the file cannot say: each printed filament's slot (a loaded
   * tray of its material, nearest in colour; `-1` when none holds it, which the check blocks) and Bambu Studio's
   * defaults (bed levelling and flow calibration on, timelapse off). A stated mapping, plate or option wins. Read-only.
   * @param input - The partial form and the program it is for.
   * @returns The completed form.
   */
  const completeConfiguration: NonNullable<MachineJobs['completeConfiguration']> = async ({
    artifact: reference,
    configuration,
    signal,
  }) => {
    signal.throwIfAborted();
    const given = isFields(configuration) ? configuration : {};
    let slice: BambuPreparedArtifact['slice'];
    try {
      ({ slice } = await input.readArtifact(reference, signal));
    } catch {
      // Refused as preparation refuses it, so the job fails with the same code wherever the file is first read.
      throw new BambuProtocolError('MACHINE_JOB_ARTIFACT_INVALID', 'The artifact failed bounded verification.');
    }
    const mapping = given['amsMapping'];
    const amsMapping = Array.isArray(mapping)
      ? // A hole stays a hole (-1, no slot): dropping it would move every later filament onto another's slot.
        mapping.map((slot) => (typeof slot === 'number' ? slot : -1))
      : slice.filaments.map((filament) => (filament.used ? (nearestTray(filament) ?? -1) : -1));
    const chosen = Object.fromEntries(Object.entries(given).filter(([key]) => !key.startsWith('expected')));
    return {
      bedLeveling: true,
      flowCalibration: true,
      timelapse: false,
      ...chosen,
      amsMapping,
      ...definedFields({
        expectedModel: slice.printerModel === facts.sliceName ? model : undefined,
        expectedNozzleDiameter: slice.nozzleDiameter,
        expectedFilamentDiameter: slice.filaments.find(({ used }) => used)?.diameter,
        expectedBedType: plateIdOf(slice.bedType),
      }),
      expectedMaterials: slice.filaments.flatMap((filament, index) => {
        const slot = amsMapping[index];
        return filament.used && slot !== undefined && slot >= 0 ? [{ slot, materialId: filament.type }] : [];
      }),
    };
  };

  const prepare: MachineJobs['prepare'] = async (jobInput): Promise<MachinePreparation> => {
    const refused = (code: MachineJobFailureCode, message: string): MachinePreparation => ({
      status: 'refused',
      code,
      message,
      observedAt: now(),
    });
    if (jobInput.expectedMachineId !== serial) {
      return refused('MACHINE_JOB_IDENTITY_MISMATCH', 'The prepared machine identity changed.');
    }
    let artifact: BambuPreparedArtifact;
    try {
      artifact = await input.readArtifact(jobInput.artifact, jobInput.signal);
    } catch {
      return refused('MACHINE_JOB_ARTIFACT_INVALID', 'The artifact failed bounded verification.');
    }
    const { configuration } = jobInput;
    const { slice } = artifact;
    const installedPlate = status?.bedType ?? configuration.operatorConfirmedBedType;
    const observedModel = status?.model ?? model;
    const printed = slice.filaments.flatMap((filament, index) =>
      filament.used ? [{ ...filament, slot: configuration.amsMapping[index] ?? -1 }] : [],
    );
    const external = printed.some(({ slot }) => slot === bambuExternalSpoolSlot);
    // A slot counts only when it reports a spool of the material: an empty tray may still name its last material.
    const unmatched = printed.find(({ type, slot }) => {
      const tray = trayOf(slot);
      return tray?.state !== 'loaded' || tray.materialId?.toLowerCase() !== type.toLowerCase();
    });
    const computed = (
      id: string,
      label: string,
      { passed, detail, remedy }: Readonly<{ passed: boolean; detail: string; remedy?: MachineCheck['remedy'] }>,
    ): MachineCheck => ({
      id,
      label,
      state: passed ? 'passed' : 'blocked',
      source: 'computed',
      ...(passed ? {} : { detail, ...(remedy ? { remedy } : {}) }),
    });
    // A fact the file does not state blocks its check: the printer cannot stand in for it.
    const reslice: MachineCheck['remedy'] = {
      type: 'person',
      instruction: `Slice it in Bambu Studio for this ${observedModel}, then send it again.`,
    };
    const unstated = (fact: string): string => `The file does not say which ${fact} it was sliced for.`;
    const printerChecks: MachineCheck[] = [
      computed('model', 'Sliced for this printer', {
        passed: slice.printerModel === facts.sliceName,
        detail:
          slice.printerModel === undefined
            ? unstated('printer')
            : `The file was sliced for a ${slice.printerModel}; this printer is an ${observedModel}.`,
        remedy: reslice,
      }),
      computed('nozzle', 'Nozzle matches the slice', {
        passed:
          slice.nozzleDiameter !== undefined &&
          sameDiameter(status?.nozzleDiameter, slice.nozzleDiameter) &&
          printed.length > 0 &&
          printed.every(({ diameter }) => diameter === 1.75),
        // The first reason that holds, so a missing fact is never told as a mismatch.
        detail:
          slice.nozzleDiameter === undefined
            ? unstated('nozzle')
            : printed.length === 0 || printed.some(({ diameter }) => diameter === undefined)
              ? unstated('filament diameter')
              : status?.nozzleDiameter === undefined
                ? 'The printer has not reported its nozzle.'
                : sameDiameter(status.nozzleDiameter, slice.nozzleDiameter)
                  ? 'The file was sliced for filament other than 1.75 mm.'
                  : `The file was sliced for a ${String(slice.nozzleDiameter)} mm nozzle; this printer has a ${String(nozzleDiameter())} mm nozzle.`,
        remedy: reslice,
      }),
      computed('plate', 'Build plate matches the slice', {
        passed:
          slice.bedType !== undefined &&
          installedPlate !== undefined &&
          plateIdOf(installedPlate) === plateIdOf(slice.bedType),
        detail:
          slice.bedType === undefined
            ? unstated('build plate')
            : installedPlate === undefined
              ? 'Say which plate is on the printer.'
              : `Put the ${slice.bedType} the file was sliced for on the printer.`,
        remedy:
          slice.bedType === undefined
            ? reslice
            : { type: 'person', instruction: `Put the ${slice.bedType} on the printer.` },
      }),
      computed('filament', 'Filament matches the plate', {
        passed: printed.length > 0 && unmatched === undefined && (!external || printed.length === 1),
        detail:
          printed.length === 0
            ? unstated('filament')
            : external && printed.length > 1
              ? 'The external spool can only feed a one-filament print. Map every filament to an AMS slot.'
              : unmatched === undefined || unmatched.slot < 0
                ? `Load ${unmatched?.type ?? 'the filament'} into a slot and map the filament to it.`
                : trayOf(unmatched.slot)?.state === 'loaded'
                  ? `The slot mapped to the ${unmatched.type} filament holds ${trayOf(unmatched.slot)?.materialId ?? 'nothing'}.`
                  : `No spool is reported in the slot mapped to the ${unmatched.type} filament.`,
        remedy: printed.length === 0 ? reslice : { type: 'action', componentId: 'filament', action: 'material.set' },
      }),
      ...(input.requireBambuStudio
        ? [
            computed('producer', 'Sliced by Bambu Studio', {
              passed: artifact.producer?.name === 'Bambu Studio',
              detail:
                'Slice it with Bambu Studio in Tau (desktop app with Bambu Studio installed), then send it again.',
            }),
          ]
        : []),
      {
        id: 'idle',
        label: 'Printer idle',
        state: machineStatus().status === 'ready' ? 'passed' : 'blocked',
        source: 'observed',
        ...(machineStatus().status === 'ready' ? {} : { detail: 'Wait until the printer is idle.' }),
      },
      ...checks(),
    ];
    const layers = /^; total layer number: (\d+)$/mu.exec(
      new TextDecoder().decode(artifact.plate.subarray(0, 4096)),
    )?.[1];
    return {
      status: printerChecks.some((item) => item.state === 'blocked') ? 'blocked' : 'ready',
      program: {
        name: jobInput.artifact.path.split('/').at(-1) ?? jobInput.artifact.path,
        ...(artifact.producer === undefined
          ? {}
          : { producer: { name: artifact.producer.name, ...definedFields({ version: artifact.producer.version }) } }),
        facts: { process: 'fff', ...(layers === undefined ? {} : { layers: Number(layers) }) },
      },
      checks: printerChecks,
      setup: {
        model: observedModel,
        firmware: firmware ?? 'unknown',
        nozzle: nozzleDiameter(),
        bedType: installedPlate ?? 'unknown',
        materials: printed.map(({ slot }) => ({
          slot,
          materialId: trayOf(slot)?.materialId ?? 'unknown',
          profileId: trayOf(slot)?.profileId ?? 'unknown',
        })),
      },
      remoteName: bambuRemoteName(jobInput.operationId),
      parser: artifact.parser,
      providerData: { memberMd5: artifact.memberMd5 },
      observedAt: now(),
    };
  };

  const transfer: StoredJobs['transfer'] = async (jobInput) => {
    const existing = ledger.get(jobInput.operationId);
    if (existing !== undefined) {
      return replay(existing, 'transfer');
    }
    if (!link.connected() || closed) {
      return rejected('MACHINE_UNAVAILABLE', 'The printer is not connected.');
    }
    const providerRecord = isRecord(jobInput.providerData) ? jobInput.providerData : undefined;
    if (jobInput.expectedMachineId !== serial || !remoteNamePattern.test(jobInput.remoteName)) {
      return rejected('MACHINE_JOB_PREPARATION_INVALID', 'The prepared artifact identity is invalid.');
    }
    // Taken before the first wait, so a second call under this id while the file is read finds it.
    const entry: LedgerEntry = {
      kind: 'transfer',
      key: 'transfer',
      sequence: '',
      command: 'upload',
      sawActivity: false,
    };
    remember(jobInput.operationId, entry);
    let artifact: BambuPreparedArtifact;
    try {
      artifact = await input.readArtifact(jobInput.artifact, jobInput.signal);
    } catch {
      entry.receipt = rejected('MACHINE_JOB_ARTIFACT_INVALID', 'The artifact failed bounded verification.');
      return entry.receipt;
    }
    if (providerRecord?.['memberMd5'] !== artifact.memberMd5) {
      entry.receipt = rejected('MACHINE_JOB_PREPARATION_INVALID', 'The artifact changed since it was prepared.');
      return entry.receipt;
    }
    let written: number;
    try {
      written = await input.upload({ remoteName: jobInput.remoteName, artifact, signal: jobInput.signal });
    } catch (error) {
      // A refusal the transfer itself names ends it; anything else may have written, so the result is unknown.
      if (error instanceof BambuProtocolError && bambuTransferRefusals.has(error.code)) {
        entry.receipt = rejected(
          error.code,
          error.code === 'MACHINE_TRANSFER_STORAGE_FULL'
            ? 'Printer storage is full.'
            : 'The transfer did not complete.',
        );
        return entry.receipt;
      }
      // The host's transport errors name the failure, never the access code.
      const code = error instanceof Error ? error.message : '';
      await input
        .log({ level: 'warning', message: `FTPS upload of ${jobInput.remoteName} failed: ${code.slice(0, 200)}` })
        .catch(() => undefined);
      entry.receipt = { status: 'unknown', reason: 'transfer-result-unavailable', observedAt: now() };
      return entry.receipt;
    }
    entry.receipt =
      written === artifact.length
        ? // The printer holds exactly one object per remote name, so the name is the transfer evidence.
          { status: 'accepted', transferId: jobInput.remoteName, observedAt: now() }
        : rejected('MACHINE_TRANSFER_PARTIAL', 'The transfer ended before the whole artifact was written.');
    return entry.receipt;
  };

  const start: StoredJobs['start'] = async (jobInput) => {
    const existing = ledger.get(jobInput.operationId);
    if (existing !== undefined) {
      return replay(existing, 'start');
    }
    // Nothing is sent over a link that is down, so the start is refused rather than left unknown.
    if (!link.connected() || closed) {
      return rejected('MACHINE_UNAVAILABLE', 'The printer is not connected.');
    }
    const providerRecord = isRecord(jobInput.providerData) ? jobInput.providerData : undefined;
    const memberMd5 = providerRecord?.['memberMd5'];
    if (
      jobInput.expectedMachineId !== serial ||
      !remoteNamePattern.test(jobInput.remoteName) ||
      jobInput.transferId !== jobInput.remoteName ||
      typeof memberMd5 !== 'string' ||
      !memberMd5Pattern.test(memberMd5)
    ) {
      return rejected('MACHINE_JOB_PREPARATION_INVALID', 'The prepared artifact identity or provider data is invalid.');
    }
    if (developerMode() === 'off') {
      return rejected(
        'MACHINE_ACTION_UNSUPPORTED',
        'This printer ignores commands from Tau until Developer Mode is on.',
      );
    }
    // The setup was checked at preparation; a print started at the screen or from Studio since then is not.
    if (machineStatus().status !== 'ready') {
      return isLive(status)
        ? rejected('MACHINE_ACTION_RUN_ACTIVE', 'The printer is already printing.')
        : rejected('MACHINE_ACTION_BUSY', 'Wait until the printer is idle.');
    }
    if (status?.removableStorage === 'absent') {
      return rejected('MACHINE_JOB_STORAGE_ABSENT', 'Insert the printer’s storage card.');
    }
    const { configuration } = jobInput;
    const wireId = bambuWireId(jobInput.operationId);
    const sequence = sequenceFor(jobInput.operationId);
    const runName = jobInput.remoteName.replace('.gcode.3mf', '');
    startRunNames.set(jobInput.operationId, runName);
    // The external spool prints with the AMS off: firmware takes -1 in `ams_mapping` and holder 255 in
    // `ams_mapping2` for a single-nozzle printer; preparation keeps it to one-filament prints.
    const external = configuration.amsMapping.includes(bambuExternalSpoolSlot);
    const entry: LedgerEntry = { kind: 'start', key: 'start', sequence, command: 'project_file', sawActivity: false };
    remember(jobInput.operationId, entry);
    /* eslint-disable @typescript-eslint/naming-convention -- Bambu wire field names are fixed. */
    const payload = {
      print: {
        command: 'project_file',
        param: jobInput.artifact.selectedMember,
        url: `ftp://${jobInput.remoteName}`,
        file: jobInput.remoteName,
        subtask_name: runName,
        md5: memberMd5,
        flow_cali: configuration.flowCalibration,
        extrude_cali_flag: configuration.flowCalibration ? 1 : 0,
        extrude_cali_manual_mode: 0,
        timelapse: configuration.timelapse,
        bed_leveling: configuration.bedLeveling,
        auto_bed_leveling: configuration.bedLeveling ? 1 : 0,
        vibration_cali: true,
        layer_inspect: facts.layerInspect,
        nozzle_offset_cali: 0,
        bed_type: 'auto',
        use_ams: configuration.amsMapping.length > 0 && !external,
        ams_mapping: external ? configuration.amsMapping.map(() => -1) : configuration.amsMapping,
        ams_mapping2: configuration.amsMapping.map((slot) =>
          external
            ? { ams_id: 255, slot_id: 0 }
            : slot < 0
              ? { ams_id: 255, slot_id: 255 }
              : { ams_id: Math.floor(slot / 4), slot_id: slot % 4 },
        ),
        cfg: '0',
        profile_id: '0',
        project_id: wireId,
        sequence_id: sequence,
        subtask_id: wireId,
        task_id: wireId,
      },
    };
    /* eslint-enable @typescript-eslint/naming-convention -- Bambu wire field section ends. */
    const publishedAt = Date.now();
    try {
      await send(JSON.stringify(payload));
    } catch {
      entry.receipt = { status: 'unknown', reason: 'publish-result-unknown', observedAt: now() };
      return entry.receipt;
    }
    const reply = await waitForReply(sequence, () => startedRunId(jobInput.operationId) !== undefined, jobInput.signal);
    const runId = startedRunId(jobInput.operationId);
    entry.receipt =
      reply?.unauthorized === true
        ? unauthorizedReceipt()
        : reply?.result === 'fail' && runId === undefined
          ? rejected('MACHINE_JOB_PROVIDER_REJECTED', reply.reason ?? 'The printer refused the start.')
          : reply?.result === 'success' || runId !== undefined
            ? {
                status: 'accepted',
                runId: runId ?? (typeof reply?.body['subtask_id'] === 'string' ? reply.body['subtask_id'] : wireId),
                observedAt: now(),
              }
            : { status: 'unknown', reason: 'reply-lost-after-possible-acceptance', runId: wireId, observedAt: now() };
    // Start diagnostics for the host log (blueprint x1c-start-confirmation R7): ids and timings only.
    await input
      .log({
        level: 'info',
        message: `Start ${wireId} ${entry.receipt.status} after ${String(Date.now() - publishedAt)} ms; printer ${status?.gcodeState ?? 'unreported'}, run id ${status?.providerRunId === wireId ? 'matches' : 'differs'}.`,
      })
      .catch(() => undefined);
    return entry.receipt;
  };

  const reconcile: MachineSession<BambuSubmission>['reconcile'] = async (reconcileInput) => {
    const entry = ledger.get(reconcileInput.operationId);
    if (reconcileInput.kind === 'start') {
      const runId = startedRunId(reconcileInput.operationId, reconcileInput.transferId);
      if (runId !== undefined) {
        return { status: 'accepted', runId, observedAt: statusAt ?? now() };
      }
    }
    // Nothing running is proof enough of a stop, even one sent before a restart left the ledger empty.
    if (reconcileInput.kind === 'stop' && statusAt !== undefined && stopped()) {
      return { status: 'accepted', observedAt: statusAt };
    }
    const kinds: Readonly<Record<string, LedgerEntry['kind']>> = {
      action: 'action',
      stop: 'stop',
      transfer: 'transfer',
      start: 'start',
    };
    return entry !== undefined && entry.kind === kinds[reconcileInput.kind] && entry.receipt !== undefined
      ? entry.receipt
      : { status: 'unknown', reason: 'no-correlated-provider-reply', observedAt: now() };
  };

  // ───────────── The session ─────────────

  const close = async (): Promise<void> => {
    if (closed) {
      return;
    }
    closed = true;
    clearInterval(keepFresh);
    await link.close().catch(() => undefined);
    emit();
  };

  const capabilities = (): MachineProviderDescriptor['capabilities'] => {
    const units = [...amsUnits().map((unit) => bambuAmsUnit(unit)), bambuExternalUnit];
    const diameter = millimetres(status?.nozzleDiameter);
    return {
      connection: manifest.connection,
      axes: manifest.axes,
      components: manifest.components.map((component) => {
        if (component.kind === 'material-system') {
          return { ...component, units, routes: units.map(({ id }) => ({ unitId: id, toolheadIds: ['tool-0'] })) };
        }
        if (component.kind === 'toolhead' && diameter !== undefined) {
          const hardened =
            status?.nozzleType === undefined
              ? component.nozzles[0]?.material === 'hardened'
              : status.nozzleType.includes('hardened');
          return { ...component, nozzles: [bambuNozzle(diameter, hardened)] };
        }
        return component;
      }),
      processes: manifest.processes,
      actions: manifest.actions.map((action) => {
        const profileId = action.qualification.status === 'qualified' ? action.qualification.profileId : undefined;
        const profile = manifest.qualifications.find(({ id }) => id === profileId);
        // A qualification holds for the firmware it was proven on; on any other this printer is untested.
        return profile === undefined || firmware === undefined || profile.firmware.includes(firmware)
          ? action
          : {
              ...action,
              qualification: {
                status: 'designed',
                reason: `Proven on firmware ${profile.firmware.join(', ')}; this printer runs ${firmware}.`,
              } as const,
            };
      }),
      holds: manifest.holds,
      jobs: manifest.jobs,
      stop: manifest.stop,
    };
  };

  return Object.freeze({
    async getDescriptor(descriptorInput) {
      descriptorInput.signal.throwIfAborted();
      return {
        id: serial,
        name: input.name,
        vendor: 'Bambu Lab',
        model,
        firmware: firmware ?? status?.firmware ?? 'unknown',
        capabilities: capabilities(),
      };
    },
    async getSnapshot(snapshotInput) {
      snapshotInput.signal.throwIfAborted();
      return report();
    },
    // The first observation is a snapshot; deltas follow it. Abort ends the stream without throwing.
    async *observe(observeInput) {
      if (observeInput.signal.aborted) {
        return;
      }
      // Subscribe before the snapshot so nothing emitted in between is lost.
      const events = on(updates, 'observation', { signal: observeInput.signal });
      try {
        yield { type: 'snapshot', snapshot: report() } satisfies MachineObservation;
        for await (const [event] of events) {
          yield (event as CustomEvent<MachineObservation>).detail;
        }
      } catch (error) {
        // Abort ends the stream by returning; anything else is a real failure.
        if (!(error instanceof Error && error.name === 'AbortError')) {
          throw error;
        }
      } finally {
        // A subscriber that stops at the snapshot never entered the loop that would close the listener.
        await events.return?.();
      }
    },
    stop,
    actions: { type: 'supported', apply, confirm },
    holds: { type: 'unsupported' },
    jobs: { type: 'supported', delivery: 'stored', completeConfiguration, prepare, transfer, start },
    stillCapture: input.stillCapture,
    reconcile,
    close,
    dispose: close,
  } satisfies MachineSession<BambuSubmission>);
};
