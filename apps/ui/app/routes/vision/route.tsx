import { Component, lazy, Suspense, useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import type { MetaFunction } from 'react-router';
import { Link } from 'react-router';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Box,
  Code2,
  ExternalLink,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { TauWordmark } from '#components/icons/tau-wordmark.js';
import type { Handle } from '#types/matches.types.js';
import {
  chapterDuration,
  formatVisionTime,
  visionChapters,
  visionDuration,
  visionFrame,
} from '#routes/vision/vision-story.js';
import { useVisionPlayback } from '#routes/vision/use-vision-playback.js';
import posterUrl from '#routes/vision/vision-poster.webp?url';

const sourceUrl =
  'https://github.com/taucad/tau/tree/199c8079d5ee42f8c5771fc2cb02bf2791cc3bdf/libs/tau-examples/src/kernels/replicad/planetary-gear-system';

const VisionScene = lazy(async () => {
  const module = await import('#routes/vision/vision-scene.js');
  return { default: module.VisionScene };
});

export const meta: MetaFunction = () => [
  { title: 'Ideas into reality · Tau' },
  {
    name: 'description',
    content:
      'Explore an open future for physical creation: AI, editable design, motion, manufacturing and the objects we live with.',
  },
];

export const handle: Handle = { enablePageWrapper: false, enableOverflowY: true, enablePageFooter: false };

const ModelPoster = (): React.JSX.Element => (
  <img
    src={posterUrl}
    alt='The assembled planetary gearbox: a fixed ring gear, three planets around the sun and a carrier with socket screws on top.'
    className='size-full object-contain p-8'
    width={720}
    height={720}
  />
);

class SceneBoundary extends Component<
  { readonly children: ReactNode; readonly onError: () => void },
  { error: Error | undefined }
> {
  public static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }
  public override state: { error: Error | undefined } = { error: undefined };
  public override componentDidCatch(): void {
    this.props.onError();
  }
  public override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className='flex h-full flex-col items-center justify-center'>
          <ModelPoster />
          <p role='status' className='px-6 text-center text-sm text-muted-foreground'>
            3D is unavailable. You can still play the chapters and read the full story.
          </p>
          <details className='px-6 pb-6 text-xs text-muted-foreground'>
            <summary className='focus-visible:focus-outline'>Graphics details</summary>
            {this.state.error.message}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

const applications = [
  {
    number: '01',
    title: 'Everyday invention',
    body: 'A replacement knob. A custom mount. A tool that fits your hand. Start with a problem you know.',
  },
  {
    number: '02',
    title: 'Products with purpose',
    body: 'Explore enclosures, furniture and mechanisms. Make the design specific to the people using it.',
  },
  {
    number: '03',
    title: 'Learning by making',
    body: 'Turn an abstract principle into a mechanism you can inspect, animate and question.',
  },
  {
    number: '04',
    title: 'Small teams, bigger reach',
    body: 'Connect design intent to specialists, shared parts and fabrication partners. Keep each handoff visible.',
  },
  {
    number: '05',
    title: 'Stories in three dimensions',
    body: 'Take an object into an interactive website, a product scene, a film or an Unreal production.',
  },
  {
    number: '06',
    title: 'Repair and adaptation',
    body: 'Keep the source. Understand how the object was made. Propose a replacement or a better next revision.',
  },
];

/** A complete, self-contained marketing film with a motion-independent reading path. */
export default function VisionPage(): React.JSX.Element {
  const playback = useVisionPlayback();
  const { index, chapter } = visionFrame(playback.time);
  const [rotation, setRotation] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const onReady = useCallback(() => {
    setIsReady(true);
  }, []);
  const turnLeft = useCallback(() => {
    setRotation((value) => value - Math.PI / 6);
  }, []);
  const turnRight = useCallback(() => {
    setRotation((value) => value + Math.PI / 6);
  }, []);

  return (
    <div className='min-h-dvh bg-background text-foreground'>
      <a
        href='#vision-player'
        className='sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:bg-background focus:p-4 focus:focus-outline'
      >
        Skip to the presentation
      </a>
      <header className='border-b'>
        <div className='mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-4 px-6 py-4 lg:px-12'>
          <Link to='/' aria-label='Tau home' className='focus-visible:focus-outline'>
            <TauWordmark className='h-7 w-auto text-foreground' />
          </Link>
          <span className='hidden font-mono text-xs tracking-widest text-muted-foreground sm:inline'>
            IDEAS INTO REALITY
          </span>
          <nav aria-label='Vision navigation' className='flex items-center gap-2'>
            <Button asChild variant='ghost' size='sm'>
              <a href='#possibilities'>The possibilities</a>
            </Button>
            <Button asChild size='sm'>
              <Link to='/'>
                Create with Tau <ArrowRight />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section
          ref={playback.container}
          id='vision-player'
          aria-label='Ideas into reality presentation'
          className='mx-auto max-w-screen-2xl px-6 pt-8 pb-6 lg:px-12'
        >
          <div className='mb-6 flex flex-wrap items-center justify-between gap-3 font-mono text-xs tracking-wider text-muted-foreground'>
            <span className='flex items-center gap-2'>
              <Box className='size-4 text-primary' /> AN OPEN FUTURE FOR PHYSICAL CREATION
            </span>
            <span>10 CHAPTERS / 2 MINUTES</span>
          </div>

          <div className='grid min-h-0 items-center gap-6 lg:min-h-104 lg:grid-cols-5 lg:gap-8'>
            <div className='relative z-10 py-4 lg:col-span-2 lg:py-8'>
              <p className='mb-5 font-mono text-xs tracking-widest text-muted-foreground uppercase'>
                {chapter.eyebrow}
              </p>
              {/* oxlint-disable-next-line tau-lint/no-raw-page-heading -- Marketing presentation uses DESIGN's display scale, outside the product-page recipe. */}
              <h1 className='text-5xl leading-none font-medium tracking-tight whitespace-pre-line sm:text-6xl 2xl:text-7xl'>
                {chapter.title}
              </h1>
              <p className='mt-6 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg'>{chapter.body}</p>
              <div className='mt-8 flex flex-wrap items-center gap-3'>
                <Button
                  onClick={playback.toggle}
                  disabled={playback.hasReducedMotion}
                  aria-label={
                    playback.isPlaying
                      ? 'Pause the story'
                      : playback.time === visionDuration
                        ? 'Replay the story'
                        : 'Play the story'
                  }
                >
                  {playback.isPlaying ? <Pause /> : <Play />}
                  {playback.isPlaying
                    ? 'Pause the story'
                    : playback.time === visionDuration
                      ? 'Replay the story'
                      : 'Play the story'}
                </Button>
                <Button asChild variant='ghost'>
                  <a href='#full-story'>
                    Read the story <ArrowDown />
                  </a>
                </Button>
              </div>
              <p className='mt-4 text-xs text-muted-foreground'>
                {playback.hasReducedMotion
                  ? 'Reduced motion is on. Choose any chapter below.'
                  : 'An illustrated film. Explore at your own pace.'}
              </p>
            </div>

            <div className='relative min-w-0 lg:col-span-3'>
              <div className='flex items-center justify-between border-t pt-3 font-mono text-xs text-muted-foreground'>
                <span>OBJECT 001 / PLANETARY GEARBOX</span>
                <span>{String(index + 1).padStart(2, '0')} / 10</span>
              </div>
              <div className='relative h-80 sm:h-112 lg:h-96 xl:h-104'>
                <div
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-8 flex items-center justify-center'
                >
                  <div className='aspect-square h-4/5 rounded-full border border-border/60' />
                </div>
                <div role='img' aria-label={`3D gearbox illustration: ${chapter.caption}`} className='absolute inset-0'>
                  <SceneBoundary onError={onReady}>
                    <Suspense fallback={<ModelPoster />}>
                      <VisionScene
                        clock={playback.clock}
                        time={playback.time}
                        isRunning={playback.isRunning}
                        rotation={rotation}
                        onReady={onReady}
                      />
                    </Suspense>
                  </SceneBoundary>
                </div>
                {isReady ? undefined : (
                  <p className='pointer-events-none absolute bottom-6 left-6 text-xs text-muted-foreground'>
                    Preparing 3D · The story is ready to explore
                  </p>
                )}
                {index === 4 ? (
                  <div
                    aria-hidden='true'
                    className='pointer-events-none absolute inset-x-2 top-4 flex justify-between font-mono text-sm sm:inset-x-6'
                  >
                    <span className='border bg-background/90 px-4 py-2'>glTF / GLB</span>
                    <span className='border bg-background/90 px-4 py-2'>OpenUSD</span>
                  </div>
                ) : undefined}
                {index === 6 ? (
                  <div
                    aria-hidden='true'
                    className='pointer-events-none absolute inset-0 flex flex-col justify-between py-6 font-mono text-xs'
                  >
                    <div className='flex justify-between'>
                      <span className='border bg-background/90 p-3'>Shared parts</span>
                      <span className='border bg-background/90 p-3'>Warehouses</span>
                    </div>
                    <div className='flex justify-between'>
                      <span className='border bg-background/90 p-3'>Factories</span>
                      <span className='border bg-background/90 p-3'>Delivery</span>
                    </div>
                  </div>
                ) : undefined}
                {index === 7 ? (
                  <div
                    aria-hidden='true'
                    className='pointer-events-none absolute inset-x-4 bottom-4 flex flex-wrap justify-center gap-2 font-mono text-xs'
                  >
                    {['Observe', 'Understand', 'Propose', 'Verify'].map((label) => (
                      <span key={label} className='border bg-background/90 px-3 py-2'>
                        {label}
                      </span>
                    ))}
                  </div>
                ) : undefined}
                <div className='absolute right-0 bottom-0 flex gap-1'>
                  <Button variant='outline' size='icon' aria-label='Rotate model left' onClick={turnLeft}>
                    <RotateCcw />
                  </Button>
                  <Button variant='outline' size='icon' aria-label='Rotate model right' onClick={turnRight}>
                    <RotateCw />
                  </Button>
                </div>
              </div>
              <div className='mt-3 flex flex-wrap items-start justify-between gap-3 border-t pt-3 text-xs text-muted-foreground'>
                <p className='max-w-md'>{chapter.caption}</p>
                <span className='shrink-0'>{chapter.status}</span>
              </div>
            </div>
          </div>

          <div className='mt-8 border-t pt-4'>
            <div className='flex items-center gap-4'>
              <Button
                variant='ghost'
                size='icon'
                disabled={index === 0}
                aria-label='Previous chapter'
                onClick={() => {
                  playback.seek((index - 1) * chapterDuration);
                }}
              >
                <ArrowLeft />
              </Button>
              <label className='sr-only' htmlFor='vision-time'>
                Story position
              </label>
              <input
                id='vision-time'
                type='range'
                min={0}
                max={visionDuration}
                step={0.1}
                value={playback.time}
                aria-valuetext={`${formatVisionTime(playback.time)} — ${chapter.label}`}
                onChange={(event) => {
                  playback.seek(Number(event.target.value));
                }}
                className='h-6 min-w-0 flex-1 accent-foreground focus-visible:focus-outline'
              />
              <span className='w-24 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums'>
                {formatVisionTime(playback.time)} / 2:00
              </span>
              <Button
                variant='ghost'
                size='icon'
                disabled={index === visionChapters.length - 1}
                aria-label='Next chapter'
                onClick={() => {
                  playback.seek((index + 1) * chapterDuration);
                }}
              >
                <ArrowRight />
              </Button>
            </div>
            <nav aria-label='Story chapters' className='mt-4 grid grid-cols-2 gap-1 sm:grid-cols-5 xl:grid-cols-10'>
              {visionChapters.map((item, itemIndex) => (
                <button
                  key={item.id}
                  type='button'
                  aria-current={index === itemIndex ? 'step' : undefined}
                  onClick={() => {
                    playback.seek(itemIndex * chapterDuration);
                  }}
                  className={cn(
                    'flex items-center gap-2 border-t px-2 py-3 text-left text-xs transition-opacity duration-150 hover:bg-accent focus-visible:focus-outline',
                    index === itemIndex
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground',
                  )}
                >
                  <span className='font-mono tabular-nums'>{String(itemIndex + 1).padStart(2, '0')}</span>
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </section>

        <section id='possibilities' aria-labelledby='possibilities-title' className='mt-8 border-t'>
          <div className='mx-auto max-w-screen-2xl px-6 py-16 lg:px-12 lg:py-24'>
            <div className='grid gap-6 md:grid-cols-2 md:gap-16'>
              <div>
                <p className='mb-4 font-mono text-xs tracking-widest text-muted-foreground'>THE SIGNIFICANCE</p>
                <h2
                  id='possibilities-title'
                  className='max-w-xl text-3xl leading-tight font-medium tracking-tight sm:text-4xl'
                >
                  The distance between thought and matter is shrinking.
                </h2>
              </div>
              <div className='space-y-4 text-base leading-relaxed text-muted-foreground'>
                <p>
                  When a design can be expressed in code, intelligence can work on it: proposing, comparing, checking
                  and refining. The object becomes something we can reason about together.
                </p>
                <p>
                  The power is in the whole chain. Open tools and shared standards can let more people participate.
                  Physical access, evidence and human judgment still determine what becomes real.
                </p>
              </div>
            </div>
            <div className='mt-12 grid gap-x-12 md:grid-cols-2 lg:grid-cols-3'>
              {applications.map((application) => (
                <article key={application.number} className='border-t py-6'>
                  <p className='mb-4 font-mono text-xs text-muted-foreground'>{application.number}</p>
                  <h3 className='text-lg font-medium'>{application.title}</h3>
                  <p className='mt-3 text-sm leading-relaxed text-muted-foreground'>{application.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby='foundation-title' className='border-t bg-muted/20'>
          <div className='mx-auto grid max-w-screen-2xl gap-12 px-6 py-16 lg:grid-cols-2 lg:px-12'>
            <div>
              <p className='mb-4 font-mono text-xs tracking-widest text-muted-foreground'>
                A FOUNDATION, AND A DIRECTION
              </p>
              <h2 id='foundation-title' className='text-3xl font-medium tracking-tight'>
                An ambitious future.
                <br />
                An honest starting point.
              </h2>
              <p className='mt-5 max-w-lg text-sm leading-relaxed text-muted-foreground'>
                Tau is under active development. This story brings together working foundations and a proposed future. A
                moving model demonstrates motion; it does not certify a part or complete a physical job.
              </p>
              <div className='mt-6 flex flex-wrap gap-2'>
                <Button asChild variant='outline'>
                  <a href='https://github.com/taucad/tau' target='_blank' rel='noreferrer'>
                    Explore the source <ExternalLink />
                  </a>
                </Button>
                <Button asChild variant='ghost'>
                  <a href={sourceUrl} target='_blank' rel='noreferrer'>
                    <Code2 /> Open the model source <ExternalLink />
                  </a>
                </Button>
              </div>
            </div>
            <dl className='text-sm'>
              <div className='border-t py-5'>
                <dt className='font-medium'>Build on today</dt>
                <dd className='mt-2 leading-relaxed text-muted-foreground'>
                  AI-assisted CAD, editable code, geometry checks, format conversion and a kinematics library.
                  Open-source Tau-authored code under Apache-2.0.
                </dd>
              </div>
              <div className='border-t py-5'>
                <dt className='font-medium'>Foundations being developed</dt>
                <dd className='mt-2 leading-relaxed text-muted-foreground'>
                  Runtime jobs, machine providers and Bambu Developer LAN integration. Physical support depends on the
                  qualified device, host and process.
                </dd>
              </div>
              <div className='border-t py-5'>
                <dt className='font-medium'>The avenue ahead</dt>
                <dd className='mt-2 leading-relaxed text-muted-foreground'>
                  Shared parts and warehouses, supplier agents, approved purchasing, CNC and factory adapters, and
                  feedback throughout an object’s life. These are proposals, not services promised by this film.
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section id='full-story' aria-labelledby='story-title' className='mx-auto max-w-screen-2xl px-6 py-16 lg:px-12'>
          <div className='mb-8 flex flex-wrap items-end justify-between gap-4'>
            <div>
              <p className='mb-4 font-mono text-xs tracking-widest text-muted-foreground'>THE COMPLETE STORY</p>
              <h2 id='story-title' className='text-3xl font-medium tracking-tight'>
                Take a closer look
              </h2>
            </div>
            <p className='text-sm text-muted-foreground'>All ten chapters, with or without animation.</p>
          </div>
          {visionChapters.map((item, itemIndex) => (
            <details key={item.id} className='group border-t'>
              <summary className='flex min-h-16 list-none items-center gap-4 py-4 focus-visible:focus-outline'>
                <span className='font-mono text-xs text-muted-foreground'>
                  {String(itemIndex + 1).padStart(2, '0')}
                </span>
                <h3 className='flex-1 text-base font-medium'>{item.title.replace('\n', ' ')}</h3>
                <ArrowDown className='size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180' />
              </summary>
              <div className='max-w-3xl pb-8 pl-8 text-sm leading-relaxed text-muted-foreground'>
                <p>{item.body}</p>
                <p className='mt-3'>{item.detail}</p>
              </div>
            </details>
          ))}
          <p className='mt-8 max-w-3xl text-xs leading-relaxed text-muted-foreground'>
            Standards references:{' '}
            <a
              className='underline underline-offset-4 focus-visible:focus-outline'
              href='https://www.khronos.org/gltf/'
            >
              Khronos glTF
            </a>
            ,{' '}
            <a
              className='underline underline-offset-4 focus-visible:focus-outline'
              href='https://openusd.org/release/intro.html'
            >
              OpenUSD
            </a>
            , and{' '}
            <a
              className='underline underline-offset-4 focus-visible:focus-outline'
              href='https://dev.epicgames.com/documentation/en-us/unreal-engine/universal-scene-description-in-unreal-engine'
            >
              USD in Unreal Engine
            </a>
            . The film is an illustration of the vision; machine, procurement and lifecycle scenes show proposed
            workflows.
          </p>
        </section>

        <section className='border-t'>
          <div className='mx-auto max-w-screen-2xl px-6 py-16 text-center lg:px-12 lg:py-24'>
            <p className='mb-6 font-mono text-xs tracking-widest text-muted-foreground'>
              IMAGINATION IS THE STARTING POINT
            </p>
            <h2 className='text-4xl font-medium tracking-tight sm:text-6xl'>Make something that matters.</h2>
            <div className='mt-8 flex justify-center'>
              <Button asChild>
                <Link to='/'>
                  Start creating with Tau <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <footer className='border-t px-6 py-6 text-center text-xs text-muted-foreground'>
        Tau · Open tools for physical creation · A vision in progress
      </footer>
    </div>
  );
}
