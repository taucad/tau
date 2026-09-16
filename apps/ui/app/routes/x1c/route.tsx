import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Link } from 'react-router';
import {
  Activity,
  Box,
  Camera,
  CircleCheck,
  Clock3,
  Cpu,
  Fan,
  Gauge,
  Layers3,
  Lightbulb,
  LoaderCircle,
  LockKeyhole,
  Pause,
  Printer,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Square,
  Thermometer,
  Timer,
  Wrench,
  Wifi,
} from 'lucide-react';
import type { MachineClient, MachineDirectoryEntry, MachineDirectorySnapshot } from '@taucad/runtime/machine';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Progress } from '@taucad/ui/components/progress';
import { convert, createQuantity, quantityKinds } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';
import { z } from 'zod';
import type { Handle } from '#types/matches.types.js';

export const meta: MetaFunction = () => [
  { title: 'X1C machine console · Tau' },
  {
    name: 'description',
    content: 'A read-only Tau machine console for Bambu Lab X1C status, setup, telemetry, and bounded stills.',
  },
];

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant='ghost'>
        <Link to='/x1c'>X1C</Link>
      </Button>
    );
  },
  enableOverflowY: true,
};

const quantity = (
  input: Readonly<{
    value: number;
    unit: string;
    kind: string;
    space: 'linear' | 'point';
  }>,
): Quantity => {
  const result = createQuantity({ ...input, semanticMode: 'declared-only' });
  if (result.status !== 'success') {
    throw new TypeError('X1C_SAMPLE_QUANTITY_INVALID');
  }
  return result.value;
};

const observedAt = '2026-09-14T00:00:00.000Z';
const sampleEntry: MachineDirectoryEntry = {
  machineId: 'sample-x1c',
  providerId: 'bambu',
  descriptor: {
    id: 'sample-physical-x1c',
    name: 'Workshop X1C',
    vendor: 'Bambu Lab',
    model: 'X1C',
    technology: 'additive.fff',
    firmware: 'sample-firmware',
    accepts: [
      {
        contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
        mediaType: 'application/vnd.bambulab.gcode-3mf',
        requiredMembers: ['Metadata/plate_1.gcode'],
        payloadSelection: 'plate',
        technology: 'additive.fff',
      },
    ],
    operations: ['observe', 'prepare', 'submit', 'pause', 'resume', 'cancel', 'urgent-stop', 'still'],
    ratedEnvelope: { width: 0.256, depth: 0.256, height: 0.256, unit: 'm' },
    printableEnvelope: { width: 0.256, depth: 0.256, height: 0.256, unit: 'm' },
    tools: [
      {
        id: 'tool-0',
        kind: 'extruder',
        nozzleDiameter: quantity({
          value: 0.4,
          unit: 'mm',
          kind: quantityKinds.diameter,
          space: 'linear',
        }),
      },
    ],
    materialSystem: { kind: 'ams', slotCount: 16 },
    bedTypes: ['cool-plate', 'engineering-plate', 'high-temperature-plate', 'textured-plate'],
  },
  snapshot: {
    connection: 'connected',
    readiness: 'busy',
    activeRunId: 'sample-run',
    observedAt,
    setup: {
      toolId: 'tool-0',
      bedType: 'textured-plate',
      materials: [
        { slot: 0, state: 'loaded', materialId: 'PLA' },
        { slot: 1, state: 'loaded', materialId: 'PETG' },
        { slot: 2, state: 'empty' },
        { slot: 3, state: 'loaded', materialId: 'PETG' },
      ],
    },
    run: {
      state: 'printing',
      progress: 42,
      remainingSeconds: 600,
      name: 'Calibration cube',
      file: 'calibration-cube.gcode.3mf',
      currentLayer: 42,
      totalLayers: 100,
      stage: 'Printing',
      printType: 'local',
      speedProfile: 'standard',
      speedPercent: 100,
    },
    temperatures: {
      nozzle: quantity({
        value: 215,
        unit: 'Cel',
        kind: quantityKinds.temperature,
        space: 'point',
      }),
      nozzleTarget: quantity({
        value: 220,
        unit: 'Cel',
        kind: quantityKinds.temperature,
        space: 'point',
      }),
      bed: quantity({
        value: 60,
        unit: 'Cel',
        kind: quantityKinds.temperature,
        space: 'point',
      }),
      bedTarget: quantity({
        value: 65,
        unit: 'Cel',
        kind: quantityKinds.temperature,
        space: 'point',
      }),
      chamber: quantity({
        value: 37,
        unit: 'Cel',
        kind: quantityKinds.temperature,
        space: 'point',
      }),
    },
    fans: { part: 100, auxiliary: 40, chamber: 0 },
    materialSystem: {
      currentSlot: 3,
      targetSlot: 3,
      units: [
        {
          unit: 0,
          humidityIndex: 3,
          temperature: quantity({
            value: 24,
            unit: 'Cel',
            kind: quantityKinds.temperature,
            space: 'point',
          }),
        },
      ],
    },
    network: { wifiSignalDbm: -47 },
    lights: { chamber: 'on' },
    removableStorage: 'present',
    alerts: [],
  },
  freshness: 'current',
};

const freshSampleEntry = (): MachineDirectoryEntry => ({
  ...sampleEntry,
  snapshot: { ...sampleEntry.snapshot, observedAt: new Date().toISOString() },
});

const freshPendingLiveEntry = (): MachineDirectoryEntry => ({
  ...sampleEntry,
  machineId: 'workshop-x1c',
  descriptor: {
    ...sampleEntry.descriptor,
    id: 'workshop-x1c',
    firmware: 'unknown',
  },
  snapshot: {
    connection: 'disconnected',
    readiness: 'unknown',
    observedAt: new Date().toISOString(),
    setup: { materials: [] },
  },
  freshness: 'stale',
});

