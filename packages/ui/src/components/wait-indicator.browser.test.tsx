import '#components/select.browser.css';
import { act, cleanup, render } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it } from 'vitest';
import { WaitIndicator } from '#components/wait-indicator.js';
import { WaitClockProvider } from '#hooks/use-wait-clock.js';
import type { WaitIndicatorProps } from '#components/wait-indicator.js';

afterEach(() => {
  cleanup();
});

const clockAt = (time: number) => ({ now: () => time });

const find = (slot: string): HTMLElement => document.querySelector<HTMLElement>(`[data-slot=${slot}]`)!;

/**
 * Pauses every running animation and moves it to `time` ms after it started, as if that much time had passed. A swap
 * is a 0.01 ms step that ends just after its mark, so the rows below look 1 ms past each mark.
 */
function seek(time: number): void {
  for (const animation of document.getAnimations()) {
    animation.pause();
    animation.currentTime = time;
  }
}

/** A box as plain numbers, comparable with `toEqual`. */
const boxOf = (element: Element): readonly number[] => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return [x, y, width, height];
};

const isShown = (element: Element): boolean => getComputedStyle(element).visibility === 'visible';

function renderAt(time: number, props: WaitIndicatorProps) {
  return render(
    <WaitClockProvider clock={clockAt(time)}>
      <WaitIndicator {...props} />
    </WaitClockProvider>,
  );
}

it('should be hidden at 999 ms and shown from 1,000 ms after the wait started', () => {
  renderAt(0, { active: true, label: 'Loading chat' });

  seek(999);
  expect(isShown(find('wait-indicator-body'))).toBe(false);
  seek(1000 + 150);
  expect(isShown(find('wait-indicator-body'))).toBe(true);
  expect(getComputedStyle(find('wait-indicator-body')).opacity).toBe('1');
});

it('should keep its geometry from the start of the wait, so the reveal moves nothing', () => {
  renderAt(0, { active: true, label: 'Loading chat' });
  seek(0);
  const before = boxOf(find('wait-indicator'));
  seek(1200);
  const after = boxOf(find('wait-indicator'));

  expect(after).toEqual(before);
});

it('should swap to the slow words and Retry at 10,000 ms without changing its box', () => {
  renderAt(0, { active: true, label: 'Loading chat', slowLabel: 'Still loading chat', onRetry: () => undefined });

  seek(9999);
  const box = boxOf(find('wait-indicator'));
  expect(isShown(find('wait-indicator-label'))).toBe(true);
  expect(isShown(find('wait-indicator-slow'))).toBe(false);

  seek(10_001);
  expect(isShown(find('wait-indicator-label'))).toBe(false);
  expect(isShown(find('wait-indicator-slow'))).toBe(true);
  expect(boxOf(find('wait-indicator'))).toEqual(box);
});

it('should keep the slow words hidden while the indicator itself is still hidden', () => {
  renderAt(0, { active: true, label: 'Loading chat', slowLabel: 'Still loading chat' });

  seek(500);
  expect(isShown(find('wait-indicator-label'))).toBe(false);
  expect(isShown(find('wait-indicator-slow'))).toBe(false);
});

it('should hold the indicator to 1,500 ms when content arrives at 1,100 ms', () => {
  const view = renderAt(0, { active: true, label: 'Loading chat' });
  view.rerender(
    <WaitClockProvider clock={clockAt(1100)}>
      <WaitIndicator active={false} label='Loading chat' />
    </WaitClockProvider>,
  );

  seek(399);
  expect(isShown(find('wait-indicator-body'))).toBe(true);
  seek(401);
  expect(isShown(find('wait-indicator-body'))).toBe(false);
});

