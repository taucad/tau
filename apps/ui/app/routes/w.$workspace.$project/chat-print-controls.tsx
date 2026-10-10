import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, LoaderCircle, RefreshCw, SlidersHorizontal } from 'lucide-react';
import type { MachineClient, MachineDirectoryEntry, MachineManifest } from '@taucad/runtime/machine';
import { Button } from '@taucad/ui/components/button';
import { randomUuid } from '@taucad/utils/id';
import { isRecord } from '@taucad/utils/schema';
import { ParameterSelect } from '#components/geometry/parameters/parameter-select.js';
import { ParametersBoolean } from '#components/geometry/parameters/parameters-boolean.js';
import { PrintSetupRow } from '#components/print/print-setup-row.js';
import { PrintNotice, PrintRow, PrintStage, useNow } from '#routes/w.$workspace.$project/chat-print-section.js';
import { formatAge } from '#routes/w.$workspace.$project/chat-print-summary.js';

/**
 * One declared machine action to apply, as the machine-actions blueprint proposes `MachineClient.applyAction`.
 * @public
 */
export type MachineActionInput = Readonly<{
  machineId: string;
  /** Idempotency key: the same id with the same input never applies twice. */
  operationId: string;
  /** A manifest action id, such as `light.set`. */
  action: string;
  /** Validated against the action's declared parameter schema. */
  parameters: Readonly<Record<string, unknown>>;
  /** For an action on the run: the exact run the person saw. */
  expectedProviderRunId?: string;
}>;

/**
 * Applies one action; it resolves once the host accepted it, and the printer's next observation shows the effect.
 *
 * ponytail: an optional pane seam until the machine-actions API guide is approved; the product passes none, so
 * every action control says why it waits. Replace it with `MachineClient.applyAction` when that lands.
 * @public
 */
export type ApplyMachineAction = (input: MachineActionInput) => Promise<void>;

/**
 * Whether a declared action can be offered now. `reason` completes a sentence about the action ("… is
 * designed but not yet qualified on this printer"); a reason the pane says elsewhere is omitted.
 * @public
 */
export type ActionAvailability = Readonly<{ isAvailable: boolean; label: string; reason?: string }>;

const qualificationWait: Readonly<Record<'designed' | 'unsupported', string>> = {
  designed: 'designed but not yet qualified on this printer',
  unsupported: 'not supported on this printer',
};

/**
 * The sentences that say why actions wait, one per reason: "Chamber light and print speed are designed but
 * not yet qualified on this printer."
 *
 * @param availabilities - The actions shown, any of them available.
 * @returns One sentence per distinct reason.
 * @public
 */
export const describeWaits = (availabilities: ReadonlyArray<ActionAvailability | undefined>): readonly string[] => {
  const byReason = Map.groupBy(
    availabilities.filter((availability) => availability?.reason !== undefined),
    (availability) => availability?.reason ?? '',
  );
  return [...byReason].map(([reason, waiting]) => {
    const labels = waiting.map((availability, index) =>
      index === 0 ? (availability?.label ?? '') : (availability?.label.toLowerCase() ?? ''),
    );
    return `${new Intl.ListFormat('en', { type: 'conjunction' }).format(labels)} ${labels.length > 1 ? 'are' : 'is'} ${reason}.`;
  });
};

/**
 * Whether the pane may offer a declared action now. A stale or disconnected printer blocks every action
 * without a reason of its own: the pane's observation notice already says what waits.
 *
 * @param input - The machine, its manifest, the action id and the seam that applies it.
 * @returns The availability, or nothing when the manifest does not declare the action.
 * @public
 */
export const actionAvailability = ({
  entry,
  manifest,
  action,
  apply,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly action: string;
  readonly apply: ApplyMachineAction | undefined;
}): ActionAvailability | undefined => {
  const descriptor = manifest?.actions.find((candidate) => candidate.id === action);
  if (descriptor === undefined) {
    return undefined;
  }
  const { label, qualification } = descriptor;
  if (qualification !== 'qualified') {
    return { isAvailable: false, label, reason: qualificationWait[qualification] };
  }
  if (apply === undefined) {
    return { isAvailable: false, label, reason: 'not available from Tau yet' };
  }
  if (entry.freshness !== 'current' || entry.snapshot.connection !== 'connected') {
    return { isAvailable: false, label };
  }
  return { isAvailable: true, label };
};