const sampleDirectory = (): MachineDirectorySnapshot => ({
  cursor: {
    hostId: 'sample-host',
    authorityId: 'sample-authority',
    workspaceId: 'sample-workspace',
    generation: 'sample-generation',
    position: 1,
    revision: 1,
  },
  entries: [freshSampleEntry()],
});

const identity = z.string().min(1).max(256);
const count = z.number().int().min(0);
const envelope = z.strictObject({
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
  unit: z.literal('m'),
});
const admittedQuantity = (input: Readonly<{ kind: string; space: 'linear' | 'point'; unit: string }>) =>
  z.unknown().transform((value, context) => {
    try {
      const candidate = value as Quantity;
      const converted = convert({ quantity: candidate, to: input.unit });
      if (
        converted.status !== 'success' ||
        candidate.kind !== input.kind ||
        candidate.space !== input.space ||
        typeof converted.value.value !== 'number'
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Invalid machine quantity.',
        });
        return z.NEVER;
      }
      return candidate;
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'Invalid machine quantity.',
      });
      return z.NEVER;
    }
  });
const diameter = admittedQuantity({
  kind: quantityKinds.diameter,
  space: 'linear',
  unit: 'mm',
});
const temperature = admittedQuantity({
  kind: quantityKinds.temperature,
  space: 'point',
  unit: 'Cel',
});
const percentage = z.number().min(0).max(100);
const descriptorSchema = z.strictObject({
  name: identity,
  vendor: identity,
  model: identity,
  firmware: identity,
  technology: identity,
  accepts: z
    .array(
      z.strictObject({
        contract: z.strictObject({ id: identity, version: count.min(1) }),
        mediaType: identity,
        requiredMembers: z.array(z.string().min(1).max(512)).max(128),
        payloadSelection: z.enum(['single', 'plate']),
        technology: identity,
      }),
    )
    .max(128),
  operations: z.array(identity).max(128),
  ratedEnvelope: envelope,
  printableEnvelope: envelope,
  tools: z
    .array(
      z.strictObject({
        id: identity,
        kind: identity,
        nozzleDiameter: diameter.optional(),
      }),
    )
    .max(128),
  materialSystem: z.strictObject({ kind: identity, slotCount: count.max(128) }),
  bedTypes: z.array(identity).max(128),
});
const snapshotSchema = z.strictObject({
  connection: z.enum(['connected', 'disconnected', 'unreachable']),
  readiness: z.enum(['busy', 'idle', 'not-ready', 'unknown']),
  activeRunId: identity.optional(),
  observedAt: z.iso.datetime({ offset: true }),
  setup: z.strictObject({
    toolId: identity.optional(),
    bedType: identity.optional(),
    materials: z
      .array(
        z.strictObject({
          slot: count.max(127),
          state: z.enum(['empty', 'loaded', 'unknown']),
          materialId: identity.optional(),
          brand: identity.optional(),
          color: z
            .string()
            .regex(/^#[0-9A-F]{6}$/u)
            .optional(),
          remainingPercent: percentage.optional(),
        }),
      )
      .max(128),
  }),
  run: z
    .strictObject({
      state: z.enum(['failed', 'finishing', 'idle', 'paused', 'preparing', 'printing', 'succeeded', 'unknown']),
      progress: z.number().min(0).max(100).optional(),
      remainingSeconds: count.optional(),
      name: identity.optional(),
      file: identity.optional(),
      currentLayer: count.optional(),
      totalLayers: count.optional(),
      stage: identity.optional(),
      printType: identity.optional(),
      speedProfile: z.enum(['silent', 'standard', 'sport', 'ludicrous', 'unknown']).optional(),
      speedPercent: z.number().min(0).max(1000).optional(),
    })
    .optional(),
  temperatures: z
    .strictObject({
      nozzle: temperature.optional(),
      nozzleTarget: temperature.optional(),
      bed: temperature.optional(),
      bedTarget: temperature.optional(),
      chamber: temperature.optional(),
    })
    .optional(),
  fans: z
    .strictObject({
      part: percentage.optional(),
      auxiliary: percentage.optional(),
      chamber: percentage.optional(),
    })
    .optional(),
  materialSystem: z
    .strictObject({
      currentSlot: count.max(127).optional(),
      targetSlot: count.max(127).optional(),
      units: z
        .array(
          z.strictObject({
            unit: count.max(31),
            humidityIndex: count.max(100).optional(),
            temperature: temperature.optional(),
          }),
        )
        .max(32),
    })
    .optional(),
  network: z.strictObject({ wifiSignalDbm: z.number().min(-150).max(0).optional() }).optional(),
  lights: z.strictObject({ chamber: z.enum(['off', 'on', 'unknown']).optional() }).optional(),
  removableStorage: z.enum(['absent', 'present']).optional(),
  alerts: z
    .array(z.strictObject({ code: identity }))
    .max(128)
    .optional(),
});
const cameraHealthSchema = z.strictObject({
  state: z.enum(['ready', 'recovering', 'starting']),
  startedAt: z.iso.datetime({ offset: true }),
  capturedAt: z.iso.datetime({ offset: true }).optional(),
  failure: z
    .string()
    .regex(/^X1C_[A-Z0-9_]+$/u)
    .optional(),
});
const liveStatusSchema = z
  .strictObject({
    machineId: identity,
    descriptor: descriptorSchema,
    snapshot: snapshotSchema,
    camera: cameraHealthSchema,
  })
  .readonly();

type CameraHealth = z.infer<typeof cameraHealthSchema>;
type StillView = Readonly<{
  url: string;
  capturedAt: string;
  expiresAt: string;
}>;

const liveBridgeOrigin = 'http://127.0.0.1:4174';

const takeLiveGrant = (): string | undefined => {
  const parameters = new URLSearchParams(globalThis.location.hash.replace(/^#/u, ''));
  const grant = parameters.get('live');
  if (!grant || !/^[A-Za-z0-9_-]{43}$/u.test(grant)) {
    return undefined;
  }
  globalThis.history.replaceState(
    globalThis.history.state,
    '',
    `${globalThis.location.pathname}${globalThis.location.search}`,
  );
  return grant;
};

const liveEntry = (input: z.infer<typeof liveStatusSchema>): MachineDirectoryEntry => ({
  machineId: input.machineId,
  providerId: 'bambu',
  descriptor: { id: input.machineId, ...input.descriptor },
  snapshot: input.snapshot,
  freshness: 'current',
});

const createLiveMachineClient = (grant: string, onCameraHealth: (health: CameraHealth) => void): MachineClient => {
  const request = async (path: '/status' | '/still', signal?: AbortSignal): Promise<Response> => {
    const response = await fetch(`${liveBridgeOrigin}${path}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${grant}` },
      mode: 'cors',
      signal,
    });
    if (!response.ok) {
      throw new Error(response.headers.get('x-tau-error') ?? `X1C_LIVE_VIEW_HTTP_${String(response.status)}`);
    }
    return response;
  };
  const get = async (signal?: AbortSignal): Promise<MachineDirectoryEntry> => {
    const response = await request('/status', signal);
    const result = liveStatusSchema.parse(await response.json());
    onCameraHealth(result.camera);
    return liveEntry(result);
  };
  return {
    listProviders: async () => [],
    async *discover() {
      yield* [];
    },
    beginBinding: async () => ({
      status: 'operator-action-required',
      ceremonyId: 'live-read-only',
    }),
    preparePrint: async () => demoOnly(),
    startPrint: async () => demoOnly(),
    reconcileOperation: async () => demoOnly(),
    controlRun: async () => demoOnly(),
    captureStill: async ({ signal }) => {
      const response = await request('/still', signal);
      const capturedAt = response.headers.get('x-tau-captured-at');
      const expiresAt = response.headers.get('x-tau-expires-at');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (
        response.headers.get('content-type') !== 'image/jpeg' ||
        capturedAt === null ||
        expiresAt === null ||
        !Number.isFinite(Date.parse(capturedAt)) ||
        !Number.isFinite(Date.parse(expiresAt)) ||
        bytes.byteLength < 4 ||
        bytes.byteLength > 4 * 1024 * 1024
      ) {
        throw new Error('X1C_LIVE_VIEW_STILL_INVALID');
      }
      return { bytes, mediaType: 'image/jpeg', capturedAt, expiresAt };
    },
    list: async ({ signal }) => {
      const entry = await get(signal);
      return { ...sampleDirectory(), entries: [entry] };
    },
    get: async ({ signal }) => get(signal),
    async *watch({ signal }) {
      await new Promise<void>((resolve) => {
        if (signal?.aborted) {
          resolve();
          return;
        }
        signal?.addEventListener(
          'abort',
          () => {
            resolve();
          },
          { once: true },
        );
      });
      yield* [];
    },
  };
};

const demoOnly = (): never => {
  throw new Error('X1C_DEMO_READ_ONLY');
};

const sampleMachineClient: MachineClient = {
  listProviders: async () => [],
  async *discover() {
    yield* [];
  },
  beginBinding: async () => ({
    status: 'operator-action-required',
    ceremonyId: 'sample-ceremony',
  }),
  preparePrint: async () => demoOnly(),
  startPrint: async () => demoOnly(),
  reconcileOperation: async () => demoOnly(),
  controlRun: async () => demoOnly(),
  captureStill: async ({ signal }) => {
    const response = await fetch('/textures/matcap-sculpt.jpg', { signal });
    if (!response.ok) {
      throw new Error('X1C_DEMO_STILL_UNAVAILABLE');
    }
    const capturedAt = new Date();
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      mediaType: 'image/jpeg',
      capturedAt: capturedAt.toISOString(),
      expiresAt: new Date(capturedAt.getTime() + 15_000).toISOString(),
    };
  },
  list: async () => sampleDirectory(),
  get: async () => freshSampleEntry(),
  async *watch({ signal }) {
    await new Promise<void>((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      signal?.addEventListener(
        'abort',
        () => {
          resolve();
        },
        { once: true },
      );
    });
    yield* [];
  },
};

