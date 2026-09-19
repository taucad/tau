import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { MetaFunction } from 'react-router';
import { ArrowRight, Pause, Play } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { ToggleGroup, ToggleGroupItem } from '@taucad/ui/components/toggle-group';
import { cn } from '@taucad/ui/utils/cn';
import type {
  GlassPrismLoaderController,
  GlassPrismLoaderStatistics,
  GlassPrismSequenceState,
} from '#components/geometry/loader/glass-prism-controller.js';
import type { GlassPrismLoaderStatus } from '#components/geometry/loader/glass-prism-loader.js';
import {
  glassPrismShapeCaptions,
  glassPrismShapeIds,
  glassPrismShapeLabels,
} from '#components/geometry/loader/glass-prism-shapes.js';
import type { GlassPrismShapeId } from '#components/geometry/loader/glass-prism-shapes.js';
import type { ShowcaseFrameCapture } from '#components/geometry/loader/showcase-capture.js';
import { LazySection } from '#components/ui/lazy-section.js';
import { Loader } from '#components/ui/loader.js';
import { useFeature } from '#flags/use-feature.js';
import type { Handle } from '#types/matches.types.js';

const GlassPrismLoaderLazy = lazy(async () => {
  const module = await import('#components/geometry/loader/glass-prism-loader.js');
  return { default: module.GlassPrismLoader };
});

type PlaybackSpeed = '0.5' | '1' | '1.5';

type GlassPrismDebugBridge = Readonly<{
  getState: () => GlassPrismSequenceState & GlassPrismLoaderStatistics & { readonly status: GlassPrismLoaderStatus };
  getShaderSource: () => Promise<{ readonly vertexShader: string; readonly fragmentShader: string }>;
  /** Offscreen readback of the current pose through the active backend. */
  captureFrame: () => Promise<ShowcaseFrameCapture>;
}>;

type GlassPrismDebugGlobal = typeof globalThis & { __TAU_GLASS_PRISM__?: GlassPrismDebugBridge };

const pageTitle = 'Glass prism loader — Tau';
const pageDescription =
  'A refraction-inspired loading indicator: a white beam meets a glass body that flows between five morphologies and leaves it as a spectrum, traced through the glass every frame.';
/** Milliseconds between renderer statistics reads for the readout. */
const statisticsRefresh = 500;

export const meta: MetaFunction = () => [
  { title: pageTitle },
  { name: 'description', content: pageDescription },
  { name: 'robots', content: 'noindex' },
];

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant='ghost'>
        <Link to='/loader/glass'>Glass loader</Link>
      </Button>
    );
  },
  enableOverflowY: true,
};

const backendLabels: Readonly<Record<GlassPrismLoaderStatistics['backend'], string>> = {
  webgpu: 'WebGPU',
  webgl2: 'WebGL 2 fallback',
};

function StageSkeleton(): React.JSX.Element {
  return (
    <div className='flex size-full items-center justify-center'>
      <Loader className='size-6 text-muted-foreground' />
    </div>
  );
}

function SectionHeading({ id, children }: { readonly id: string; readonly children: string }): React.JSX.Element {
  return (
    <h2 id={id} className='font-mono text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase'>
      {children}
    </h2>
  );
}