it('should start a new wait hidden when a Retry comes after the indicator served its minimum', () => {
  const view = renderAt(11_000, { active: true, label: 'Loading chat', slowLabel: 'Still loading chat', startedAt: 0 });
  view.rerender(
    <WaitClockProvider clock={clockAt(11_600)}>
      <WaitIndicator active label='Loading chat' slowLabel='Still loading chat' startedAt={11_600} />
    </WaitClockProvider>,
  );

  seek(999);
  expect(isShown(find('wait-indicator-body'))).toBe(false);
  seek(1000 + 150);
  expect(isShown(find('wait-indicator-body'))).toBe(true);
  expect(isShown(find('wait-indicator-label'))).toBe(true);
  expect(isShown(find('wait-indicator-slow'))).toBe(false);
});

it('should keep the slow words and Retry visible through a hold that starts after the slow mark', () => {
  const props = { label: 'Loading chat', slowLabel: 'Still loading chat', onRetry: () => undefined, startedAt: 0 };
  const view = renderAt(9800, { ...props, active: true });
  view.rerender(
    <WaitClockProvider clock={clockAt(10_100)}>
      <WaitIndicator {...props} active={false} />
    </WaitClockProvider>,
  );

  seek(100);
  expect(isShown(find('wait-indicator-label'))).toBe(false);
  expect(isShown(find('wait-indicator-slow'))).toBe(true);
  seek(201);
  expect(isShown(find('wait-indicator-body'))).toBe(false);
});

it('should keep a Retry indicator visible through the new wait start', () => {
  const props = { label: 'Loading chat', slowLabel: 'Still loading chat', onRetry: () => undefined };
  const view = renderAt(10_100, { ...props, active: true, startedAt: 0 });
  view.rerender(
    <WaitClockProvider clock={clockAt(10_300)}>
      <WaitIndicator {...props} active startedAt={10_300} />
    </WaitClockProvider>,
  );

  seek(0);
  expect(isShown(find('wait-indicator-body'))).toBe(true);
  expect(getComputedStyle(find('wait-indicator-body')).opacity).toBe('1');
});

/* A15f2: the 500 ms minimum on the page's real clocks. A CSS animation counts its delay from the document timeline's
   time, which holds still through a task while `performance.now()` runs on, and the reveal paints only at the first
   frame after a long task. Both rows hold the main thread as a loading page does, and read the delays the indicator
   wrote, on the document timeline. */

const nextFrame = async (): Promise<number> =>
  new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });

/** The first frame at or after `time` on the document timeline: the one an effect due then paints in. */
const frameAtOrAfter = async (time: number): Promise<number> => {
  const frame = await nextFrame();
  return frame >= time ? frame : frameAtOrAfter(time);
};

/** Holds the main thread, as a long task on a loading page does. */
function holdMainThread(milliseconds: number): void {
  const until = performance.now() + milliseconds;
  while (performance.now() < until) {
    // Busy: no frame can run.
  }
}

/** When the body's `name` animation takes effect, on the document timeline: its start, once it has one, plus its delay. */
async function effectTime(name: string, body: HTMLElement = find('wait-indicator-body')): Promise<number> {
  const animation = body
    .getAnimations()
    .find((candidate) => candidate instanceof CSSAnimation && candidate.animationName === name);
  expect(animation, `the indicator runs ${name}`).toBeDefined();
  await animation!.ready;
  const startDelay = Number(animation!.effect!.getTiming().delay);
  return Number(animation!.startTime) + Math.max(startDelay, 0);
}

it('should count a hold from the timeline its animation runs on when a long task ran the clock ahead of it', () => {
  /* Shown since 1,100 ms. Content arrives at the end of a 300 ms long task: the performance clock reads 1,400 ms, the
     document timeline that the hold's animation starts on still reads 1,100 ms. */
  const before = { now: () => 1100, animationNow: () => 1100 };
  const after = { now: () => 1400, animationNow: () => 1100 };
  const view = render(
    <WaitClockProvider clock={before}>
      <WaitIndicator active label='Loading chat' startedAt={0} />
    </WaitClockProvider>,
  );
  view.rerender(
    <WaitClockProvider clock={after}>
      <WaitIndicator active={false} label='Loading chat' startedAt={0} />
    </WaitClockProvider>,
  );

  seek(499);
  expect(isShown(find('wait-indicator-body'))).toBe(true);
  seek(501);
  expect(isShown(find('wait-indicator-body'))).toBe(false);
});