const runLabel = (entry: MachineDirectoryEntry): string => {
  const state = entry.snapshot.run?.state;
  if (state) {
    return state.charAt(0).toUpperCase() + state.slice(1);
  }
  return entry.snapshot.readiness === 'idle' ? 'Idle' : 'Unknown';
};

const sentence = (value: string): string =>
  value.replaceAll(/[._-]+/gu, ' ').replace(/^./u, (character) => character.toUpperCase());

const displayMachineName = (value: string): string => sentence(value).replaceAll(/\bx1c\b/giu, 'X1C');

const remainingLabel = (seconds: number | undefined): string =>
  seconds === undefined ? '—' : seconds < 60 ? '< 1 min' : `${String(Math.ceil(seconds / 60))} min`;

const slotLabel = (slot: number): string =>
  `${String.fromCodePoint(65 + Math.floor(slot / 4))}${String((slot % 4) + 1)}`;

const materialLabel = (
  material: MachineDirectoryEntry['snapshot']['setup']['materials'][number] | undefined,
): string => {
  if (!material || material.state === 'unknown') {
    return 'Unknown';
  }
  if (material.state === 'empty') {
    return 'None';
  }
  return material.materialId ?? 'Loaded';
};

const quantityValue = (value: Quantity | undefined, unit: string): number | undefined => {
  if (!value) {
    return undefined;
  }
  const converted = convert({ quantity: value, to: unit });
  return converted.status === 'success' && typeof converted.value.value === 'number'
    ? converted.value.value
    : undefined;
};