export default function GlassLoaderShowcase(): React.JSX.Element {
  const isTauDebugEnabled = useFeature('tauDebug');
  const [controller, setController] = useState<GlassPrismLoaderController>();
  const [status, setStatus] = useState<GlassPrismLoaderStatus>('pending');
  const [sequence, setSequence] = useState<GlassPrismSequenceState>();
  const [statistics, setStatistics] = useState<GlassPrismLoaderStatistics>();
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>('1');

  const handleReady = useCallback((ready: GlassPrismLoaderController): void => {
    setController(ready);
    setSequence(ready.getSequenceState());
    setStatistics(ready.getStatistics());
  }, []);

  const handleSpeedChange = useCallback((value: string): void => {
    if (value === '0.5' || value === '1' || value === '1.5') {
      setSpeed(value);
    }
  }, []);

  const togglePaused = useCallback((): void => {
    setIsPaused((previous) => !previous);
  }, []);

  useEffect(() => {
    if (!controller) {
      return;
    }
    const statisticsTimer = setInterval(() => {
      setStatistics(controller.getStatistics());
    }, statisticsRefresh);
    return () => {
      clearInterval(statisticsTimer);
    };
  }, [controller]);

  useEffect(() => {
    if (!isTauDebugEnabled || !controller) {
      return;
    }
    const bridge: GlassPrismDebugBridge = {
      getState: () => ({ ...controller.getSequenceState(), ...controller.getStatistics(), status }),
      getShaderSource: async () => controller.getShaderSource(),
      captureFrame: async () => controller.captureFrame(),
    };
    (globalThis as GlassPrismDebugGlobal).__TAU_GLASS_PRISM__ = bridge;
    return () => {
      delete (globalThis as GlassPrismDebugGlobal).__TAU_GLASS_PRISM__;
    };
  }, [controller, isTauDebugEnabled, status]);

  const currentShape = sequence?.currentShape;
  // Ordinals are absolute positions in the loop, so keys stay stable when the bounded history shifts.
  const historyEntries = useMemo(() => {
    if (!sequence) {
      return [];
    }
    const historyStart = sequence.transitionCount - (sequence.history.length - 1);
    return sequence.history.map((shape, position) => ({ ordinal: historyStart + position, shape }));
  }, [sequence]);

  return (
    <div className='container mx-auto max-w-6xl space-y-12 px-4 py-10'>
      <header className='space-y-3'>
        <p className='font-mono text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase'>
          Brand · Loading indicator · Glass
        </p>
        <h1 className='text-4xl font-semibold tracking-tight text-balance md:text-5xl'>Glass prism loader</h1>
        <p className='max-w-[64ch] text-lg text-muted-foreground'>
          A white beam meets a body of glass and leaves it as a spectrum. The body flows between five morphologies, each
          bending the light its own way, and the spectrum is traced through the glass anew every frame, so the pattern
          never repeats.
        </p>
        <p className='text-sm text-muted-foreground'>
          <Link to='/loader' className='underline underline-offset-4'>
            The liquid metal loader
          </Link>{' '}
          is the other brand indicator.
        </p>
      </header>

      <div className='grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start'>
        <section aria-labelledby='stage-heading' className='space-y-3'>
          <SectionHeading id='stage-heading'>Stage</SectionHeading>
          <div className='relative aspect-square w-full overflow-hidden rounded-2xl border bg-muted/40'>
            <LazySection minHeight='100%' className='size-full' fallback={<StageSkeleton />}>
              <Suspense fallback={<StageSkeleton />}>
                <GlassPrismLoaderLazy
                  className='size-full'
                  semantic='img'
                  label='Glass prism loader showcase'
                  quality='high'
                  speed={Number(speed)}
                  isPaused={isPaused}
                  onReady={handleReady}
                  onSequenceChange={setSequence}
                  onStatusChange={setStatus}
                />
              </Suspense>
            </LazySection>
            {statistics ? (
              <div className='pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-md border bg-background/80 px-2 py-1 font-mono text-xs text-muted-foreground backdrop-blur-sm'>
                <span>{backendLabels[statistics.backend]}</span>
                <span aria-hidden='true'>·</span>
                <span className='tabular-nums'>{Math.round(statistics.framesPerSecond)} fps</span>
              </div>
            ) : null}
          </div>
          <p className='text-sm text-muted-foreground'>
            The studio follows the app theme. In the dark the beam is added light; on a light page it is printed.
          </p>
        </section>

        <aside className='space-y-8'>
          <section aria-labelledby='playback-heading' className='space-y-3'>
            <SectionHeading id='playback-heading'>Playback</SectionHeading>
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                aria-pressed={isPaused}
                aria-label={isPaused ? 'Play loader animation' : 'Pause loader animation'}
                onClick={togglePaused}
              >
                {isPaused ? <Play className='size-4' /> : <Pause className='size-4' />}
                {isPaused ? 'Play' : 'Pause'}
              </Button>
              <ToggleGroup
                type='single'
                variant='outline'
                size='sm'
                value={speed}
                aria-label='Playback speed'
                onValueChange={handleSpeedChange}
              >
                <ToggleGroupItem value='0.5' aria-label='Half speed'>
                  0.5×
                </ToggleGroupItem>
                <ToggleGroupItem value='1' aria-label='Normal speed'>
                  1×
                </ToggleGroupItem>
                <ToggleGroupItem value='1.5' aria-label='One and a half speed'>
                  1.5×
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </section>

          <section aria-labelledby='forms-heading' className='space-y-3'>
            <SectionHeading id='forms-heading'>Morphologies</SectionHeading>
            <p className='text-sm text-muted-foreground'>
              Jump to a form now; the loop resumes its random walk from there.
            </p>
            <div className='grid grid-cols-2 gap-2'>
              {glassPrismShapeIds.map((id: GlassPrismShapeId) => (
                <Button
                  key={id}
                  variant={id === currentShape ? 'secondary' : 'outline'}
                  size='sm'
                  className='justify-start'
                  aria-pressed={id === currentShape}
                  disabled={!controller}
                  onClick={() => {
                    controller?.jumpTo(id);
                  }}
                >
                  {glassPrismShapeLabels[id]}
                </Button>
              ))}
            </div>
          </section>

          <section aria-labelledby='sequence-heading' className='space-y-3'>
            <SectionHeading id='sequence-heading'>Sequence</SectionHeading>
            {sequence ? (
              <ol aria-label='Recent forms' className='flex flex-wrap items-center gap-1 text-xs'>
                {historyEntries.map((entry) => (
                  <li key={entry.ordinal} className='flex items-center gap-1'>
                    {entry.ordinal > historyEntries[0]!.ordinal ? (
                      <ArrowRight aria-hidden='true' className='size-3 text-muted-foreground' />
                    ) : null}
                    <span
                      className={cn(
                        'rounded-md border px-1.5 py-0.5',
                        entry.ordinal === sequence.transitionCount
                          ? 'border-foreground/40 font-medium'
                          : 'text-muted-foreground',
                      )}
                    >
                      {glassPrismShapeLabels[entry.shape]}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
            {sequence?.phase === 'morph' ? (
              <p className='text-sm'>
                Flowing into <span className='font-medium'>{glassPrismShapeLabels[sequence.nextShape]}</span>
              </p>
            ) : null}
          </section>

          <section aria-labelledby='renderer-heading' className='space-y-3'>
            <SectionHeading id='renderer-heading'>Renderer</SectionHeading>
            <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm'>
              <dt className='text-muted-foreground'>Backend</dt>
              <dd>{statistics ? backendLabels[statistics.backend] : '—'}</dd>
              <dt className='text-muted-foreground'>Frame rate</dt>
              <dd className='tabular-nums'>{statistics ? `${Math.round(statistics.framesPerSecond)} fps` : '—'}</dd>
              <dt className='text-muted-foreground'>Vertices</dt>
              <dd className='tabular-nums'>{statistics ? statistics.vertexCount.toLocaleString() : '—'}</dd>
              <dt className='text-muted-foreground'>Light ribbons</dt>
              <dd className='tabular-nums'>{statistics ? statistics.ribbonCount.toLocaleString() : '—'}</dd>
              <dt className='text-muted-foreground'>Bloom</dt>
              <dd>{statistics ? (statistics.isBloomEnabled ? 'On' : 'Off') : '—'}</dd>
              <dt className='text-muted-foreground'>Status</dt>
              <dd>{status}</dd>
            </dl>
            <p className='text-xs text-muted-foreground'>
              Add <code className='font-mono'>?graphicsBackend=webgl</code> to the URL to force the WebGL 2 backend.
            </p>
          </section>
        </aside>
      </div>

      <section aria-labelledby='patterns-heading' className='space-y-3'>
        <SectionHeading id='patterns-heading'>Five refractive patterns</SectionHeading>
        <p className='max-w-[72ch] text-sm text-muted-foreground'>
          The beam is traced through the body&apos;s cross-section in the light sheet, seven wavelengths at a time, with
          Fresnel-weighted reflection at every face and total internal reflection where the angle demands it. Each
          morphology lies in the sheet its own way, so each throws a different pattern.
        </p>
        <dl className='grid gap-4 sm:grid-cols-2 lg:grid-cols-5'>
          {glassPrismShapeIds.map((id: GlassPrismShapeId) => (
            <div key={id} className='space-y-1 rounded-lg border bg-muted/40 p-4'>
              <dt className='text-sm font-medium'>{glassPrismShapeLabels[id]}</dt>
              <dd className='text-xs text-muted-foreground'>{glassPrismShapeCaptions[id]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby='usage-heading' className='space-y-3'>
        <SectionHeading id='usage-heading'>Usage</SectionHeading>
        <p className='max-w-[64ch] text-sm text-muted-foreground'>
          Drop the component wherever a hero-size loading surface belongs. It announces a busy status, pauses when it
          leaves the viewport or the tab is hidden, and shows a single still frame for visitors who prefer reduced
          motion.
        </p>
        <pre className='overflow-x-auto rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-relaxed'>
          {`import { GlassPrismLoader } from '#components/geometry/loader/glass-prism-loader.js';

<GlassPrismLoader className='size-64' label='Loading your model' />`}
        </pre>
      </section>
    </div>
  );
}
