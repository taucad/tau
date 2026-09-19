import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { Pause, Play, Check, TriangleAlert } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { designStoryMachine } from '#components/geometry/splash/design-story.machine.js';
import { storyFrame } from '#components/geometry/splash/design-story-timeline.js';
import { storySteps } from '#components/geometry/splash/design-story.constants.js';
import posterUrl from '#components/geometry/splash/assets/design-story-poster.png?url';

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
      <img src={posterUrl} alt='' className='max-h-64 w-full object-contain' width={600} height={352} />
      <p className='max-w-sm text-center text-xs text-muted-foreground'>
        Create a gearbox. Check the printer-bed fit with GeoSpec. Refine parameters, assemble, then preview printing.
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

/** One shared, pause-aware illustration for marketing and authentication. */
export function DesignStory(): React.JSX.Element {
  const actor = useActorRef(designStoryMachine, { input: {} });
  const beat = useSelector(actor, (snapshot) => storyFrame(snapshot.context.elapsed).step);
  const printStage = useSelector(actor, (snapshot) => {
    const frame = storyFrame(snapshot.context.elapsed);
    return frame.step.id === 'print' ? Math.min(2, Math.floor(frame.age / 600)) : 0;
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

  return (
    <div
      ref={container}
      data-design-story=''
      data-beat={animated && ready ? beat.id : 'poster'}
      className='relative flex size-full min-h-72 flex-col justify-center overflow-hidden bg-muted/40 p-3 sm:p-5'
    >
      <p className='sr-only'>
        Tau creates a 14-part planetary gearbox, checks its housing against a declared printer envelope with GeoSpec,
        reduces the module to fit while retaining a 4:1 ratio, assembles the mechanism, and previews printing the
        housing. The print sequence is an illustration, not a live print job.
      </p>
      <div aria-hidden='true' className='flex min-h-0 flex-1 flex-col'>
        <div className='flex min-h-12 items-center justify-center px-1 text-center text-sm font-medium sm:text-base'>
          {animated && ready ? beat.prompt : 'From a specification to something real.'}
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
          {animated && ready && (beat.id === 'check' || beat.id === 'refine') ? (
            <div className='pointer-events-none absolute inset-x-8 bottom-1 flex items-center gap-2 text-xs text-muted-foreground'>
              <span className='h-2 flex-1 border-x border-t border-current' />
              <span>{beat.id === 'check' ? '252 mm' : '220 mm'} / 236 mm usable</span>
              <span className='h-2 flex-1 border-x border-t border-current' />
            </div>
          ) : undefined}
          {animated && ready && beat.id === 'print' ? (
            <div className='pointer-events-none absolute inset-x-0 bottom-1 flex justify-center gap-2 text-xs text-muted-foreground'>
              {['Prepare', 'Send', 'Print'].map((label, index) => (
                <span key={label} className={index === printStage ? 'font-medium text-primary' : undefined}>
                  {index > 0 ? '→ ' : ''}
                  {label}
                </span>
              ))}
            </div>
          ) : undefined}
        </div>
        <div className='flex min-h-12 items-center justify-center gap-2 text-center text-xs text-muted-foreground'>
          {animated && ready && beat.id === 'check' ? <TriangleAlert className='size-4 shrink-0' /> : undefined}
          {animated && ready && beat.id === 'refine' ? <Check className='size-4 shrink-0' /> : undefined}
          <span>
            {animated && ready ? beat.detail : 'Parametric design · Geometry checks · Print workflow preview'}
          </span>
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
              aria-current={animated && ready && beat.id === step.id ? 'step' : undefined}
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
