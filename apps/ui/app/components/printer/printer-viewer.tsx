/* oxlint-disable no-bitwise -- Decode the parser confidence flags for inspection. */
import type { PrinterProgram } from '#components/printer/printer-program.js';
import type { BeadData } from '#components/printer/printer-bead-data.js';
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
import { segmentAtTime, toolpathSegmentKinds } from '@taucad/slicer/toolpath';
import type { ToolpathProgram } from '@taucad/slicer/toolpath';
import { filamentModes } from '#components/printer/printer-filament-material.js';
import type { FilamentMode } from '#components/printer/printer-filament-material.js';
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
import { printerPreparation } from '#components/printer/printer-preparation.js';
import { PaneButton } from '#components/ui/pane-button.js';
import { MaterialSwatch } from '#components/geometry/cad/material-swatch.js';
import { printerAccent } from '#components/printer/printer-colors.constants.js';
import type { PrinterFileKind } from '#components/printer/printer-file.js';
import { derivePrinterGeometry } from '#components/printer/printer-geometry.js';
import { resolvePrinterManifest } from '#components/printer/printer-manifest.fixture.js';
import {
  createPlaybackStore,
  eventValueAt,
  extrudedLengthAt,
  formatDuration,
  playbackSpeeds,
} from '#components/printer/printer-playback.js';
import type {
  LiveRunPosition,
  PlaybackSnapshot,
  PlaybackSpeed,
  PlaybackStore,
} from '#components/printer/printer-playback.js';
import { defaultPrinterPlate, printerPlatesForModel } from '#components/printer/printer-plates.js';
import type { PrinterPlateId, PrinterPlateModel } from '#components/printer/printer-plates.js';
import { PrinterScene } from '#components/printer/printer-scene.js';
import { createToolpathPalette } from '#components/printer/printer-toolpath.js';
import {
  defaultHiddenToolpathGroups,
  groupToolpath,
  toolpathGroupLabels,
  toolpathGroupSwatchKind,
  toolpathGroups,
} from '#components/printer/printer-toolpath-groups.js';
import type { ToolpathGroup } from '#components/printer/printer-toolpath-groups.js';
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
      prepared: PrinterProgram;
      opened: number;
      beads: BeadData;
      program: ToolpathProgram;
      slicedPlate: PrinterPlateModel | undefined;
      recordedBedType: string | undefined;
      filamentColors: readonly string[];
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
  const [isHousingVisible, setIsHousingVisible] = useState(true);
  const [isWholePrinter, setIsWholePrinter] = useState(false);
  const live = usePrinterLive(resource.kind === 'ready' ? resource.digest : undefined);
  const model = live?.manifest?.identity.model;
  const plates = printerPlatesForModel(model);
  const [plateChoice, setPlateChoice] = useState<PrinterPlateId | 'as-sliced'>('as-sliced');
  const requestFrame = useCallback((): void => {
    setFrameRequest((count) => count + 1);
  }, []);
  const handleWholePrinter = useCallback((checked: boolean): void => {
    setIsWholePrinter(checked);
    // A different scene is framed afresh, whatever the person did to the last one.
    setFrameRequest((count) => count + 1);
  }, []);
  const handlePlate = useCallback(
    (value: string): void => {
      setPlateChoice(plates.find(({ id }) => id === value)?.id ?? 'as-sliced');
    },
    [plates],
  );

  useEffect(() => {
    const controller = new AbortController();
    const opened = performance.now();
    const load = async (): Promise<void> => {
      try {
        const bytes = await readAll();
        const prepared = await printerPreparation.prepare({ bytes, kind, signal: controller.signal });
        if (prepared.kind === 'refused') {
          throw new Error(prepared.summary.previewRefusal);
        }
        const { program, beads, slicedPlate, filamentColors, recordedBedType } = prepared.value;
        if (!controller.signal.aborted) {
          performance.clearMeasures('tau.printer.prepared');
          performance.measure('tau.printer.prepared', {
            start: opened,
            end: performance.now(),
            detail: {
              bytes: bytes.byteLength,
              segments: program.segmentCount,
              preparationDuration: prepared.preparationDuration,
              stages: prepared.stageDurations,
            },
          });
          setResource({
            prepared: prepared.value,
            opened,
            kind: 'ready',
            program,
            beads,
            slicedPlate,
            filamentColors,
            recordedBedType,
            digest: prepared.digest,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
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
      controller.abort();
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
  const slicedPlate =
    plates.find(({ id }) => id === resource.slicedPlate?.id) ??
    plates.find(({ id }) => id === 'textured-pei') ??
    defaultPrinterPlate;
  const plate =
    plateChoice === 'as-sliced' ? slicedPlate : (plates.find(({ id }) => id === plateChoice) ?? slicedPlate);
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
          {isWholePrinter && (model === 'x1c' || model === undefined) ? (
            <DropdownMenuCheckboxItem checked={isHousingVisible} onCheckedChange={setIsHousingVisible}>
              Show enclosure
            </DropdownMenuCheckboxItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Build plate</DropdownMenuLabel>
          <DropdownMenuRadioGroup aria-label='Build plate' value={plateChoice} onValueChange={handlePlate}>
            <DropdownMenuRadioItem value='as-sliced'>
              {resource.slicedPlate
                ? `As sliced (${resource.slicedPlate.label}${plates.some(({ id }) => id === resource.slicedPlate?.id) ? '' : '; unavailable on this printer'})`
                : resource.recordedBedType
                  ? `As sliced (${resource.recordedBedType}; unsupported)`
                  : `As sliced (not recorded; ${slicedPlate.label})`}
            </DropdownMenuRadioItem>
            {plates.map((candidate) => (
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
        beads={resource.beads}
        prepared={resource.prepared}
        opened={resource.opened}
        slicedFilamentColors={resource.filamentColors}
        live={live}
        frameRequest={frameRequest}
        isWholePrinter={isWholePrinter}
        isHousingVisible={isHousingVisible}
        plateNotice={
          plateChoice === 'as-sliced' &&
          resource.slicedPlate &&
          !plates.some(({ id }) => id === resource.slicedPlate?.id)
            ? `Recorded ${resource.slicedPlate.label} is unavailable on this printer. Previewing ${plate.label}.`
            : plateChoice === 'as-sliced' && resource.recordedBedType && !resource.slicedPlate
              ? `Recorded ${resource.recordedBedType} is unsupported. Previewing ${plate.label}.`
              : undefined
        }
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
  const followed = live?.manifest;
  const manifest = useMemo(() => resolvePrinterManifest(followed), [followed]);
  const geometry = useMemo(() => derivePrinterGeometry(manifest), [manifest]);
  return { manifest, geometry };
};

/**
 * Each tool's filament colour, each filter group's colours as the scene draws them, and the filaments the
 * legend lists. A tool the file records no colour for takes the colour a file without any takes: the loaded
 * spool's, else the accent. A program that prints with one filament lists none.
 *
 * @param colours - `recorded`: `#RRGGBB` per filament the file records, in filament order; `loaded`: the followed
 * machine's loaded spool colour; `tools`: the tools the program extrudes with, ascending; `theme`: the resolved theme.
 * @returns The colour per tool (one at least), per group and per listed filament.
 */
const useToolpathColors = ({
  recorded,
  loaded,
  tools,
  theme,
}: Readonly<{
  recorded: readonly string[];
  loaded: string | undefined;
  tools: readonly number[];
  theme: 'light' | 'dark';
}>) =>
  useMemo(() => {
    const fallback = loaded ?? printerAccent;
    const toolColors = Array.from(
      { length: Math.max(1, ...tools.map((tool) => tool + 1)) },
      (_, tool) => recorded[tool] ?? fallback,
    );
    // The legend swatches read the scene's own palettes, so they match the drawn toolpath.
    const palettes = (tools.length > 0 ? tools : [0]).map((tool) => createToolpathPalette(toolColors[tool]!, theme));
    const groupColors = toolpathGroups.map((group) =>
      palettes.map((palette) => `#${palette[toolpathGroupSwatchKind[group]].getHexString()}`),
    );
    const filaments = tools.length > 1 ? tools.map((tool) => ({ tool, color: toolColors[tool]! })) : [];
    return { toolColors, groupColors, filaments };
  }, [recorded, loaded, tools, theme]);

/**
 * The G-code filter's state: every segment's group, and the groups hidden,
 * travel and wipes to begin with.
 *
 * @param program - The loaded toolpath.
 * @returns The grouping, the hidden set (a new set per change) and its toggle.
 */
const useToolpathFilter = (program: ToolpathProgram, preparedGrouping?: PrinterProgram['grouping']) => {
  const grouping = useMemo(() => preparedGrouping ?? groupToolpath(program), [program, preparedGrouping]);
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

/**
 * Keep the cursor on the followed machine while Live is on, leave Live once the machine stops printing
 * this file, and pause while the document is hidden.
 */
const useLivePlayback = (
  store: PlaybackStore,
  {
    isLive,
    position,
    isLiveAvailable,
  }: Readonly<{ isLive: boolean; position: LiveRunPosition | undefined; isLiveAvailable: boolean }>,
): void => {
  useEffect(() => {
    if (isLive && position) {
      store.followLive(position);
    }
  }, [position, isLive, store]);
  useEffect(() => {
    if (isLive && !isLiveAvailable) {
      store.setLive(false);
    }
  }, [isLiveAvailable, isLive, store]);
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
};

function PrinterSimulation({
  name,
  program,
  beads,
  prepared,
  opened,
  slicedFilamentColors,
  live,
  frameRequest,
  isWholePrinter,
  isHousingVisible,
  plateNotice,
  plate,
}: Readonly<{
  name: string;
  program: ToolpathProgram;
  beads: BeadData;
  prepared: PrinterProgram;
  opened: number;
  /** The colours the file was sliced with, in filament order, which the model's own colours set. */
  slicedFilamentColors: readonly string[];
  live: PrinterLiveState | undefined;
  frameRequest: number;
  isWholePrinter: boolean;
  isHousingVisible: boolean;
  plateNotice: string | undefined;
  plate: PrinterPlateModel;
}>): React.JSX.Element {
  const isReducedMotion = useSyncExternalStore(subscribeMotion, getMotion, serverMotion);
  const { theme } = useTheme();
  const hintId = useId();
  const [appearance, setAppearance] = useState<FilamentMode>('filament');
  const [emphasizeLayer, setEmphasizeLayer] = useState(false);
  const { maximums } = prepared;
  const analysisMaximum =
    appearance === 'width' || appearance === 'speed' || appearance === 'flow' ? maximums[appearance] : 1;
  const [assetStatus, setAssetStatus] = useState<string>();
  const [sceneError, setSceneError] = useState<string>();
  const { manifest, geometry } = usePrinterGeometry(live);
  // One cursor per loaded program; the parent remounts this tree when the file changes. It opens on
  // the finished print; the sliders and Play review how it got there.
  const [store] = useState(() => createPlaybackStore(program, { time: program.duration }));
  const scene = useRef<HTMLElement>(null);
  const firstFrame = useCallback(() => {
    performance.clearMeasures('tau.printer.open');
    performance.measure('tau.printer.open', {
      start: opened,
      end: performance.now(),
      detail: { segments: program.segmentCount },
    });
  }, [opened, program]);
  useEffect(() => {
    if (!scene.current || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries[0] && !entries[0].isIntersecting) {
        store.pause();
      }
    });
    observer.observe(scene.current);
    return () => {
      observer.disconnect();
    };
  }, [store]);
  const { prefix } = prepared;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const { grouping, hiddenGroups, handleGroupShown } = useToolpathFilter(program, prepared.grouping);
  const { tools } = prepared;
  const { toolColors, groupColors, filaments } = useToolpathColors({
    recorded: slicedFilamentColors,
    loaded: live?.filamentColor,
    tools,
    theme,
  });
  useLivePlayback(store, {
    isLive: snapshot.isLive,
    position: live?.position,
    isLiveAvailable: live?.printsThisFile === true,
  });

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

  return (
    <section
      ref={scene}
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
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focus target for the scene's keyboard camera controls
            tabIndex={0}
            className='absolute inset-0 outline-none focus-visible:focus-outline'
          >
            <PrinterScene
              program={program}
              beads={beads}
              preparedBounds={prepared.summary.partBounds}
              onFirstFrame={firstFrame}
              appearance={appearance}
              analysisMaximum={analysisMaximum}
              emphasizeLayer={emphasizeLayer}
              geometry={geometry}
              store={store}
              theme={theme}
              filamentColors={toolColors}
              chamberLight={live?.chamberLight ?? 'unknown'}
              isReducedMotion={isReducedMotion}
              liveNozzleTarget={live?.nozzleTarget}
              frameRequest={frameRequest}
              isWholePrinter={isWholePrinter}
              isHousingVisible={isHousingVisible}
              onAssetStatus={setAssetStatus}
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
        {(plateNotice ?? assetStatus) ? (
          <p
            role='status'
            aria-label='Build plate preview'
            className='absolute bottom-2 left-2 rounded bg-background/90 px-2 py-1 text-xs text-muted-foreground'
          >
            {plateNotice ?? assetStatus}
          </p>
        ) : null}
        <p id={hintId} className='sr-only'>
          Space plays or pauses. Left and right arrows step one segment.
        </p>
        <details className='absolute right-2 bottom-2 max-h-full max-w-xs overflow-auto rounded-md bg-background/90 px-2 py-1 text-xs'>
          <summary className='cursor-action py-1 focus-visible:focus-outline'>Filament inspection</summary>
          <label className='flex items-center justify-between gap-3 py-1'>
            Colour by
            <select
              aria-label='Filament colour mode'
              value={appearance}
              className='rounded border border-input bg-background px-2 py-1 focus-visible:focus-outline'
              onChange={(event) => {
                const mode = filamentModes.find((value) => value === event.target.value);
                if (mode) {
                  setAppearance(mode);
                }
              }}
            >
              <option value='filament'>Filament</option>
              <option value='role'>Feature</option>
              <option value='width'>Width</option>
              <option value='speed'>Speed</option>
              <option value='flow'>Volumetric flow</option>
            </select>
          </label>
          {appearance === 'width' || appearance === 'speed' || appearance === 'flow' ? (
            <p>
              Low → high: 0–{analysisMaximum.toFixed(2)}{' '}
              {appearance === 'width' ? 'mm' : appearance === 'speed' ? 'mm/s' : 'mm³/s'}
            </p>
          ) : null}
          <label className='flex items-center gap-2 py-1'>
            <Checkbox
              checked={emphasizeLayer}
              onCheckedChange={(value) => {
                setEmphasizeLayer(value === true);
              }}
            />
            Emphasize current layer
          </label>
          <FilamentInspection
            program={program}
            time={snapshot.time}
            hasRecordedColors={slicedFilamentColors.length > 0}
          />
        </details>
        <PrintHud eventIndex={prepared.eventIndex} program={program} snapshot={snapshot} prefix={prefix} live={live} />
        <ToolpathFilter
          counts={grouping.counts}
          colors={groupColors}
          filaments={filaments}
          hiddenGroups={hiddenGroups}
          onGroupShown={handleGroupShown}
        />
      </div>
      <PlaybackControls program={program} store={store} snapshot={snapshot} live={live} />
    </section>
  );
}

/** Exact deposition values at the playback cursor, alongside their limitations. */
function FilamentInspection({
  program,
  time,
  hasRecordedColors,
}: Readonly<{ program: ToolpathProgram; time: number; hasRecordedColors: boolean }>): React.JSX.Element {
  const segment = Math.min(program.segmentCount - 1, segmentAtTime(program, time));
  const { deposition } = program;
  const confidence = deposition?.confidence[segment] ?? 0;
  const offset = Math.max(0, segment) * 6;
  const length =
    segment < 0
      ? 0
      : Math.hypot(
          program.positions[offset + 3]! - program.positions[offset]!,
          program.positions[offset + 4]! - program.positions[offset + 1]!,
          program.positions[offset + 5]! - program.positions[offset + 2]!,
        ) *
        (1 - (deposition?.starts[segment] ?? 0));
  const flow = length > 0 ? ((deposition?.volumes[segment] ?? 0) / length) * program.feedrates[segment]! : 0;
  const provenance =
    confidence & 1 ? 'Annotated width' : confidence & 8 ? 'Width inferred from extrusion' : 'Width assumed';
  return (
    <div className='space-y-2 py-2'>
      <p>
        {hasRecordedColors
          ? 'File filament colours'
          : 'Filament colour assumed from the loaded spool or preview default'}
        .
      </p>
      {segment >= 0 && deposition ? (
        <dl className='grid grid-cols-2 gap-1 tabular-nums'>
          <dt>Feature</dt>
          <dd>{toolpathSegmentKinds[program.kinds[segment]!]}</dd>
          <dt>Width / height</dt>
          <dd>
            {deposition.widths[segment]!.toFixed(3)} / {deposition.heights[segment]!.toFixed(3)} mm
          </dd>
          <dt>Deposited volume</dt>
          <dd>{deposition.volumes[segment]!.toFixed(3)} mm³</dd>
          <dt>Speed</dt>
          <dd>{program.feedrates[segment]!.toFixed(2)} mm/s</dd>
          <dt>Volumetric flow</dt>
          <dd>{flow.toFixed(3)} mm³/s</dd>
          <dt>Tool</dt>
          <dd>T{program.tools[segment]}</dd>
          <dt>Dimensions</dt>
          <dd>
            {deposition.volumes[segment]! > 0 && deposition.widths[segment]! > 0
              ? `${provenance}; ${confidence & 2 ? 'annotated height' : confidence & 4 ? 'file settings' : 'inferred or assumed height'}`
              : 'No rendered deposition'}
          </dd>
        </dl>
      ) : null}
      <p>
        Ideal deposited shape. Bridges are unsagged; ironing uses a thin assumed height when unannotated. Pressure,
        cooling and surface texture are not simulated.
      </p>
      {deposition?.warnings.map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
    </div>
  );
}

/** Where the run stands, top left over the scene: layer, time, temperatures, filament and the followed machine. */
function PrintHud({
  eventIndex,
  program,
  snapshot,
  prefix,
  live,
}: Readonly<{
  eventIndex: PrinterProgram['eventIndex'];
  program: ToolpathProgram;
  snapshot: PlaybackSnapshot;
  /** Filament fed before each segment, from `createExtrusionPrefix`. */
  prefix: Float64Array;
  live: PrinterLiveState | undefined;
}>): React.JSX.Element {
  const nozzleTarget = live?.nozzleTarget ?? eventValueAt(eventIndex, 'nozzle-temperature', snapshot.time);
  const bedTarget = live?.bedTarget ?? eventValueAt(eventIndex, 'bed-temperature', snapshot.time);
  const isLiveAvailable = live?.printsThisFile === true;
  return (
    <section
      aria-label='Print HUD'
      className='pointer-events-none absolute top-2 left-2 rounded-md bg-background/80 px-2 py-1.5 text-xs tabular-nums'
    >
      <dl className='grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5'>
        <dt className='text-muted-foreground'>Layer</dt>
        <dd>
          {Math.max(0, snapshot.layer + 1)} / {program.layerTable.length}
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
          {formatFilament(extrudedLengthAt(prefix, program, snapshot.time))} / {formatFilament(program.filamentLength)}
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
      {program.coverage.complete ? null : <p className='mt-1 text-muted-foreground'>Preview shows known motion only</p>}
    </section>
  );
}

/** Play, step, speed, the time and layer sliders, Live and Reset, under the scene. */
function PlaybackControls({
  program,
  store,
  snapshot,
  live,
}: Readonly<{
  program: ToolpathProgram;
  store: PlaybackStore;
  snapshot: PlaybackSnapshot;
  live: PrinterLiveState | undefined;
}>): React.JSX.Element {
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
  const isLiveAvailable = live?.printsThisFile === true;
  return (
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
          max={Math.ceil(program.duration)}
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
  );
}

/**
 * Which groups of the G-code the scene draws, top right over the scene, and
 * the filaments a multi-colour program prints with. Only the groups the
 * program contains are listed; it folds to its heading.
 */
function ToolpathFilter({
  counts,
  colors,
  filaments,
  hiddenGroups,
  onGroupShown,
}: Readonly<{
  counts: readonly number[];
  /** CSS colours per {@link toolpathGroups} entry, one per filament, as the scene tints the group. */
  colors: ReadonlyArray<readonly string[]>;
  /** Each filament listed, in filament order: its tool and colour. */
  filaments: ReadonlyArray<Readonly<{ tool: number; color: string }>>;
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
        <div id={listId}>
          <ul className='flex flex-col gap-1.5 px-2 pt-0.5 pb-2'>
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
                    <MaterialSwatch
                      materials={(colors[index] ?? []).map((color) => ({
                        color,
                        roughness: 1,
                        metalness: 0,
                        isUnlit: true,
                      }))}
                    />
                    {toolpathGroupLabels[group]}
                  </label>
                </li>
              ) : null,
            )}
          </ul>
          {filaments.length > 0 ? (
            <ul aria-label='Filaments' className='flex flex-col gap-1.5 border-t border-border/70 py-2 pr-2 pl-8'>
              {filaments.map(({ tool, color }) => (
                <li key={tool} className='flex items-center gap-2'>
                  <MaterialSwatch materials={[{ color, roughness: 1, metalness: 0, isUnlit: true }]} />
                  Filament {tool + 1}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
