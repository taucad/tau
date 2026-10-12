import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { designStoryMachine } from '#components/geometry/splash/design-story.machine.js';
import { storyFrame } from '#components/geometry/splash/design-story-timeline.js';
import { storyLanes, storyPrompt, storySteps } from '#components/geometry/splash/design-story.constants.js';
import type { StoryBeat } from '#components/geometry/splash/design-story.constants.js';
import { geospecRun } from '@taucad/planetary-gearbox';
import posterUrl from '#components/geometry/gearbox/gearbox-poster.webp?url';

const StoryCanvas = lazy(async () => {
  const module = await import('#components/geometry/splash/design-story-canvas.js');
  return { default: module.DesignStoryCanvas };
});
const motionQuery = '(prefers-reduced-motion: reduce)';
const subscribeMotion = (callback: () => void) => {
  const query = globalThis.matchMedia(motionQuery);
  query.addEventListener('change', callback);
  return () => {
    query.removeEventListener('change', callback);
  };
};
const getMotion = () => globalThis.matchMedia(motionQuery).matches;
const serverMotion = () => true;

/** The no-JavaScript, reduced-motion and failed-renderer illustration. */
function StoryPoster(): React.JSX.Element {
  return (
    <div className='flex size-full flex-col items-center justify-center gap-4 px-4'>
      <img src={posterUrl} alt='' className='max-h-64 w-full object-contain' width={720} height={720} />
      <p className='max-w-sm text-center text-xs text-muted-foreground'>
        Describe the part you need. Tau writes real parametric CAD you can edit, checks the geometry against your
        requirements and exports it for your printer.
      </p>
    </div>
  );
}

class StoryBoundary extends Component<
  { readonly children: ReactNode; readonly onFailure: () => void },
  { failed: boolean }
> {
  public static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  public override state = { failed: false };
  public override componentDidCatch(): void {
    this.props.onFailure();
  }
  public override render(): ReactNode {
    return this.state.failed ? <StoryPoster /> : this.props.children;
  }
}

/** The homepage story's overlays: the composer, the three agent lanes, the evidence card and the print steps. */
function StoryOverlay({
  beat,
  printStage,
}: {
  readonly beat: StoryBeat;
  readonly printStage: number;
}): React.JSX.Element {
  return (
    <>
      {beat === 'prompt' ? (
        <div className='pointer-events-none absolute inset-x-4 bottom-2 rounded-xl border bg-background/90 p-3 text-left text-xs shadow-sm backdrop-blur sm:inset-x-10'>
          <span className='block text-[10px] font-medium tracking-wide text-muted-foreground uppercase'>
            New project
          </span>
          <p className='mt-1 text-sm'>{storyPrompt}</p>
        </div>
      ) : undefined}
      {beat === 'parts' || beat === 'geometry' ? (
        <div className='pointer-events-none absolute inset-x-0 bottom-1 grid grid-cols-3 gap-2 px-2 text-center text-[10px] text-muted-foreground sm:text-xs'>
          {storyLanes.map(([lane, members]) => (
            <span key={lane}>
              <b className='block font-medium text-foreground'>{lane}</b>
              {members}
            </span>
          ))}
        </div>
      ) : undefined}
      {beat === 'evidence' ? (
        <ul className='pointer-events-none absolute bottom-2 left-2 rounded-xl border bg-background/90 p-3 text-left text-[11px] shadow-sm backdrop-blur'>
          {geospecRun.tests
            .filter((test) => test.status === 'passed')
            .map((test) => (
              <li key={test.name}>
                <span className='mr-1 text-primary'>✓</span>
                {test.name}
              </li>
            ))}
          <li className='text-muted-foreground'>
            <span className='mr-1'>?</span>
            {geospecRun.summary.inconclusive} need evidence GeoSpec cannot measure yet
          </li>
        </ul>
      ) : undefined}
      {beat === 'print' ? (
        <div className='pointer-events-none absolute inset-x-0 bottom-1 flex justify-center gap-2 text-xs text-muted-foreground'>
          {['Pick a part', 'Check the fit', 'Export'].map((label, index) => (
            <span key={label} className={index === printStage ? 'font-medium text-primary' : undefined}>
              {index > 0 ? '→ ' : ''}
              {label}
            </span>
          ))}
        </div>
      ) : undefined}
    </>
  );
}