it('should hold an indicator that a long task revealed late 500 ms from the frame it showed in', async () => {
  const startedAt = performance.now() - 900;
  const view = render(<WaitIndicator active label='Loading chat' startedAt={startedAt} />);
  holdMainThread(300);
  await nextFrame();
  const revealedAt = await effectTime('wait-reveal');
  let shownAt = 0;
  await act(async () => {
    shownAt = await frameAtOrAfter(revealedAt);
    await nextFrame();
  });
  /* The reveal was due 1,000 ms into the wait; the long task held it to a later frame. */
  expect(shownAt - startedAt).toBeGreaterThanOrEqual(1100);

  await act(async () => {
    view.rerender(<WaitIndicator active={false} label='Loading chat' startedAt={startedAt} />);
  });

  expect((await effectTime('wait-conceal')) - shownAt).toBeGreaterThanOrEqual(499);
});

/** Holds the main thread while it renders, as a heavy component between two waiting regions does. */
function Busy({ milliseconds }: { readonly milliseconds: number }): undefined {
  holdMainThread(milliseconds);
  return undefined;
}

it('should reveal the second of two waits started in one long render 1,000 ms after its start, not early', async () => {
  /* Both regions' waits start together; a 400 ms render between them runs the performance clock ahead of the document
     timeline their reveals count from. A delay measured on the performance clock would reveal the second at ~600 ms. */
  await nextFrame();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  const startedAt = performance.now();
  const view = render(
    <>
      <div data-region='first'>
        <WaitIndicator active label='Loading chat' startedAt={startedAt} />
      </div>
      <Busy milliseconds={400} />
      <div data-region='second'>
        <WaitIndicator active label='Loading history' startedAt={startedAt} />
      </div>
    </>,
  );
  const second = view.container.querySelector<HTMLElement>('[data-region=second] [data-slot=wait-indicator-body]')!;

  const revealed = (await effectTime('wait-reveal', second)) - startedAt;
  expect(
    revealed,
    'the second wait revealed before the 1,000 ms ladder: its delay was read off the performance clock',
  ).toBeGreaterThanOrEqual(999);
  expect(revealed).toBeLessThan(1034);
});

/**
 * A frame at 60 Hz. A hold's animation counts from the start of the frame it starts in, which can come before the
 * moment that frame's script reads the performance clock.
 */
const oneFrame = 17;

it('should hold a wait that took over an indicator not yet painted 500 ms from the frame it showed in', async () => {
  /* The first wait's reveal is due, but no frame has drawn it when a second wait takes over, and a long task holds
     the first frame that does. The takeover keeps the words; their minimum must run from that frame. */
  /* On the timeline the hook reads, so the first wait is 1,100 ms in whatever the frame's age. */
  const startedAt = Number(document.timeline.currentTime) - 1100;
  const view = render(<WaitIndicator active label='Loading history' startedAt={startedAt} />);
  const takenOverAt = Number(document.timeline.currentTime);
  /* No frame runs through the task, so the words paint in the first frame after it. That frame can carry a time from
     before the task, so its start is read off the performance clock, as its reveal begins. */
  let shownAt = Number.NaN;
  const onReveal = (event: AnimationEvent): void => {
    if (event.animationName === 'wait-reveal' && Number.isNaN(shownAt)) {
      shownAt = performance.now();
    }
  };
  document.addEventListener('animationstart', onReveal, { capture: true });
  view.rerender(<WaitIndicator active label='Loading history' startedAt={takenOverAt} />);
  holdMainThread(400);
  const heldUntil = performance.now();
  await act(async () => {
    await nextFrame();
    await nextFrame();
  });
  document.removeEventListener('animationstart', onReveal, { capture: true });
  expect(shownAt, 'the words paint after the long task').toBeGreaterThanOrEqual(heldUntil);

  await act(async () => {
    view.rerender(<WaitIndicator active={false} label='Loading history' startedAt={takenOverAt} />);
  });

  expect(find('wait-indicator').dataset['state']).toBe('holding');
  expect(
    (await effectTime('wait-conceal')) - shownAt,
    'the takeover held the words from a reveal no frame had drawn',
  ).toBeGreaterThanOrEqual(500 - oneFrame);
});