/** What a person reads when the host refuses an action, by the code the machine-actions guide proposes. */
const actionFailures: ReadonlyMap<string, string> = new Map([
  ['MACHINE_ACTION_UNDECLARED', 'This printer does not declare that action, so nothing was sent.'],
  ['MACHINE_ACTION_UNQUALIFIED', 'That action is not qualified on this printer yet, so nothing was sent.'],
  ['MACHINE_ACTION_UNSUPPORTED', "The printer's firmware does not support that action, so nothing was sent."],
  ['MACHINE_ACTION_PARAMETERS_INVALID', 'The printer refused the values Tau sent; report this as a bug.'],
  ['MACHINE_ACTION_RUN_ACTIVE', 'The printer is running a print, so nothing was sent; try again once it finishes.'],
  ['MACHINE_CONTROL_STALE_RUN', 'The run changed before the action arrived, so nothing was sent.'],
  [
    'MACHINE_ACTION_UNAVAILABLE',
    'Tau is not connected to this printer right now, so nothing was sent; try again once it reconnects.',
  ],
  [
    'MACHINE_ACTION_PRECONDITION_FAILED',
    'The printer is not ready for that yet, so nothing was sent; check it and try again.',
  ],
]);

/**
 * A refused or failed action in the person's words, by the first known code in the error.
 *
 * @param error - What the seam rejected with.
 * @returns One sentence.
 * @public
 */
export const describeActionFailure = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const code = /\b[A-Z][\dA-Z]*(?:_[\dA-Z]+)+\b/u.exec(message)?.[0];
  return (
    (code === undefined ? undefined : actionFailures.get(code)) ?? `The printer did not take the change (${message}).`
  );
};

/**
 * Applies actions for one printer: what is in flight, the last failure, and the call itself.
 *
 * @param entry - The machine as observed.
 * @param apply - The seam, when the pane has one.
 * @returns The action in flight, the last failure and `run`, which resolves true once the host accepted.
 * @public
 */
export const useMachineAction = (
  entry: MachineDirectoryEntry,
  apply: ApplyMachineAction | undefined,
): Readonly<{
  pending: string | undefined;
  error: string | undefined;
  run: (action: string, parameters: Record<string, unknown>, expectedProviderRunId?: string) => Promise<boolean>;
}> => {
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const run = async (
    action: string,
    parameters: Record<string, unknown>,
    expectedProviderRunId?: string,
  ): Promise<boolean> => {
    if (apply === undefined) {
      return false;
    }
    setPending(action);
    setError(undefined);
    try {
      await apply({
        machineId: entry.machineId,
        operationId: randomUuid(),
        action,
        parameters,
        ...(expectedProviderRunId === undefined ? {} : { expectedProviderRunId }),
      });
      return true;
    } catch (error) {
      setError(describeActionFailure(error));
      return false;
    } finally {
      setPending(undefined);
    }
  };
  return { pending, error, run };
};

/** How long a requested change shows before the pane stops claiming it: the printer reports within seconds. */
const reportWithin = 15_000;

/**
 * A value the person asked for, shown in place of the observed one until the printer reports it. When the
 * printer has not reported it within 15 s, the observed value speaks again and `isUnconfirmed` says so.
 *
 * @param observed - The value as last observed.
 * @returns The value to show, whether a change is on its way, and `request`, which shows the value while
 * `send` runs and drops it when the host refuses.
 */
const useRequested = <T,>(
  observed: T | undefined,
): Readonly<{
  shown: T | undefined;
  isPending: boolean;
  isUnconfirmed: boolean;
  request: (value: T, send: () => Promise<boolean>) => Promise<void>;
}> => {
  const [requested, setRequested] = useState<Readonly<{ value: T; at: number }>>();
  const [isUnconfirmed, setIsUnconfirmed] = useState(false);
  const now = useNow();
  const isReported = requested !== undefined && Object.is(requested.value, observed);
  const isLate = requested !== undefined && !isReported && now - requested.at > reportWithin;
  /* Settled while rendering, as React adjusts state from props: the printer reported it, or never did. */
  if (isReported || isLate) {
    setRequested(undefined);
    setIsUnconfirmed(isLate);
  }
  return {
    shown: requested === undefined ? observed : requested.value,
    isPending: requested !== undefined,
    isUnconfirmed,
    request: async (value, send) => {
      setIsUnconfirmed(false);
      setRequested({ value, at: Date.now() });
      if (!(await send())) {
        setRequested(undefined);
      }
    },
  };
};

const rebind = 'bind it again in Settings under Printers with the access code shown on its screen';

