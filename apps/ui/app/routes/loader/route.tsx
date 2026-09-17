import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { MetaFunction } from 'react-router';
import { ArrowRight, Pause, Play } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Label } from '@taucad/ui/components/label';
import { Switch } from '@taucad/ui/components/switch';
import { ToggleGroup, ToggleGroupItem } from '@taucad/ui/components/toggle-group';
import { cn } from '@taucad/ui/utils/cn';
import type {
  MetalMorphFrameCapture,
  MetalMorphLoaderController,
  MetalMorphLoaderQuality,
  MetalMorphLoaderStatistics,
  MetalMorphSequenceState,
} from '#components/geometry/loader/metal-morph-controller.js';
import type { MetalMorphLoaderStatus } from '#components/geometry/loader/metal-morph-loader.js';
import { getMetalMorphSpinnerService } from '#components/geometry/loader/metal-morph-spinner-service.js';
import type { MetalMorphSpinnerDiagnostics } from '#components/geometry/loader/metal-morph-spinner-service.js';
import { metalMorphShapeIds, metalMorphShapeLabels } from '#components/geometry/loader/metal-morph-shapes.js';
import type { MetalMorphShapeId } from '#components/geometry/loader/metal-morph-shapes.js';
import { LazySection } from '#components/ui/lazy-section.js';
import { Loader } from '#components/ui/loader.js';
import { useFeature } from '#flags/use-feature.js';
import type { Handle } from '#types/matches.types.js';

const MetalMorphLoaderLazy = lazy(async () => {
  const module = await import('#components/geometry/loader/metal-morph-loader.js');
  return { default: module.MetalMorphLoader };
});

const MetalMorphSpinnerLazy = lazy(async () => {
  const module = await import('#components/geometry/loader/metal-morph-spinner.js');
  return { default: module.MetalMorphSpinner };
});

type PlaybackSpeed = '0.5' | '1' | '1.5';

type QualityTier = Readonly<{
  id: MetalMorphLoaderQuality;
  label: string;
  /** What the tier spends its budget on, for the caption under each column. */
  detail: string;
}>;

const qualityTiers: readonly QualityTier[] = [
  {
    id: 'inline',
    label: 'Inline',
    detail: '2,562 vertices · 64 px environment · interpolated normals · no ripple detail · 30 fps cap',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    detail: '10,242 vertices · 128 px environment · exact ridge normals · ripple detail · no bloom',
  },
  {
    id: 'high',
    label: 'High',
    detail: '10,242 vertices · 256 px environment · exact ridge normals · ripple detail · bloom · thin film',
  },
];

/** Side length, in pixels, of the spinner beside each tier's stage; the size a chat row would use. */
const comparisonSpinnerLabel = '96 px spinner';
/** Seeded walk that visits all five forms across five transitions and returns to the cube it started on. */
const comparisonSeed = 17;
const comparisonInitialShape: MetalMorphShapeId = 'cube';
/** One stage and one spinner per tier; the comparison only starts once every surface has its first frame. */
const comparisonSurfaceCount = qualityTiers.length * 2;

type MetalMorphDebugBridge = Readonly<{
  getState: () => MetalMorphSequenceState & MetalMorphLoaderStatistics & { readonly status: MetalMorphLoaderStatus };
  getShaderSource: () => Promise<{ readonly vertexShader: string; readonly fragmentShader: string }>;
  /** Offscreen readback of the current pose through the active backend. */
  captureFrame: () => Promise<MetalMorphFrameCapture>;
  /** Subscriber and renderer counts for the inline spinners, which all share one renderer. */
  getSpinnerDiagnostics: () => MetalMorphSpinnerDiagnostics;
}>;

type MetalMorphDebugGlobal = typeof globalThis & { __TAU_METAL_MORPH__?: MetalMorphDebugBridge };

const pageTitle = 'Liquid metal loader — Tau';
const pageDescription =
  'A metalbending-inspired loading indicator: one chrome body flowing between five geometric forms, rendered with WebGPU physically based shading.';
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
        <Link to='/loader'>Loader</Link>
      </Button>
    );
  },
  enableOverflowY: true,
};