const friendlyError = (error: unknown): string => {
  const code = error instanceof Error ? error.message : String(error);
  if (/^X1C_CAMERA_(?:WARMING|TLS_TIMEOUT|RTSP_TIMEOUT|FRAME_TIMEOUT|STREAM_ENDED)$/u.test(code)) {
    return 'The chamber camera is reconnecting in the background. Try Capture still again in a moment.';
  }
  if (/^(?:BAMBU_MQTT|X1C_TLS)/u.test(code)) {
    return 'Printer telemetry is reconnecting. The camera remains independent.';
  }
  return code;
};

const formatObservedAt = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));

export default function X1cMachineDemoRoute(): React.JSX.Element {
  const [liveGrant, setLiveGrant] = useState<string>();
  const [entry, setEntry] = useState(sampleEntry);
  const [cameraHealth, setCameraHealth] = useState<CameraHealth>({
    state: 'ready',
    startedAt: observedAt,
    capturedAt: observedAt,
  });
  const [status, setStatus] = useState('Sample telemetry loaded.');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [still, setStill] = useState<StillView>();
  const [captureDuration, setCaptureDuration] = useState<number>();
  const client = useMemo(
    () => (liveGrant ? createLiveMachineClient(liveGrant, setCameraHealth) : sampleMachineClient),
    [liveGrant],
  );
  const live = liveGrant !== undefined;
  const machineName = displayMachineName(entry.descriptor.name);
  const currentRunLabel = runLabel(entry);
  const progress = entry.snapshot.run?.progress;
  const observedMaterials = entry.snapshot.setup.materials;
  const observedSlotCount = Math.max(4, ...observedMaterials.map((material) => material.slot + 1));
  const nozzleTemperature = quantityValue(entry.snapshot.temperatures?.nozzle, 'Cel');
  const bedTemperature = quantityValue(entry.snapshot.temperatures?.bed, 'Cel');
  const chamberTemperature = quantityValue(entry.snapshot.temperatures?.chamber, 'Cel');
  const nozzleTargetTemperature = quantityValue(entry.snapshot.temperatures?.nozzleTarget, 'Cel');
  const bedTargetTemperature = quantityValue(entry.snapshot.temperatures?.bedTarget, 'Cel');
  const nozzleDiameter = quantityValue(entry.descriptor.tools[0]?.nozzleDiameter, 'mm');

  useEffect(() => {
    const grant = takeLiveGrant();
    if (grant) {
      setLiveGrant(grant);
      setEntry(freshPendingLiveEntry());
      setCameraHealth({
        state: 'starting',
        startedAt: new Date().toISOString(),
      });
      setStatus('Connecting to the host-owned X1C session.');
    }
  }, []);

  useEffect(() => {
    if (!still) {
      return;
    }
    const stillExpiryTimer = globalThis.setTimeout(
      () => {
        setStill(undefined);
      },
      Math.max(0, Date.parse(still.expiresAt) - Date.now()),
    );
    return () => {
      globalThis.clearTimeout(stillExpiryTimer);
      URL.revokeObjectURL(still.url);
    };
  }, [still]);

  const refresh = useCallback(
    async (signal?: AbortSignal, announce = true): Promise<void> => {
      if (announce) {
        setIsRefreshing(true);
        setErrorMessage(undefined);
      }
      try {
        setEntry(await client.get({ machineId: entry.machineId, signal }));
        setErrorMessage(undefined);
        setStatus(live ? 'Live machine telemetry is current.' : 'Status refreshed from the sample MachineClient.');
      } catch (error) {
        if (!signal?.aborted) {
          setErrorMessage(friendlyError(error));
        }
      } finally {
        if (announce && !signal?.aborted) {
          setIsRefreshing(false);
        }
      }
    },
    [client, entry.machineId, live],
  );

  useEffect(() => {
    if (!liveGrant) {
      return;
    }
    const controller = new AbortController();
    void refresh(controller.signal);
    const polling = globalThis.setInterval(() => {
      void refresh(controller.signal, false);
    }, 1000);
    return () => {
      globalThis.clearInterval(polling);
      controller.abort();
    };
  }, [liveGrant, refresh]);

  const captureStill = useCallback(
    async (signal?: AbortSignal, announce = true): Promise<void> => {
      const started = globalThis.performance.now();
      if (announce) {
        setIsCapturing(true);
        setErrorMessage(undefined);
      }
      try {
        const result = await client.captureStill({
          machineId: entry.machineId,
          signal,
        });
        const duration = Math.max(0, Math.round(globalThis.performance.now() - started));
        setStill({
          url: URL.createObjectURL(new Blob([result.bytes], { type: result.mediaType })),
          capturedAt: result.capturedAt,
          expiresAt: result.expiresAt,
        });
        setCaptureDuration(duration);
        setCameraHealth((health) => ({
          ...health,
          state: 'ready',
          capturedAt: result.capturedAt,
          failure: undefined,
        }));
        if (announce) {
          setStatus(live ? `Chamber still returned in ${String(duration)} ms.` : 'Local sample still captured.');
        }
      } catch (error) {
        if (announce && !signal?.aborted) {
          setErrorMessage(friendlyError(error));
        }
      } finally {
        if (announce && !signal?.aborted) {
          setIsCapturing(false);
        }
      }
    },
    [client, entry.machineId, live],
  );

  useEffect(() => {
    if (!liveGrant) {
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const refreshFrame = async (): Promise<void> => {
      await captureStill(controller.signal, false);
      if (!controller.signal.aborted) {
        timer = globalThis.setTimeout(() => {
          void refreshFrame();
        }, 1000);
      }
    };
    void refreshFrame();
    return () => {
      controller.abort();
      globalThis.clearTimeout(timer);
    };
  }, [captureStill, liveGrant]);

  return (
    <main className='container mx-auto max-w-[96rem] px-4 py-6 sm:px-6 lg:py-8'>
      <header className='flex flex-col gap-5 border-b border-border/70 pb-6 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <p className='font-mono text-xs tracking-widest text-muted-foreground uppercase'>Machines / Bambu X1C</p>
          <h1 className='mt-2 text-3xl font-semibold tracking-tight sm:text-4xl'>X1C machine console</h1>
          <p className='mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground'>
            Chamber, run, thermal, tooling, material, and capability data through Tau’s browser-safe machine contract.
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='outline' className='gap-2 border-border/70 bg-card'>
            <LockKeyhole aria-hidden className='size-3.5' /> Developer LAN
          </Badge>
          <Badge variant='outline' className='gap-2 border-success/30 bg-success/10'>
            <ShieldCheck aria-hidden className='size-3.5 text-success' />
            {live ? 'Live read-only view' : 'Read-only simulation'}
          </Badge>
        </div>
      </header>

      <section
        aria-label='Machine overview'
        className='grid gap-5 py-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.75fr)]'
      >
        <article
          aria-label={`${machineName}, ${currentRunLabel}`}
          className='overflow-hidden rounded-2xl border border-border/70 bg-card'
        >
          <div className='flex flex-wrap items-start gap-3 border-b border-border/70 p-4 sm:p-5'>
            <span className='flex size-9 items-center justify-center rounded-xl border border-border/70 bg-muted/30'>
              <Printer aria-hidden className='size-4' />
            </span>
            <div className='min-w-0 flex-1'>
              <h2 className='text-lg font-semibold'>{machineName}</h2>
              <p className='mt-1 text-xs text-muted-foreground'>
                {entry.descriptor.vendor} {entry.descriptor.model} · firmware {entry.descriptor.firmware}
              </p>
            </div>
            <Badge role='status' variant='outline' className='gap-1.5 border-border/70 bg-background'>
              <CircleCheck
                aria-hidden
                className={
                  entry.snapshot.connection === 'connected' ? 'size-3.5 text-success' : 'size-3.5 text-warning'
                }
              />
              {sentence(entry.snapshot.connection)}
            </Badge>
          </div>

          <figure className='relative border-b border-border/70 bg-sidebar'>
            {still ? (
              <img
                src={still.url}
                alt={
                  live ? 'Latest live view of the X1C build chamber' : 'Local placeholder for the X1C still capability'
                }
                className='aspect-video w-full object-cover'
              />
            ) : (
              <div className='grid aspect-video place-items-center px-6 text-center'>
                <div className='max-w-sm'>
                  <span className='mx-auto flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-background/70'>
                    {cameraHealth.state === 'ready' ? (
                      <Camera aria-hidden className='size-5' />
                    ) : (
                      <LoaderCircle aria-hidden className='size-5 animate-spin motion-reduce:animate-none' />
                    )}
                  </span>
                  <p className='mt-4 text-sm font-medium'>
                    {cameraHealth.state === 'ready' ? 'Chamber still ready' : 'Camera session reconnecting'}
                  </p>
                  <p className='mt-1 text-xs leading-relaxed text-muted-foreground'>
                    {cameraHealth.state === 'ready'
                      ? 'Capture returns the newest bounded host-side frame without opening another printer connection.'
                      : 'Tau is recovering the private camera channel in the background. Telemetry remains independent.'}
                  </p>
                </div>
              </div>
            )}
            <figcaption className='absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border/70 bg-background/90 px-3 py-2 shadow-sm'>
              <span>
                <span className='block font-mono text-[0.6875rem] tracking-widest text-muted-foreground uppercase'>
                  Chamber 01
                </span>
                <span className='mt-0.5 block text-xs'>
                  {still ? `Captured ${formatObservedAt(still.capturedAt)}` : sentence(cameraHealth.state)}
                </span>
              </span>
              <span className='text-right'>
                <span className='block font-mono text-[0.6875rem] tracking-widest text-muted-foreground uppercase'>
                  Frame path
                </span>
                <span className='mt-0.5 block text-xs'>
                  {captureDuration === undefined ? 'Bounded JPEG' : `${String(captureDuration)} ms`}
                </span>
              </span>
            </figcaption>
          </figure>

          <div className='p-4 sm:p-5'>
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={isRefreshing}
                onClick={async () => {
                  await refresh();
                }}
              >
                {isRefreshing ? (
                  <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
                ) : (
                  <RefreshCw aria-hidden />
                )}
                Refresh status
              </Button>
              <Button
                type='button'
                size='sm'
                disabled={isCapturing}
                onClick={async () => {
                  await captureStill();
                }}
              >
                {isCapturing ? (
                  <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
                ) : (
                  <Camera aria-hidden />
                )}
                Capture still
              </Button>
              <span id='physical-controls-disabled' className='sr-only'>
                Physical controls are disabled in this read-only {live ? 'view' : 'sample'}.
              </span>
              <Button type='button' size='sm' variant='outline' disabled aria-describedby='physical-controls-disabled'>
                <Pause aria-hidden /> Pause
              </Button>
              <Button type='button' size='sm' variant='outline' disabled aria-describedby='physical-controls-disabled'>
                <Square aria-hidden /> Cancel
              </Button>
              <Button
                type='button'
                size='sm'
                variant='destructive'
                disabled
                aria-describedby='physical-controls-disabled'
              >
                <ShieldAlert aria-hidden /> Urgent stop
              </Button>
            </div>
            <p aria-live='polite' role='status' className='mt-3 min-h-4 text-xs text-muted-foreground'>
              {status}
            </p>
            {errorMessage ? (
              <p role='alert' className='mt-2 text-xs text-destructive'>
                {errorMessage}
              </p>
            ) : null}
          </div>
        </article>

        <aside className='grid content-start gap-5'>
          <section aria-labelledby='run-heading' className='rounded-2xl border border-border/70 bg-card p-5'>
            <div className='flex items-center justify-between gap-3'>
              <div className='flex items-center gap-2'>
                <Activity aria-hidden className='size-4' />
                <h2 id='run-heading' className='text-sm font-medium'>
                  Run
                </h2>
              </div>
              <Badge variant='outline' className='border-border/70 bg-background'>
                {sentence(entry.snapshot.readiness)}
              </Badge>
            </div>
            <div className='mt-8 flex items-end justify-between gap-4'>
              <div>
                <p className='font-mono text-xs tracking-widest text-muted-foreground uppercase'>Printer state</p>
                <p className='mt-2 text-3xl font-semibold'>{currentRunLabel}</p>
              </div>
              <p className='font-mono text-4xl font-semibold tabular-nums'>
                {progress === undefined ? '—' : `${String(Math.round(progress))}%`}
              </p>
            </div>
            {progress === undefined ? null : (
              <Progress
                aria-label={`${machineName} print progress`}
                aria-valuenow={progress}
                aria-valuetext={`${String(Math.round(progress))} percent`}
                className='mt-5'
                value={progress}
              />
            )}
            {(entry.snapshot.run?.name ?? entry.snapshot.run?.file) ? (
              <div className='mt-5 border-t border-border/70 pt-4'>
                <p className='truncate text-sm font-medium'>{entry.snapshot.run.name ?? 'Unnamed print'}</p>
                <p className='mt-1 truncate font-mono text-xs text-muted-foreground'>
                  {entry.snapshot.run.file ?? '—'}
                </p>
              </div>
            ) : null}
            <dl className='mt-5 grid grid-cols-2 gap-4 border-t border-border/70 pt-4 text-sm sm:grid-cols-4'>
              <div>
                <dt className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                  <Timer aria-hidden className='size-3.5' /> Remaining
                </dt>
                <dd className='mt-1.5 font-mono tabular-nums'>
                  {remainingLabel(entry.snapshot.run?.remainingSeconds)}
                </dd>
              </div>
              <div>
                <dt className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                  <Clock3 aria-hidden className='size-3.5' /> Observed
                </dt>
                <dd className='mt-1.5 font-mono tabular-nums'>{formatObservedAt(entry.snapshot.observedAt)}</dd>
              </div>
              <div>
                <dt className='text-xs text-muted-foreground'>Layer</dt>
                <dd className='mt-1.5 font-mono tabular-nums'>
                  {entry.snapshot.run?.currentLayer === undefined
                    ? '—'
                    : `${String(entry.snapshot.run.currentLayer)} / ${String(entry.snapshot.run.totalLayers ?? '—')}`}
                </dd>
              </div>
              <div>
                <dt className='text-xs text-muted-foreground'>Speed</dt>
                <dd className='mt-1.5'>
                  {entry.snapshot.run?.speedProfile ? sentence(entry.snapshot.run.speedProfile) : '—'}
                  {entry.snapshot.run?.speedPercent === undefined
                    ? ''
                    : ` · ${String(Math.round(entry.snapshot.run.speedPercent))}%`}
                </dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby='thermal-heading' className='rounded-2xl border border-border/70 bg-card p-5'>
            <div className='flex items-center gap-2'>
              <Thermometer aria-hidden className='size-4' />
              <h2 id='thermal-heading' className='text-sm font-medium'>
                Thermal
              </h2>
            </div>
            <dl className='mt-5 grid grid-cols-3 divide-x divide-border/70'>
              {(
                [
                  ['Nozzle', nozzleTemperature, nozzleTargetTemperature],
                  ['Bed', bedTemperature, bedTargetTemperature],
                  ['Chamber', chamberTemperature, undefined],
                ] satisfies ReadonlyArray<readonly [string, number | undefined, number | undefined]>
              ).map(([label, value, target]) => (
                <div key={label} className='px-3 first:pl-0 last:pr-0'>
                  <dt className='text-xs text-muted-foreground'>{label}</dt>
                  <dd className='mt-2 font-mono text-xl font-medium tabular-nums'>
                    {value === undefined ? '—' : `${String(Math.round(value))}°`}
                  </dd>
                  <dd className='mt-1 text-xs text-muted-foreground'>
                    {target === undefined ? 'No target' : `Target ${String(Math.round(target))}°`}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby='systems-heading' className='rounded-2xl border border-border/70 bg-card p-5'>
            <div className='flex items-center gap-2'>
              <Fan aria-hidden className='size-4' />
              <h2 id='systems-heading' className='text-sm font-medium'>
                Systems
              </h2>
            </div>
            <dl className='mt-4 grid grid-cols-2 gap-x-5 gap-y-4 text-sm'>
              <div>
                <dt className='text-xs text-muted-foreground'>Part fan</dt>
                <dd className='mt-1.5 font-mono tabular-nums'>
                  {entry.snapshot.fans?.part === undefined ? '—' : `${String(entry.snapshot.fans.part)}%`}
                </dd>
              </div>
              <div>
                <dt className='text-xs text-muted-foreground'>Aux fan</dt>
                <dd className='mt-1.5 font-mono tabular-nums'>
                  {entry.snapshot.fans?.auxiliary === undefined ? '—' : `${String(entry.snapshot.fans.auxiliary)}%`}
                </dd>
              </div>
              <div>
                <dt className='text-xs text-muted-foreground'>Chamber fan</dt>
                <dd className='mt-1.5 font-mono tabular-nums'>
                  {entry.snapshot.fans?.chamber === undefined ? '—' : `${String(entry.snapshot.fans.chamber)}%`}
                </dd>
              </div>
              <div>
                <dt className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                  <Wifi aria-hidden className='size-3.5' /> Wi-Fi
                </dt>
                <dd className='mt-1.5 font-mono tabular-nums'>
                  {entry.snapshot.network?.wifiSignalDbm === undefined
                    ? '—'
                    : `${String(entry.snapshot.network.wifiSignalDbm)} dBm`}
                </dd>
              </div>
              <div>
                <dt className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                  <Lightbulb aria-hidden className='size-3.5' /> Chamber light
                </dt>
                <dd className='mt-1.5'>
                  {entry.snapshot.lights?.chamber ? sentence(entry.snapshot.lights.chamber) : '—'}
                </dd>
              </div>
              <div>
                <dt className='text-xs text-muted-foreground'>SD card</dt>
                <dd className='mt-1.5'>
                  {entry.snapshot.removableStorage ? sentence(entry.snapshot.removableStorage) : '—'}
                </dd>
              </div>
              <div className='col-span-2 border-t border-border/70 pt-3'>
                <dt className='text-xs text-muted-foreground'>Active diagnostics</dt>
                <dd className='mt-1.5'>
                  {entry.snapshot.alerts?.length
                    ? entry.snapshot.alerts.map(({ code }) => code).join(', ')
                    : 'No active diagnostics'}
                </dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby='channels-heading' className='rounded-2xl border border-border/70 bg-card p-5'>
            <div className='flex items-center gap-2'>
              <Radio aria-hidden className='size-4' />
              <h2 id='channels-heading' className='text-sm font-medium'>
                Channel health
              </h2>
            </div>
            <dl className='mt-4 divide-y divide-border/70 text-sm'>
              <div className='flex items-center justify-between gap-4 py-3 first:pt-0'>
                <dt className='text-muted-foreground'>Telemetry / MQTT</dt>
                <dd className='flex items-center gap-2'>
                  <CircleCheck
                    aria-hidden
                    className={
                      entry.snapshot.connection === 'connected' ? 'size-3.5 text-success' : 'size-3.5 text-warning'
                    }
                  />
                  {sentence(entry.snapshot.connection)}
                </dd>
              </div>
              <div className='flex items-center justify-between gap-4 py-3 last:pb-0'>
                <dt className='text-muted-foreground'>Chamber / RTSPS</dt>
                <dd className='flex items-center gap-2'>
                  <CircleCheck
                    aria-hidden
                    className={cameraHealth.state === 'ready' ? 'size-3.5 text-success' : 'size-3.5 text-warning'}
                  />
                  {sentence(cameraHealth.state)}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </section>

      <section aria-label='Machine configuration' className='grid gap-5 pb-6 lg:grid-cols-2'>
        <section aria-labelledby='ams-heading' className='rounded-2xl border border-border/70 bg-card p-5'>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div>
              <div className='flex items-center gap-2'>
                <Layers3 aria-hidden className='size-4' />
                <h2 id='ams-heading' className='text-sm font-medium'>
                  Automatic Material System
                </h2>
              </div>
              <p className='mt-2 text-xs text-muted-foreground'>
                {String(observedMaterials.length)} bays observed ·{' '}
                {String(entry.snapshot.materialSystem?.units.length ?? 0)} unit online ·{' '}
                {String(entry.descriptor.materialSystem.slotCount)} slot capability
              </p>
            </div>
            <Badge variant='outline' className='border-border/70 bg-background'>
              {entry.descriptor.materialSystem.kind.toUpperCase()}
            </Badge>
          </div>
          <ol className='mt-5 grid list-none grid-cols-2 gap-3 sm:grid-cols-4'>
            {Array.from({ length: observedSlotCount }, (_, slot) => {
              const material = observedMaterials.find((candidate) => candidate.slot === slot);
              return (
                <li key={slot} className='rounded-xl border border-border/70 bg-sidebar p-3'>
                  <div className='flex items-center justify-between gap-2'>
                    <span className='font-mono text-xs text-muted-foreground'>{slotLabel(slot)}</span>
                    <span
                      aria-hidden
                      className={`size-2 rounded-full ${material?.color ? '' : material?.state === 'loaded' ? 'bg-success' : 'bg-muted-foreground/30'}`}
                      style={material?.color ? { backgroundColor: material.color } : undefined}
                    />
                  </div>
                  <p className='mt-5 truncate text-sm font-medium'>{materialLabel(material)}</p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    {material?.state === 'loaded'
                      ? [
                          material.brand,
                          material.remainingPercent === undefined ? undefined : `${String(material.remainingPercent)}%`,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Loaded'
                      : material?.state === 'empty'
                        ? 'Empty bay'
                        : 'No tray status'}
                  </p>
                  {entry.snapshot.materialSystem?.currentSlot === slot ? (
                    <p className='mt-3 text-xs font-medium'>In use</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {entry.snapshot.materialSystem?.units.length ? (
            <dl className='mt-5 grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-2'>
              {entry.snapshot.materialSystem.units.map((unit) => {
                const unitTemperature = quantityValue(unit.temperature, 'Cel');
                return (
                  <div key={unit.unit} className='flex items-center justify-between gap-4 text-sm'>
                    <dt className='text-muted-foreground'>AMS {String.fromCodePoint(65 + unit.unit)}</dt>
                    <dd className='font-mono tabular-nums'>
                      {unitTemperature === undefined ? '—' : `${String(Math.round(unitTemperature))}°`}
                      {' · '}
                      {unit.humidityIndex === undefined ? 'humidity —' : `humidity ${String(unit.humidityIndex)}`}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : null}
        </section>

        <section aria-labelledby='setup-heading' className='rounded-2xl border border-border/70 bg-card p-5'>
          <div className='flex items-center gap-2'>
            <Wrench aria-hidden className='size-4' />
            <h2 id='setup-heading' className='text-sm font-medium'>
              Machine & setup
            </h2>
          </div>
          <dl className='mt-5 grid grid-cols-2 gap-x-6 gap-y-5 text-sm sm:grid-cols-3'>
            <div>
              <dt className='text-xs text-muted-foreground'>Build volume</dt>
              <dd className='mt-1.5 font-mono tabular-nums'>
                {String(entry.descriptor.ratedEnvelope.width * 1000)} ×{' '}
                {String(entry.descriptor.ratedEnvelope.depth * 1000)} ×{' '}
                {String(entry.descriptor.ratedEnvelope.height * 1000)} mm
              </dd>
            </div>
            <div>
              <dt className='text-xs text-muted-foreground'>Tool</dt>
              <dd className='mt-1.5'>{entry.snapshot.setup.toolId ?? 'Unreported'}</dd>
            </div>
            <div>
              <dt className='text-xs text-muted-foreground'>Nozzle</dt>
              <dd className='mt-1.5 font-mono'>
                {nozzleDiameter === undefined ? 'Unreported' : `${String(nozzleDiameter)} mm`}
              </dd>
            </div>
            <div>
              <dt className='text-xs text-muted-foreground'>Build plate</dt>
              <dd className='mt-1.5'>
                {entry.snapshot.setup.bedType ? sentence(entry.snapshot.setup.bedType) : 'Unreported'}
              </dd>
            </div>
            <div>
              <dt className='text-xs text-muted-foreground'>Technology</dt>
              <dd className='mt-1.5'>{sentence(entry.descriptor.technology)}</dd>
            </div>
            <div>
              <dt className='text-xs text-muted-foreground'>Provider</dt>
              <dd className='mt-1.5'>Tau Bambu plugin</dd>
            </div>
          </dl>
        </section>
      </section>

      <details className='rounded-2xl border border-border/70 bg-card p-5'>
        <summary className='cursor-pointer flex list-none items-center gap-2 text-sm font-medium'>
          <Gauge aria-hidden className='size-4' /> Capability & diagnostics
        </summary>
        <div className='mt-5 grid gap-6 border-t border-border/70 pt-5 md:grid-cols-3'>
          <section aria-labelledby='operations-heading'>
            <div className='flex items-center gap-2'>
              <Cpu aria-hidden className='size-4' />
              <h2
                id='operations-heading'
                className='text-xs font-medium tracking-wider text-muted-foreground uppercase'
              >
                Operations
              </h2>
            </div>
            <ul className='mt-3 flex list-none flex-wrap gap-2'>
              {entry.descriptor.operations.map((operation) => (
                <li key={operation}>
                  <Badge variant='outline' className='border-border/70 bg-background'>
                    {sentence(operation)}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby='artifact-heading'>
            <div className='flex items-center gap-2'>
              <Box aria-hidden className='size-4' />
              <h2 id='artifact-heading' className='text-xs font-medium tracking-wider text-muted-foreground uppercase'>
                Print artifact
              </h2>
            </div>
            <p className='mt-3 text-sm'>
              {entry.descriptor.accepts.length > 0
                ? 'Bambu G-code 3MF · plate selected'
                : 'No accepted artifact reported'}
            </p>
            <p className='mt-1 font-mono text-xs break-all text-muted-foreground'>
              {entry.descriptor.accepts[0]?.contract.id ?? '—'}
            </p>
          </section>
          <section aria-labelledby='boundary-heading'>
            <div className='flex items-center gap-2'>
              <ShieldCheck aria-hidden className='size-4' />
              <h2 id='boundary-heading' className='text-xs font-medium tracking-wider text-muted-foreground uppercase'>
                Trust boundary
              </h2>
            </div>
            <p className='mt-3 text-sm leading-relaxed text-muted-foreground'>
              Credentials, address, certificate pins, raw MQTT, and camera sockets stay in the host. This page receives
              normalized facts and expiring JPEG bytes only.
            </p>
          </section>
        </div>
      </details>

      <section className='mt-5 flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4'>
        <ShieldAlert aria-hidden className='mt-0.5 size-4 shrink-0 text-warning' />
        <div>
          <h2 className='text-sm font-medium'>Read-only qualification boundary</h2>
          <p className='mt-1 text-xs leading-relaxed text-muted-foreground'>
            Status and bounded stills are active. Upload, print start, pause, cancel, and urgent stop remain unavailable
            until their separate charter authorization and physical qualification.
          </p>
        </div>
      </section>
    </main>
  );
}
