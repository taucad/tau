import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import {
  ChevronDown,
  EllipsisVertical,
  Focus,
  ListFilter,
  Pause,
  Play,
  Radio,
  RotateCcw,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import type { ToolpathProgram } from '@taucad/slicer/toolpath';
import { Button } from '@taucad/ui/components/button';
import { Checkbox } from '@taucad/ui/components/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { Switch } from '@taucad/ui/components/switch';
import { ToggleGroup, ToggleGroupItem } from '@taucad/ui/components/toggle-group';
import { cn } from '@taucad/ui/utils/cn';
import { useTheme } from '#hooks/use-theme.js';
import { digestBytes } from '#utils/crypto.utils.js';
import { PaneButton } from '#components/ui/pane-button.js';
import { printerAccent } from '#components/printer/printer-colors.constants.js';
import type { PrinterFileKind } from '#components/printer/printer-file.js';
import { derivePrinterGeometry } from '#components/printer/printer-geometry.js';
import { resolvePrinterManifest } from '#components/printer/printer-manifest.fixture.js';
import {
  createExtrusionPrefix,
  createPlaybackStore,
  eventValueAt,
  extrudedLengthAt,
  formatDuration,
  playbackSpeeds,
} from '#components/printer/printer-playback.js';
import type { PlaybackSpeed } from '#components/printer/printer-playback.js';
import { loadPrinterProgram } from '#components/printer/printer-program.js';
import { defaultPrinterPlate, printerPlateById, x1cPlates } from '#components/printer/printer-plates.js';
import type { PrinterPlateId, PrinterPlateModel } from '#components/printer/printer-plates.js';
import { PrinterScene } from '#components/printer/printer-scene.js';
import {
  defaultHiddenToolpathGroups,
  groupToolpath,
  toolpathGroupLabels,
  toolpathGroups,
} from '#components/printer/printer-toolpath.js';
import type { ToolpathGroup } from '#components/printer/printer-toolpath.js';
import { usePrinterLive } from '#components/printer/use-printer-live.js';
import type { PrinterLiveState } from '#components/printer/use-printer-live.js';
import type { FileViewerRenderRequest } from '#routes/w.$workspace.$project/file-viewers/file-viewer.types.js';

type PrinterViewerProps = Readonly<{
  name: string;
  kind: PrinterFileKind;
  revision: number;
  readAll: () => Promise<Uint8Array<ArrayBuffer>>;
  renderPane: FileViewerRenderRequest['renderPane'];
}>;

type ProgramResource =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{
      kind: 'ready';
      program: ToolpathProgram;
      slicedPlate: PrinterPlateModel | undefined;
      digest: string | undefined;
    }>
  | Readonly<{ kind: 'error'; message: string }>;

const motionQuery = '(prefers-reduced-motion: reduce)';
const subscribeMotion = (callback: () => void): (() => void) => {
  const query = globalThis.matchMedia(motionQuery);
  query.addEventListener('change', callback);
  return () => {
    query.removeEventListener('change', callback);
  };
};
const getMotion = (): boolean => globalThis.matchMedia(motionQuery).matches;
const serverMotion = (): boolean => true;

const speedLabel = (speed: PlaybackSpeed): string => (speed === 'max' ? 'Max' : `${speed}×`);
const formatFilament = (millimetres: number): string =>
  millimetres >= 1000 ? `${(millimetres / 1000).toFixed(2)} m` : `${Math.round(millimetres)} mm`;
const formatTemperature = (celsius: number | undefined): string =>
  celsius === undefined ? '—' : `${Math.round(celsius)} °C`;

/** Simulation of one `.gcode` or `.gcode.3mf` file on the selected machine. */
export function PrinterViewer({ name, kind, revision, readAll, renderPane }: PrinterViewerProps): ReactNode {
  return (
    <PrinterViewerContent
      key={`${name}:${kind}:${revision}`}
      name={name}
      kind={kind}
      readAll={readAll}
      renderPane={renderPane}
    />
  );
}

function PrinterViewerContent({ name, kind, readAll, renderPane }: Omit<PrinterViewerProps, 'revision'>): ReactNode {
  const [resource, setResource] = useState<ProgramResource>({ kind: 'loading' });
  const [frameRequest, setFrameRequest] = useState(0);
  const [isWholePrinter, setIsWholePrinter] = useState(false);
  const [plateChoice, setPlateChoice] = useState<PrinterPlateId | 'as-sliced'>('as-sliced');
  const requestFrame = useCallback((): void => {
    setFrameRequest((count) => count + 1);
  }, []);
  const handleWholePrinter = useCallback((checked: boolean): void => {
    setIsWholePrinter(checked);
    // A different scene is framed afresh, whatever the person did to the last one.
    setFrameRequest((count) => count + 1);
  }, []);
  const handlePlate = useCallback((value: string): void => {
    setPlateChoice(x1cPlates.find(({ id }) => id === value)?.id ?? 'as-sliced');
  }, []);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        const bytes = await readAll();
        const { program, slicedPlate } = loadPrinterProgram(bytes, kind);
        // The print request ledger names artifacts by digest; Live mode follows a run only from its own bytes.
        // WebCrypto needs a secure context: without one (a LAN address over http) Live mode stays off.
        const digest = await digestBytes(bytes).catch(() => undefined);
        if (active) {
          setResource({ kind: 'ready', program, slicedPlate, digest });
        }
      } catch (error) {
        if (active) {
          setResource({
            kind: 'error',
            message: error instanceof Error ? error.message : 'The file could not be read.',
          });
        }
      }
    };
    // async-iife: bootstrap — React effects cannot await the parse; the cleanup flag owns its lifecycle.
    void load();
    return () => {
      active = false;
    };
  }, [kind, readAll]);

  if (resource.kind === 'loading') {
    return renderPane({
      body: (
        <div
          className='flex h-full items-center justify-center bg-background text-xs text-muted-foreground'
          role='status'
          aria-busy='true'
          aria-label={`Loading simulation of ${name}`}
        >
          Reading toolpath…
        </div>
      ),
    });
  }
  if (resource.kind === 'error') {
    return renderPane({
      body: (
        <div className='flex h-full flex-col items-center justify-center gap-1 bg-background p-6' role='alert'>
          <p className='text-sm font-medium'>The toolpath could not be read.</p>
          <p className='max-w-md text-center text-xs text-muted-foreground'>{resource.message}</p>
        </div>
      ),
    });
  }
  const slicedPlate = resource.slicedPlate ?? defaultPrinterPlate;
  const plate = plateChoice === 'as-sliced' ? slicedPlate : printerPlateById(plateChoice);
  return renderPane({
    actions: (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <PaneButton tooltip='More' aria-label='More'>
            <EllipsisVertical />
          </PaneButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='min-w-60'>
          <DropdownMenuItem onSelect={requestFrame}>
            <Focus aria-hidden />
            Frame the print
          </DropdownMenuItem>
          <DropdownMenuCheckboxItem checked={isWholePrinter} onCheckedChange={handleWholePrinter}>
            Show the whole printer
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Build plate</DropdownMenuLabel>
          <DropdownMenuRadioGroup aria-label='Build plate' value={plateChoice} onValueChange={handlePlate}>
            <DropdownMenuRadioItem value='as-sliced'>
              {resource.slicedPlate
                ? `As sliced (${resource.slicedPlate.label})`
                : `As sliced (not recorded; ${defaultPrinterPlate.label})`}
            </DropdownMenuRadioItem>
            {x1cPlates.map((candidate) => (
              <DropdownMenuRadioItem key={candidate.id} value={candidate.id}>
                {candidate.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    body: (
      <PrinterSimulation
        name={name}
        program={resource.program}
        digest={resource.digest}
        frameRequest={frameRequest}
        isWholePrinter={isWholePrinter}
        plate={plate}
      />
    ),
  });
}

/**
 * The printer the scene draws: the followed machine's own manifest, or the X1C
 * reference until one is bound and its providers load.
 *
 * @param live - The machine the viewer follows, when there is one.
 * @returns The resolved manifest and the scene geometry derived from it.
 */
const usePrinterGeometry = (live: PrinterLiveState | undefined) => {
  const manifest = resolvePrinterManifest(live?.manifest);
  const geometry = useMemo(() => derivePrinterGeometry(manifest), [manifest]);
  return { manifest, geometry };
};

/**
 * The G-code filter's state: every segment's group, and the groups hidden,
 * travel and wipes to begin with.
 *
 * @param program - The loaded toolpath.
 * @returns The grouping, the hidden set (a new set per change) and its toggle.
 */
const useToolpathFilter = (program: ToolpathProgram) => {
  const grouping = useMemo(() => groupToolpath(program), [program]);
  const [hiddenGroups, setHiddenGroups] = useState(defaultHiddenToolpathGroups);
  const handleGroupShown = useCallback((group: ToolpathGroup, isShown: boolean): void => {
    setHiddenGroups((previous) => {
      const next = new Set(previous);
      if (isShown) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }, []);
  return { grouping, hiddenGroups, handleGroupShown };
};

function PrinterSimulation({
  name,
  program,
  digest,
  frameRequest,
  isWholePrinter,
  plate,
}: Readonly<{
  name: string;
  program: ToolpathProgram;
  digest: string | undefined;
  frameRequest: number;
  isWholePrinter: boolean;
  plate: PrinterPlateModel;
}>): React.JSX.Element {
  const isReducedMotion = useSyncExternalStore(subscribeMotion, getMotion, serverMotion);
  const { theme } = useTheme();
  const live = usePrinterLive(digest);
  const hintId = useId();
  const [sceneError, setSceneError] = useState<string>();
  const { manifest, geometry } = usePrinterGeometry(live);
  // One cursor per loaded program; the parent remounts this tree when the file changes.
  const [store] = useState(() => createPlaybackStore(program, { isPlaying: !getMotion() }));
  const prefix = useMemo(() => createExtrusionPrefix(program), [program]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const { grouping, hiddenGroups, handleGroupShown } = useToolpathFilter(program);
  const position = live?.position;
  const isLiveAvailable = live?.printsThisFile === true;

  useEffect(() => {
    if (snapshot.isLive && position) {
      store.followLive(position);
    }
  }, [position, snapshot.isLive, store]);
  useEffect(() => {
    if (snapshot.isLive && !isLiveAvailable) {
      store.setLive(false);
    }
  }, [isLiveAvailable, snapshot.isLive, store]);
  useEffect(() => {
    const pauseWhenHidden = (): void => {
      if (document.hidden) {
        store.pause();
      }
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => {
      document.removeEventListener('visibilitychange', pauseWhenHidden);
    };
  }, [store]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>): void => {
      if ((event.target as HTMLElement).closest('button, input, select, textarea')) {
        return;
      }
      switch (event.key) {
        case ' ': {
          event.preventDefault();
          store.toggle();
          break;
        }
        case 'ArrowLeft': {
          event.preventDefault();
          store.step(-1);
          break;
        }
        case 'ArrowRight': {
          event.preventDefault();
          store.step(1);
          break;
        }
        default: {
          break;
        }
      }
    },
    [store],
  );
  const handleContextLost = useCallback(() => {
    store.pause();
    setSceneError('The graphics context was lost. Reopen the file to restart the simulation.');
  }, [store]);
  const handleSpeed = useCallback(
    (value: string): void => {
      const speed = playbackSpeeds.find((candidate) => String(candidate) === value);
      if (speed !== undefined) {
        store.setSpeed(speed);
      }
    },
    [store],
  );

  const layerCount = program.layerTable.length;
  const layerNumber = Math.max(0, snapshot.layer + 1);
  const nozzleTarget = live?.nozzleTarget ?? eventValueAt(program.events, 'nozzle-temperature', snapshot.time);
  const bedTarget = live?.bedTarget ?? eventValueAt(program.events, 'bed-temperature', snapshot.time);
  const filamentUsed = extrudedLengthAt(prefix, program, snapshot.time);
  const duration = Math.ceil(program.duration);

  return (
    <section
      aria-label={`Printer simulation: ${name}`}
      className='flex h-full min-h-0 flex-col bg-background'
      onKeyDown={handleKeyDown}
    >
      <div className='relative min-h-0 flex-1'>
        {sceneError === undefined ? (
          <div
            role='img'
            aria-label={`${manifest.identity.displayName} printing ${name}`}
            aria-describedby={hintId}
            tabIndex={0}
            className='absolute inset-0 outline-none focus-visible:focus-outline'
          >
            <PrinterScene
              program={program}
              geometry={geometry}
              store={store}
              theme={theme}
              filamentColor={live?.filamentColor ?? printerAccent}
              chamberLight={live?.chamberLight ?? 'unknown'}
              isReducedMotion={isReducedMotion}
              liveNozzleTarget={live?.nozzleTarget}
              frameRequest={frameRequest}
              isWholePrinter={isWholePrinter}
              plate={plate}
              grouping={grouping}
              hiddenGroups={hiddenGroups}
              onContextLost={handleContextLost}
            />
          </div>
        ) : (
          <div className='flex h-full items-center justify-center p-6' role='alert'>
            <p className='max-w-md text-center text-sm text-muted-foreground'>{sceneError}</p>
          </div>
        )}
        <p id={hintId} className='sr-only'>
          Space plays or pauses. Left and right arrows step one segment.
        </p>
        <section
          aria-label='Print HUD'
          className='pointer-events-none absolute top-2 left-2 rounded-md bg-background/80 px-2 py-1.5 text-xs tabular-nums'
        >
          <dl className='grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5'>
            <dt className='text-muted-foreground'>Layer</dt>
            <dd>
              {layerNumber} / {layerCount}
            </dd>
            <dt className='text-muted-foreground'>Elapsed</dt>
            <dd>{formatDuration(snapshot.time)}</dd>
            <dt className='text-muted-foreground'>Remaining</dt>
            <dd>{formatDuration(program.duration - snapshot.time)}</dd>
            <dt className='text-muted-foreground'>Nozzle</dt>
            <dd>{formatTemperature(nozzleTarget)}</dd>
            <dt className='text-muted-foreground'>Bed</dt>
            <dd>{formatTemperature(bedTarget)}</dd>
            <dt className='text-muted-foreground'>Filament</dt>
            <dd>
              {formatFilament(filamentUsed)} / {formatFilament(program.filamentLength)}
            </dd>
            {isLiveAvailable ? (
              <>
                <dt className='text-muted-foreground'>Machine</dt>
                <dd>
                  {live.machineName} · {live.runState}
                </dd>
              </>
            ) : null}
          </dl>
          {program.coverage.complete ? null : (
            <p className='mt-1 text-muted-foreground'>Preview shows known motion only</p>
          )}
        </section>
        <ToolpathFilter counts={grouping.counts} hiddenGroups={hiddenGroups} onGroupShown={handleGroupShown} />
      </div>
      <div
        role='group'
        aria-label='Playback controls'
        className='flex shrink-0 flex-wrap items-center gap-2 border-t border-border/70 px-2 py-1.5'
      >
        <Button type='button' size='sm' variant='outline' disabled={snapshot.isLive} onClick={store.toggle}>
          {snapshot.isPlaying ? <Pause aria-hidden /> : <Play aria-hidden />}
          {snapshot.isPlaying ? 'Pause' : 'Play'}
        </Button>
        <Button
          type='button'
          size='icon-sm'
          variant='ghost'
          aria-label='Previous segment'
          disabled={snapshot.isLive}
          onClick={() => {
            store.step(-1);
          }}
        >
          <SkipBack aria-hidden />
        </Button>
        <Button
          type='button'
          size='icon-sm'
          variant='ghost'
          aria-label='Next segment'
          disabled={snapshot.isLive}
          onClick={() => {
            store.step(1);
          }}
        >
          <SkipForward aria-hidden />
        </Button>
        <ToggleGroup
          type='single'
          size='sm'
          variant='outline'
          aria-label='Speed'
          value={String(snapshot.speed)}
          disabled={snapshot.isLive}
          onValueChange={handleSpeed}
        >
          {playbackSpeeds.map((speed) => (
            <ToggleGroupItem key={speed} value={String(speed)}>
              {speedLabel(speed)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <label className='flex min-w-40 flex-1 items-center gap-2 text-xs'>
          <span className='sr-only'>Time</span>
          <input
            type='range'
            className='h-6 w-full cursor-action accent-primary disabled:cursor-not-allowed'
            min={0}
            max={duration}
            step={1}
            value={snapshot.time}
            aria-valuetext={`${formatDuration(snapshot.time)} of ${formatDuration(program.duration)}`}
            disabled={snapshot.isLive}
            onChange={(event) => {
              store.seek(Number(event.target.value));
            }}
          />
        </label>
        <label className='flex min-w-28 items-center gap-2 text-xs'>
          <span className='text-muted-foreground'>Layer</span>
          <input
            type='range'
            className='h-6 w-full cursor-action accent-primary disabled:cursor-not-allowed'
            min={1}
            max={Math.max(1, layerCount)}
            step={1}
            value={Math.max(1, layerNumber)}
            aria-valuetext={`Layer ${layerNumber} of ${layerCount}`}
            disabled={snapshot.isLive || layerCount === 0}
            onChange={(event) => {
              store.seekLayer(Number(event.target.value) - 1);
            }}
          />
        </label>
        <label className='flex h-6 items-center gap-2 text-xs'>
          <Switch
            size='sm'
            aria-label='Live'
            checked={snapshot.isLive}
            disabled={!isLiveAvailable}
            onCheckedChange={store.setLive}
          />
          <Radio aria-hidden className='size-3.5' />
          Live
          {isLiveAvailable ? null : (
            <span className='text-muted-foreground'>
              · {live?.isActive ? 'The printer is running another file' : 'No active run to follow'}
            </span>
          )}
        </label>
        <Button type='button' size='sm' variant='ghost' disabled={snapshot.isLive} onClick={store.reset}>
          <RotateCcw aria-hidden />
          Reset
        </Button>
      </div>
    </section>
  );
}

/**
 * Which groups of the G-code the scene draws, top right over the scene. Only
 * the groups the program contains are listed; it folds to its heading.
 */
function ToolpathFilter({
  counts,
  hiddenGroups,
  onGroupShown,
}: Readonly<{
  counts: readonly number[];
  hiddenGroups: ReadonlySet<ToolpathGroup>;
  onGroupShown: (group: ToolpathGroup, isShown: boolean) => void;
}>): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(true);
  const listId = useId();
  const toggleOpen = useCallback((): void => {
    setIsOpen((previous) => !previous);
  }, []);
  return (
    <section aria-label='G-code filter' className='absolute top-2 right-2 rounded-md bg-background/80 text-xs'>
      <button
        type='button'
        aria-expanded={isOpen}
        aria-controls={listId}
        className='flex w-full cursor-action items-center gap-1.5 rounded-md px-2 py-1.5 outline-none hover:bg-accent focus-visible:focus-outline'
        onClick={toggleOpen}
      >
        <ListFilter aria-hidden className='size-3.5' />
        G-code
        <ChevronDown
          aria-hidden
          className={cn('ml-auto size-3.5 transition-transform duration-150 ease-out', isOpen ? '' : '-rotate-90')}
        />
      </button>
      {isOpen ? (
        <ul id={listId} className='flex flex-col gap-1.5 px-2 pt-0.5 pb-2'>
          {toolpathGroups.map((group, index) =>
            counts[index] ? (
              <li key={group}>
                <label className='flex cursor-action items-center gap-2'>
                  <Checkbox
                    checked={!hiddenGroups.has(group)}
                    onCheckedChange={(checked) => {
                      onGroupShown(group, checked === true);
                    }}
                  />
                  {toolpathGroupLabels[group]}
                </label>
              </li>
            ) : null,
          )}
        </ul>
      ) : null}
    </section>
  );
}