it('should hold a wait that settled before any frame drew its reveal 500 ms from the frame it showed in', async () => {
  /* The reveal is due when the indicator mounts, its content arrives in the same task, and a long task holds the first
     frame, which draws the words already holding. */
  const startedAt = Number(document.timeline.currentTime) - 1100;
  const view = render(<WaitIndicator active label='Loading chat' startedAt={startedAt} />);
  view.rerender(<WaitIndicator active={false} label='Loading chat' startedAt={startedAt} />);
  /* The first frame after the task is read off the performance clock, at its first animation event or its animation
     frame callbacks, whichever comes first. That is later in the frame than its start, which the hold's animation
     counts from, by the work the frame does after a long task. */
  let shownAt = Number.NaN;
  const onFrame = (): void => {
    if (Number.isNaN(shownAt)) {
      shownAt = performance.now();
    }
  };
  document.addEventListener('animationstart', onFrame, { capture: true });
  requestAnimationFrame(onFrame);
  holdMainThread(400);
  const heldUntil = performance.now();
  await act(async () => {
    await nextFrame();
    await nextFrame();
  });
  document.removeEventListener('animationstart', onFrame, { capture: true });
  expect(shownAt, 'the words paint after the long task').toBeGreaterThanOrEqual(heldUntil);

  expect(find('wait-indicator').dataset['state']).toBe('holding');
  expect(
    (await effectTime('wait-conceal')) - shownAt,
    'the hold counted its minimum from a reveal no frame had drawn',
  ).toBeGreaterThanOrEqual(500 - oneFrame);
});

it('should not serve the minimum again when a wait takes over an indicator the server-rendered page revealed', async () => {
  /* Before hydration the reveal runs on CSS alone, so no handler sees it start. A wait that takes over after
     hydration keeps words that are already on screen; their minimum runs from the reveal, not from the takeover. */
  const startedAt = Number(document.timeline.currentTime);
  document.documentElement.style.setProperty('--wait-offset', `${-startedAt}ms`);
  const element = <WaitIndicator active label='Loading history' startedAt={startedAt} />;
  const container = document.createElement('div');
  container.innerHTML = renderToString(element);
  document.body.append(container);
  const shownAt = await frameAtOrAfter(startedAt + 1000);
  await frameAtOrAfter(shownAt + 200);
  const root = hydrateRoot(container, element);
  try {
    await act(async () => {
      await nextFrame();
    });
    const takenOverAt = Number(document.timeline.currentTime);
    await act(async () => {
      root.render(<WaitIndicator active label='Loading history' startedAt={takenOverAt} />);
      await frameAtOrAfter(takenOverAt + 200);
    });
    await act(async () => {
      root.render(<WaitIndicator active={false} label='Loading history' startedAt={takenOverAt} />);
    });

    const concealedAt = await effectTime('wait-conceal');
    expect(concealedAt - shownAt, 'the words hold their minimum').toBeGreaterThanOrEqual(499);
    expect(concealedAt - shownAt, 'the takeover served the minimum again from its own frame').toBeLessThan(534);
  } finally {
    root.unmount();
    container.remove();
    document.documentElement.style.removeProperty('--wait-offset');
  }
});
