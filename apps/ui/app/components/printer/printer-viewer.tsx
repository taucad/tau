import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Pause, Play, Radio, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import type { ToolpathProgram } from '@taucad/slicer/toolpath';
import { Button } from '@taucad/ui/components/button';
import { Switch } from '@taucad/ui/components/switch';
import { ToggleGroup, ToggleGroupItem } from '@taucad/ui/components/toggle-group';
import { useTheme } from '#hooks/use-theme.js';
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
import { PrinterScene } from '#components/printer/printer-scene.js';
import { usePrinterLive } from '#components/printer/use-printer-live.js';
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
  | Readonly<{ kind: 'ready'; program: ToolpathProgram }>
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

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        const program = loadPrinterProgram(await readAll(), kind);
        if (active) {
          setResource({ kind: 'ready', program });
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
  return renderPane({ body: <PrinterSimulation name={name} program={resource.program} /> });
}

function PrinterSimulation({ name, program }: Readonly<{ name: string; program: ToolpathProgram }>): React.JSX.Element {
  const isReducedMotion = useSyncExternalStore(subscribeMotion, getMotion, serverMotion);
  const { theme } = useTheme();
  const live = usePrinterLive();
  const hintId = useId();
  const [sceneError, setSceneError] = useState<string>();
  // The directory carries no manifest yet; the seam resolves to the X1C reference.
  const manifest = resolvePrinterManifest(undefined);
  const geometry = useMemo(() => derivePrinterGeometry(manifest), [manifest]);
  // One cursor per loaded program; the parent remounts this tree when the file changes.
  const [store] = useState(() => createPlaybackStore(program, { isPlaying: !getMotion() }));
  const prefix = useMemo(() => createExtrusionPrefix(program), [program]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const position = live?.position;
  const isLiveAvailable = live?.isActive === true;

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
            {live?.isActive ? (
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
          {isLiveAvailable ? null : <span className='text-muted-foreground'>· No active run to follow</span>}
        </label>
        <Button type='button' size='sm' variant='ghost' disabled={snapshot.isLive} onClick={store.reset}>
          <RotateCcw aria-hidden />
          Reset
        </Button>
      </div>
    </section>
  );
}