/**
 * What a person reads when a still capture fails, by the fixed code it rejects with: the camera
 * leg (`@taucad/host`), its pinned connection and saved access code, and the host's own checks.
 */
const stillFailures: ReadonlyMap<string, string> = new Map([
  [
    'MACHINE_STILL_FFMPEG_MISSING',
    'Tau could not find ffmpeg, which capturing a still needs; install it (with Homebrew on macOS: brew install ffmpeg; on Windows: winget install ffmpeg), then capture again.',
  ],
  [
    'MACHINE_STILL_FFMPEG_FAILED',
    'Tau could not start ffmpeg; reinstall it (with Homebrew on macOS: brew reinstall ffmpeg), then capture again.',
  ],
  ['MACHINE_STILL_AUTH_REJECTED', `The camera refused the printer's saved access code; ${rebind}.`],
  ['MACHINE_SECRET_UNKNOWN', `Tau no longer has this printer's access code; ${rebind}.`],
  [
    'MACHINE_TLS_PIN_MISMATCH',
    'The camera presented a different certificate from the one saved when the printer was bound, so Tau did not connect; if the printer was reset or replaced, bind it again in Settings under Printers.',
  ],
  [
    'MACHINE_CONNECT_FAILED',
    'Tau could not connect to the camera; check that the printer is on and on this network, then capture again.',
  ],
  [
    'MACHINE_CONNECT_TIMEOUT',
    'The camera did not answer in time; check that the printer is on and on this network, then capture again.',
  ],
  [
    'MACHINE_STILL_TIMEOUT',
    'The camera sent no picture in time; check that the printer is on and connected, then capture again.',
  ],
  [
    'MACHINE_STILL_STREAM_FAILED',
    "The camera's video stream broke off before a picture arrived; capture again in a moment.",
  ],
  [
    'MACHINE_STILL_CAPTURE_FAILED',
    "The camera's stream ended without a picture, which can happen while the camera wakes up; capture again in a moment.",
  ],
  ['MACHINE_STILL_TOO_LARGE', 'The camera sent a picture larger than Tau accepts, so it was discarded; capture again.'],
  ['MACHINE_STILL_INVALID', 'The camera sent a picture Tau could not accept; capture again.'],
  [
    'MACHINE_STILL_PROXY_FAILED',
    'Tau could not open its local connection to the camera on this computer; capture again, and restart Tau if it keeps failing.',
  ],
  [
    'MACHINE_STILL_REQUEST_INVALID',
    "Tau built an invalid request for this printer's camera, so nothing was sent; report this as a bug.",
  ],
  ['MACHINE_STILL_UNAVAILABLE', 'Tau is not connected to this printer right now; capture again once it reconnects.'],
  ['MACHINE_STILL_RATE_LIMITED', 'Stills are limited to one every 5 seconds; wait a moment, then capture again.'],
]);

const unknownStillFailure = 'The camera could not capture a still; capture again in a moment.';

/**
 * A failed still capture in the person's words. The machine channel carries the code as the
 * message and a desktop shell may wrap it in its own words, so the code is looked for anywhere in
 * the message, after the error's own `code`. A failure that names no known code keeps a generic
 * sentence plus the code, or the message when it names none.
 *
 * @param error - What `captureStill` rejected with.
 * @returns One sentence saying what happened and what to do.
 * @public
 */
export const describeStillFailure = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const codes = [
    ...(isRecord(error) && typeof error['code'] === 'string' ? [error['code']] : []),
    ...(message.match(/\b[A-Z][\dA-Z]*(?:_[\dA-Z]+)+\b/gu) ?? []),
  ];
  const sentence = codes.map((code) => stillFailures.get(code)).find((candidate) => candidate !== undefined);
  if (sentence !== undefined) {
    return sentence;
  }
  const detail = codes[0] ?? message.trim();
  return detail === '' ? unknownStillFailure : `${unknownStillFailure} (${detail})`;
};

/**
 * The camera, first in the Control center: the latest still at full width, or an empty frame that
 * captures one. A still expires when the host says so.
 *
 * @param properties - The client and the machine.
 * @returns The camera frame.
 */