const backendLabels: Readonly<Record<MetalMorphLoaderStatistics['backend'], string>> = {
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

export default function LoaderShowcase(): React.JSX.Element {
  const isTauDebugEnabled = useFeature('tauDebug');
  const [controller, setController] = useState<MetalMorphLoaderController>();
  const [status, setStatus] = useState<MetalMorphLoaderStatus>('pending');
  const [sequence, setSequence] = useState<MetalMorphSequenceState>();
  const [statistics, setStatistics] = useState<MetalMorphLoaderStatistics>();
  const [spinnerDiagnostics, setSpinnerDiagnostics] = useState<MetalMorphSpinnerDiagnostics>({
    subscriberCount: 0,
    activeCount: 0,
    rendererCount: 0,
    isLooping: false,
    sourceSize: 0,
    backend: undefined,
  });
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>('1');
  const [isInlineSizesVisible, setIsInlineSizesVisible] = useState(false);
  const [isComparisonVisible, setIsComparisonVisible] = useState(false);
  const [readyComparisonSurfaces, setReadyComparisonSurfaces] = useState(0);

  const handleReady = useCallback((ready: MetalMorphLoaderController): void => {
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

  const handleComparisonToggle = useCallback((checked: boolean): void => {
    setReadyComparisonSurfaces(0);
    setIsComparisonVisible(checked);
  }, []);

  const handleComparisonSurfaceReady = useCallback((): void => {
    setReadyComparisonSurfaces((count) => count + 1);
  }, []);

  useEffect(() => {
    if (!controller) {
      return;
    }
    const statisticsTimer = setInterval(() => {
      setStatistics(controller.getStatistics());
      setSpinnerDiagnostics(getMetalMorphSpinnerService().getDiagnostics());
    }, statisticsRefresh);
    return () => {
      clearInterval(statisticsTimer);
    };
  }, [controller]);

  useEffect(() => {
    if (!isTauDebugEnabled || !controller) {
      return;
    }
    const bridge: MetalMorphDebugBridge = {
      getState: () => ({ ...controller.getSequenceState(), ...controller.getStatistics(), status }),
      getShaderSource: async () => controller.getShaderSource(),
      captureFrame: async () => controller.captureFrame(),
      getSpinnerDiagnostics: () => getMetalMorphSpinnerService().getDiagnostics(),
    };
    (globalThis as MetalMorphDebugGlobal).__TAU_METAL_MORPH__ = bridge;
    return () => {
      delete (globalThis as MetalMorphDebugGlobal).__TAU_METAL_MORPH__;
    };
  }, [controller, isTauDebugEnabled, status]);

  const currentShape = sequence?.currentShape;
  const isComparisonRunning = readyComparisonSurfaces >= comparisonSurfaceCount;
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
          Brand · Loading indicator
        </p>
        <h1 className='text-4xl font-semibold tracking-tight text-balance md:text-5xl'>Liquid metal loader</h1>
        <p className='max-w-[64ch] text-lg text-muted-foreground'>
          One chrome body, bent like a metalbender would: a wave of liquid metal rolls across the surface, ripples
          trailing in its wake, and the next geometric form settles out of the flow behind it. Five forms, a random walk
          that never bounces between two of them more than twice, looping forever.
        </p>
        <p className='text-sm text-muted-foreground'>
          <Link to='/loader/glass' className='underline underline-offset-4'>
            The glass prism loader
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
                <MetalMorphLoaderLazy
                  className='size-full'
                  semantic='img'
                  label='Liquid metal loader showcase'
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
            The environment follows the app theme. Switch themes to see the studio relight the chrome.
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
            <SectionHeading id='forms-heading'>Forms</SectionHeading>
            <p className='text-sm text-muted-foreground'>
              Jump to a form now; the loop resumes its random walk from there.
            </p>
            <div className='grid grid-cols-2 gap-2'>
              {metalMorphShapeIds.map((id: MetalMorphShapeId) => (
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
                  {metalMorphShapeLabels[id]}
                </Button>
              ))}
            </div>
          </section>

          <section aria-labelledby='sequence-heading' className='space-y-3'>
            <SectionHeading id='sequence-heading'>Sequence</SectionHeading>
            <p className='text-sm text-muted-foreground'>
              Each pick is uniform over the other forms, except that three transitions in a row may never use the same
              two forms.
            </p>
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
                      {metalMorphShapeLabels[entry.shape]}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
            {sequence?.phase === 'morph' ? (
              <p className='text-sm'>
                Bending into <span className='font-medium'>{metalMorphShapeLabels[sequence.nextShape]}</span>
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
              <dt className='text-muted-foreground'>Bloom</dt>
              <dd>{statistics ? (statistics.isBloomEnabled ? 'On' : 'Off') : '—'}</dd>
              <dt className='text-muted-foreground'>Inline spinners</dt>
              <dd className='tabular-nums'>
                {spinnerDiagnostics.subscriberCount === 0
                  ? 'None mounted'
                  : `${spinnerDiagnostics.subscriberCount} sharing ${spinnerDiagnostics.rendererCount} context`}
              </dd>
              <dt className='text-muted-foreground'>Status</dt>
              <dd>{status}</dd>
            </dl>
            <p className='text-xs text-muted-foreground'>
              Add <code className='font-mono'>?graphicsBackend=webgl</code> to the URL to force the WebGL 2 backend.
            </p>
          </section>

          <section aria-labelledby='sizes-heading' className='space-y-3'>
            <SectionHeading id='sizes-heading'>Inline sizes</SectionHeading>
            <p className='text-sm text-muted-foreground'>
              Both draw from one shared renderer rather than owning one each, so a chat history full of working rows
              still costs a single GPU context.
            </p>
            <div className='flex items-center gap-3'>
              <Switch id='inline-sizes' checked={isInlineSizesVisible} onCheckedChange={setIsInlineSizesVisible} />
              <Label htmlFor='inline-sizes'>Render 40 px and 96 px spinners</Label>
            </div>
            {isInlineSizesVisible ? (
              <div className='flex items-end gap-6'>
                <Suspense fallback={<Loader className='size-4' />}>
                  <MetalMorphSpinnerLazy className='size-10' fallback={<Loader className='size-4' />} />
                  <MetalMorphSpinnerLazy className='size-24' fallback={<Loader className='size-6' />} />
                </Suspense>
              </div>
            ) : null}
          </section>
        </aside>
      </div>

      <section aria-labelledby='fidelity-heading' className='space-y-3'>
        <SectionHeading id='fidelity-heading'>Fidelity</SectionHeading>
        <p className='max-w-[80ch] text-sm text-muted-foreground'>
          The three cost tiers side by side, each running the same seeded walk through all five forms. Every surface
          waits until the last one has its first frame, so the columns stay in step and the only difference you see is
          the tier. Each column pairs a hero-size stage with the {comparisonSpinnerLabel} a chat row would use.
        </p>
        <div className='flex items-center gap-3'>
          <Switch id='fidelity-compare' checked={isComparisonVisible} onCheckedChange={handleComparisonToggle} />
          <Label htmlFor='fidelity-compare'>Compare inline, balanced and high</Label>
        </div>
        {isComparisonVisible ? (
          <div className='grid gap-6 sm:grid-cols-3'>
            {qualityTiers.map((tier) => (
              <figure key={tier.id} className='space-y-3'>
                <div className='relative aspect-square w-full overflow-hidden rounded-2xl border bg-muted/40'>
                  <Suspense fallback={<StageSkeleton />}>
                    <MetalMorphLoaderLazy
                      className='size-full'
                      semantic='img'
                      label={`${tier.label} fidelity stage`}
                      quality={tier.id}
                      seed={comparisonSeed}
                      initialShape={comparisonInitialShape}
                      isPaused={!isComparisonRunning}
                      onReady={handleComparisonSurfaceReady}
                    />
                  </Suspense>
                </div>
                <div className='flex items-center gap-3'>
                  <Suspense fallback={<Loader className='size-6 text-muted-foreground' />}>
                    <MetalMorphLoaderLazy
                      className='size-24 shrink-0'
                      semantic='img'
                      label={`${tier.label} fidelity spinner`}
                      quality={tier.id}
                      seed={comparisonSeed}
                      initialShape={comparisonInitialShape}
                      isPaused={!isComparisonRunning}
                      onReady={handleComparisonSurfaceReady}
                    />
                  </Suspense>
                  <figcaption className='space-y-1'>
                    <span className='block text-sm font-medium'>{tier.label}</span>
                    <span className='block text-xs text-muted-foreground'>{tier.detail}</span>
                  </figcaption>
                </div>
              </figure>
            ))}
          </div>
        ) : null}
      </section>

      <section aria-labelledby='usage-heading' className='space-y-3'>
        <SectionHeading id='usage-heading'>Usage</SectionHeading>
        <p className='max-w-[64ch] text-sm text-muted-foreground'>
          Drop the component wherever a spinner would go. It announces a busy status, pauses when it leaves the viewport
          or the tab is hidden, and shows a single still frame for visitors who prefer reduced motion.
        </p>
        <pre className='overflow-x-auto rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-relaxed'>
          {`import { MetalMorphLoader } from '#components/geometry/loader/metal-morph-loader.js';

<MetalMorphLoader className='size-24' label='Loading your model' />`}
        </pre>
      </section>
    </div>
  );
}