/** One shared, pause-aware illustration for marketing and authentication. */
export function DesignStory(): React.JSX.Element {
  const actor = useActorRef(designStoryMachine, { input: {} });
  const beat = useSelector(actor, (snapshot) => storyFrame(snapshot.context.elapsed).step);
  const printStage = useSelector(actor, (snapshot) => {
    const frame = storyFrame(snapshot.context.elapsed);
    return frame.step.id === 'print' ? Math.min(2, Math.floor(frame.age / 1500)) : 0;
  });
  const container = useRef<HTMLDivElement>(null);
  const reducedMotion = useSyncExternalStore(subscribeMotion, getMotion, serverMotion);
  const [visible, setVisible] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const handleReady = useCallback(() => {
    setReady(true);
  }, []);
  const isPlaying = ready && visible && !hidden && !paused && !reducedMotion && !failed;

  useEffect(() => {
    const element = container.current;
    if (!element) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry?.isIntersecting ?? false);
    });
    observer.observe(element);
    const updateVisibility = () => {
      setHidden(document.hidden);
    };
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);
  useEffect(() => {
    actor.send({ type: isPlaying ? 'play' : 'pause' });
  }, [actor, isPlaying]);
  const animated = !reducedMotion && !failed;
  const live = animated && ready;

  return (
    <div
      ref={container}
      data-design-story=''
      data-beat={live ? beat.id : 'poster'}
      className='relative flex size-full min-h-72 flex-col justify-center overflow-hidden bg-muted/40 p-3 sm:p-5'
    >
      <p className='sr-only'>
        From one sentence, Tau plans its authored 34-part planetary gearbox as named parts, turns their source into
        solids, assembles them in order and turns the input at a 4:1 reduction, widens the gears from 14 to 18 mm, shows
        a recorded GeoSpec run of the model, and previews printing the ring gear on a 256 mm plate. The agent tasks and
        the print sequence are illustrations, not a live session or print job.
      </p>
      <div aria-hidden='true' className='flex min-h-0 flex-1 flex-col'>
        <div className='flex min-h-12 items-center justify-center px-1 text-center text-sm font-medium sm:text-base'>
          {live ? beat.title : 'Design. Verify. Print.'}
        </div>
        <div className='relative min-h-0 flex-1'>
          <StoryBoundary
            onFailure={() => {
              setFailed(true);
            }}
          >
            {animated && (visible || ready) ? (
              <Suspense fallback={<StoryPoster />}>
                <StoryCanvas actor={actor} isPlaying={isPlaying} onReady={handleReady} />
              </Suspense>
            ) : (
              <StoryPoster />
            )}
          </StoryBoundary>
          {live ? <StoryOverlay beat={beat.id} printStage={printStage} /> : undefined}
        </div>
        <div className='flex min-h-12 items-center justify-center gap-2 text-center text-xs text-muted-foreground'>
          <span>{live ? beat.detail : 'Parametric source · GeoSpec evidence · Print preview'}</span>
        </div>
      </div>
      <div className='flex items-center justify-between gap-2 border-t pt-2'>
        <ol
          aria-label='Design story'
          className='flex flex-1 justify-between gap-1 text-[10px] text-muted-foreground sm:text-xs'
        >
          {storySteps.map((step) => (
            <li
              key={step.id}
              aria-current={live && beat.id === step.id ? 'step' : undefined}
              className='aria-[current=step]:font-medium aria-[current=step]:text-primary'
            >
              {step.label}
            </li>
          ))}
        </ol>
        <Button
          variant='ghost'
          size='icon'
          disabled={reducedMotion || failed}
          aria-label={paused ? 'Play design animation' : 'Pause design animation'}
          onClick={() => {
            setPaused((value) => !value);
          }}
        >
          {paused ? <Play className='size-4' /> : <Pause className='size-4' />}
        </Button>
      </div>
    </div>
  );
}