function CameraView({
  client,
  entry,
  failure,
  shouldCapture = true,
}: {
  readonly client: MachineClient;
  readonly entry: MachineDirectoryEntry;
  readonly failure?: string;
  readonly shouldCapture?: boolean;
}): React.JSX.Element {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [still, setStill] = useState<Readonly<{ url: string; capturedAt: string; expiresAt: string }>>();
  const captureAbort = useRef<AbortController | undefined>(undefined);
  const hasAttempted = useRef(false);
  const now = useNow();
  const isSupported = entry.descriptor.operations.includes('still');

  useEffect(
    () => () => {
      captureAbort.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!still) {
      return;
    }
    const remaining = Date.parse(still.expiresAt) - Date.now();
    const stillExpiry = globalThis.setTimeout(
      () => {
        setStill((current) => (current?.url === still.url ? undefined : current));
        if (failure !== undefined) {
          setError('The failure still expired. Capture again to see the printer now.');
        }
      },
      Math.max(0, remaining),
    );
    return () => {
      globalThis.clearTimeout(stillExpiry);
      URL.revokeObjectURL(still.url);
    };
  }, [still, failure]);

  const capture = useCallback(async (): Promise<void> => {
    if (captureAbort.current) {
      return;
    }
    const abort = new AbortController();
    captureAbort.current = abort;
    setIsBusy(true);
    setError(undefined);
    try {
      const result = await client.captureStill({ machineId: entry.machineId, signal: abort.signal });
      abort.signal.throwIfAborted();
      setStill({
        url: URL.createObjectURL(new Blob([result.bytes], { type: result.mediaType })),
        capturedAt: result.capturedAt,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      if (!abort.signal.aborted) {
        setError(describeStillFailure(error));
      }
    } finally {
      if (captureAbort.current === abort) {
        captureAbort.current = undefined;
        setIsBusy(false);
      }
    }
  }, [client, entry.machineId]);

  useEffect(() => {
    if (failure === undefined || !isSupported || !shouldCapture || hasAttempted.current) {
      return;
    }
    // Defer admission so React StrictMode's discarded setup cannot consume the host's rate limit.
    let isCancelled = false;
    queueMicrotask(() => {
      if (!isCancelled) {
        hasAttempted.current = true;
        void capture();
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [capture, failure, isSupported, shouldCapture]);
  const busyGlyph = <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />;

  return (
    <div className='flex min-w-0 flex-col gap-2'>
      {failure === undefined ? null : <p className='text-xs'>Camera at failure · {failure}</p>}
      {isBusy && failure !== undefined ? (
        <p role='status' aria-busy='true' className='text-xs text-muted-foreground'>
          Capturing failure still…
        </p>
      ) : null}
      <figure
        aria-label={failure === undefined ? 'Camera' : 'Failure camera evidence'}
        className='flex min-w-0 flex-col overflow-hidden rounded-md border border-border/70 bg-muted/30'
      >
        {still ? (
          <img
            src={still.url}
            alt={`${failure === undefined ? 'Latest' : 'Failure'} still from ${entry.name}`}
            className='aspect-video w-full object-contain'
          />
        ) : (
          <div className='flex min-h-24 flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted-foreground'>
            <Camera aria-hidden className='size-5' />
            {isSupported ? (
              <Button type='button' size='xs' variant='outline' disabled={isBusy} onClick={capture}>
                {isBusy ? busyGlyph : null}
                Capture still
              </Button>
            ) : (
              <span>Still capture is unavailable for this printer.</span>
            )}
          </div>
        )}
        {still ? (
          <figcaption className='flex min-h-8 min-w-0 items-center gap-2 border-t border-border/70 pr-1 pl-2 text-xs text-muted-foreground'>
            <span className='min-w-0 flex-1 truncate'>
              Captured <time dateTime={still.capturedAt}>{formatAge(still.capturedAt, now)}</time>
            </span>
            <Button type='button' size='xs' variant='ghost' disabled={isBusy} onClick={capture}>
              {isBusy ? busyGlyph : <RefreshCw aria-hidden />}
              Capture again
            </Button>
          </figcaption>
        ) : null}
      </figure>
      {error ? <PrintNotice tone='error'>{error}</PrintNotice> : null}
    </div>
  );
}

/** Run states with a run whose speed can change. */
const runningStates: ReadonlySet<string> = new Set(['printing', 'paused']);

/**
 * The Control center's summary while it is closed: the light and the run's speed.
 *
 * @param entry - The machine as observed.
 * @param manifest - Its manifest, for the speed label.
 * @returns A few words, or nothing when neither is reported.
 * @public
 */
export const controlCenterSummary = (
  entry: MachineDirectoryEntry,
  manifest: MachineManifest | undefined,
): string | undefined => {
  const { lights, run } = entry.snapshot;
  const speed =
    run && runningStates.has(run.state)
      ? manifest?.speedProfiles.find((profile) => profile.id === run.speedProfile)?.label
      : undefined;
  return (
    [
      lights?.chamber === 'on' ? 'Light on' : lights?.chamber === 'off' ? 'Light off' : undefined,
      speed === undefined ? undefined : `${speed} speed`,
    ]
      .filter((part) => part !== undefined)
      .join(' · ') || undefined
  );
};

const storageLabel = { present: 'Card inserted', absent: 'No card' } as const;

type Requested<T> = ReturnType<typeof useRequested<T>>;

/**
 * The chamber light's switch: the person's choice shows at once and holds until the printer reports it.
 *
 * @param properties - The machine, whether the light can be set now, the request and the action runner.
 * @returns The row.
 */
function LightRow({
  entry,
  availability,
  light,
  action,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly availability: ActionAvailability;
  readonly light: Requested<'on' | 'off'>;
  readonly action: ReturnType<typeof useMachineAction>;
}): React.JSX.Element {
  return (
    <PrintSetupRow
      label='Chamber light'
      description={light.isUnconfirmed ? `${entry.name} has not reported the light change yet.` : undefined}
    >
      {light.isPending ? (
        <LoaderCircle aria-hidden className='size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none' />
      ) : null}
      <ParametersBoolean
        aria-label='Chamber light'
        value={light.shown === 'on'}
        disabled={!availability.isAvailable || action.pending === 'light.set'}
        onChange={(isOn) => {
          void light.request(isOn ? 'on' : 'off', async () => action.run('light.set', { on: isOn }));
        }}
      />
    </PrintSetupRow>
  );
}

type SpeedProfile = Exclude<
  NonNullable<MachineDirectoryEntry['snapshot']['run']>['speedProfile'],
  'unknown' | undefined
>;

/**
 * The run's speed profile, from the manifest's profiles, for the exact run the person sees.
 *
 * @param properties - The machine, its manifest, whether speed can be set now, the request and the action runner.
 * @returns The row.
 */
function SpeedRow({
  entry,
  manifest,
  availability,
  speed,
  action,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest;
  readonly availability: ActionAvailability;
  readonly speed: Requested<SpeedProfile>;
  readonly action: ReturnType<typeof useMachineAction>;
}): React.JSX.Element {
  return (
    <PrintSetupRow
      label='Print speed'
      description={speed.isUnconfirmed ? `${entry.name} has not reported the speed change yet.` : undefined}
    >
      <ParameterSelect
        label='Print speed'
        value={speed.shown ?? ''}
        placeholder='Not reported'
        isDisabled={!availability.isAvailable || action.pending === 'speed.set'}
        groups={[
          {
            options: manifest.speedProfiles.map((profile) => ({
              value: profile.id,
              label: profile.label,
              secondary: `${String(profile.percent)} %`,
            })),
          },
        ]}
        onChange={(profile) => {
          // SAFETY: the options are the manifest's speed profiles.
          void speed.request(profile as SpeedProfile, async () =>
            action.run('speed.set', { profile }, entry.snapshot.activeRunId),
          );
        }}
      />
    </PrintSetupRow>
  );
}

/**
 * Fans, Wi-Fi, storage and, when the printer cannot have it set, the run's speed: read, not set.
 *
 * @param properties - The machine, its manifest and whether to show the speed.
 * @returns The rows.
 */
function EnvironmentRows({
  entry,
  manifest,
  isSpeedShown,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly isSpeedShown: boolean;
}): React.JSX.Element {
  const { fans, network, removableStorage, run } = entry.snapshot;
  const fanLine = (manifest?.chamber.fans ?? [{ id: 'part', label: 'Part fan' }])
    .map(
      (fan) => `${fan.label.replace(/ fan$/u, '')} ${fans?.[fan.id] === undefined ? '–' : `${String(fans[fan.id])} %`}`,
    )
    .join(' · ');
  const speed = [run?.speedProfile, run?.speedPercent === undefined ? undefined : `${String(run.speedPercent)} %`]
    .filter((part) => part !== undefined)
    .join(' · ');
  return (
    <dl className='flex flex-col gap-0.5'>
      {isSpeedShown && speed !== '' ? <PrintRow label='Speed'>{speed}</PrintRow> : null}
      <PrintRow label='Fans'>{fanLine}</PrintRow>
      <PrintRow label='Wi-Fi'>
        {network?.wifiSignalDbm === undefined ? 'Not reported' : `${String(network.wifiSignalDbm)} dBm`}
      </PrintRow>
      {removableStorage === undefined ? null : <PrintRow label='Storage'>{storageLabel[removableStorage]}</PrintRow>}
    </dl>
  );
}

/**
 * Which Control center actions the printer declares and can take now, and the distinct reasons the others wait.
 *
 * @param entry - The machine as observed.
 * @param manifest - Its manifest.
 * @param apply - The action seam.
 * @returns The light's and the speed's availability, whether a run is in progress, and the reasons.
 */
const controlAvailability = (
  entry: MachineDirectoryEntry,
  manifest: MachineManifest | undefined,
  apply: ApplyMachineAction | undefined,
): Readonly<{
  light: ActionAvailability | undefined;
  speed: ActionAvailability | undefined;
  isRunning: boolean;
  reasons: readonly string[];
}> => {
  const { run, activeRunId } = entry.snapshot;
  const light =
    manifest?.chamber.light === false ? undefined : actionAvailability({ entry, manifest, action: 'light.set', apply });
  const isRunning = run !== undefined && runningStates.has(run.state) && activeRunId !== undefined;
  const speed = isRunning ? actionAvailability({ entry, manifest, action: 'speed.set', apply }) : undefined;
  return { light, speed, isRunning, reasons: describeWaits([light, speed]) };
};

/**
 * The Control center for the selected printer: the camera first, then the chamber light and, during a
 * run, its speed, then the fans, Wi-Fi and storage the printer reports. Controls the pane cannot offer
 * stay visible, disabled, with one line saying why. It opens by default while a run is in progress.
 *
 * @param properties - The client, machine, manifest and the action seam.
 * @returns The stage.
 * @public
 */
export function ControlCenterStage({
  client,
  entry,
  manifest,
  apply,
}: {
  readonly client: MachineClient;
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly apply: ApplyMachineAction | undefined;
}): React.JSX.Element {
  const { lights, run } = entry.snapshot;
  const action = useMachineAction(entry, apply);
  const light = useRequested(lights?.chamber === 'unknown' ? undefined : lights?.chamber);
  const speed = useRequested(run?.speedProfile === 'unknown' ? undefined : run?.speedProfile);
  const {
    light: lightAvailability,
    speed: speedAvailability,
    isRunning,
    reasons,
  } = controlAvailability(entry, manifest, apply);

  return (
    <PrintStage
      icon={SlidersHorizontal}
      title='Control center'
      summary={controlCenterSummary(entry, manifest)}
      isDefaultOpen={isRunning}
    >
      {manifest?.camera.stills === false ? null : <CameraView client={client} entry={entry} />}
      {lightAvailability === undefined && speedAvailability === undefined ? null : (
        <div className='-my-1.5 flex min-w-0 flex-col'>
          {lightAvailability === undefined ? null : (
            <LightRow entry={entry} availability={lightAvailability} light={light} action={action} />
          )}
          {speedAvailability === undefined || manifest === undefined ? null : (
            <SpeedRow
              entry={entry}
              manifest={manifest}
              availability={speedAvailability}
              speed={speed}
              action={action}
            />
          )}
        </div>
      )}
      <EnvironmentRows entry={entry} manifest={manifest} isSpeedShown={isRunning && speedAvailability === undefined} />
      {reasons.map((reason) => (
        <p key={reason} className='text-xs text-muted-foreground'>
          {reason}
        </p>
      ))}
      {action.error ? <PrintNotice tone='error'>{action.error}</PrintNotice> : null}
    </PrintStage>
  );
}

/**
 * Capture once for each distinct observed failure, outside the collapsible controls.
 * Normal warning and info alerts do not imply a failed print. The keyed camera owns cancellation,
 * expiry and URL cleanup; a cleared failure rearms it for a later occurrence.
 */
export function FailureEvidence({
  client,
  entry,
}: {
  readonly client: MachineClient;
  readonly entry: MachineDirectoryEntry;
}): React.JSX.Element | undefined {
  const codes = [
    ...new Set(
      (entry.snapshot.alerts ?? [])
        .filter((alert) => alert.severity === undefined || alert.severity === 'serious' || alert.severity === 'fatal')
        .map((alert) => alert.code),
    ),
  ].sort();
  const failure =
    codes.length > 0 ? codes.join(', ') : entry.snapshot.run?.state === 'failed' ? 'Print failed' : undefined;
  if (failure === undefined) {
    return undefined;
  }
  return (
    <CameraView
      key={`${entry.machineId}:${failure}`}
      client={client}
      entry={entry}
      failure={failure}
      shouldCapture={entry.freshness === 'current' && entry.snapshot.connection === 'connected'}
    />
  );
}
