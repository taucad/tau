import '#components/select.browser.css';
import { act, cleanup, render, screen, within } from '@testing-library/react';
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

  expect(screen.getByRole('status').dataset['state']).toBe('holding');
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

  expect(screen.getByRole('status').dataset['state']).toBe('holding');
  expect(
    (await effectTime('wait-conceal')) - shownAt,
    'the hold counted its minimum from a reveal no frame had drawn',
  ).toBeGreaterThanOrEqual(500 - oneFrame);
});

it('should hold words the server-rendered page revealed for their minimum through a takeover', async () => {
  /* Before hydration the reveal runs on CSS alone, so no handler sees it start. A wait that takes over after
     hydration keeps the words on screen, and cannot tell a reveal drawn before hydration from one no frame drew: it
     serves the minimum from its own frame, which holds the words longer, never shorter. */
  const startedAt = Number(document.timeline.currentTime);
  document.documentElement.style.setProperty('--wait-offset', `${-startedAt}ms`);
  const element = <WaitIndicator active label='Loading history' startedAt={startedAt} />;
  const container = document.createElement('div');
  container.innerHTML = renderToString(element);
  document.body.append(container);
  await nextFrame();
  const shownAt = await effectTime('wait-reveal');
  await frameAtOrAfter(shownAt + 100);
  const root = hydrateRoot(container, element);
  try {
    await act(async () => {
      await nextFrame();
    });
    const takenOverAt = Number(document.timeline.currentTime);
    /* The takeover commits now and stays active through frames, so its new element's entrance is seen. */
    act(() => {
      root.render(<WaitIndicator active label='Loading history' startedAt={takenOverAt} />);
    });
    await act(async () => {
      await frameAtOrAfter(takenOverAt + 100);
    });
    act(() => {
      root.render(<WaitIndicator active={false} label='Loading history' startedAt={takenOverAt} />);
    });

    expect(screen.getByRole('status').dataset['state'], 'the takeover kept the words').toBe('holding');
    const concealedAt = await effectTime('wait-conceal');
    expect(concealedAt - shownAt, 'the words hold their minimum').toBeGreaterThanOrEqual(499);
    /* The takeover's entrance reports itself a few frames after the takeover commits. */
    expect(concealedAt - takenOverAt, 'the takeover held past its own minimum').toBeLessThan(500 + 100);
  } finally {
    root.unmount();
    container.remove();
    document.documentElement.style.removeProperty('--wait-offset');
  }
});

it('should hold a wait that settled at the end of a long task its reveal fell due in 500 ms from the frame it showed in', async () => {
  /* The reveal falls due 150 ms into a 400 ms task, no frame draws it, and the content arrives at the task's end. */
  const startedAt = Number(document.timeline.currentTime) - 850;
  const view = render(<WaitIndicator active label='Loading chat' startedAt={startedAt} />);
  await act(async () => {
    await nextFrame();
  });
  let shownAt = Number.NaN;
  const onFrame = (): void => {
    if (Number.isNaN(shownAt)) {
      shownAt = performance.now();
    }
  };
  holdMainThread(400);
  act(() => {
    view.rerender(<WaitIndicator active={false} label='Loading chat' startedAt={startedAt} />);
  });
  document.addEventListener('animationstart', onFrame, { capture: true });
  requestAnimationFrame(onFrame);
  await act(async () => {
    await nextFrame();
    await nextFrame();
  });
  document.removeEventListener('animationstart', onFrame, { capture: true });

  expect(screen.getByRole('status').dataset['state'], 'the settled words hold').toBe('holding');
  expect(
    (await effectTime('wait-conceal')) - shownAt,
    'the hold counted its minimum from a reveal no frame had drawn',
  ).toBeGreaterThanOrEqual(500 - oneFrame);
});

it('should not show the words once a wait that no frame revealed has outlasted its minimum', async () => {
  /* The reveal falls due 50 ms into a 700 ms task, and the content arrives at its end: by then the minimum the words
     would have owed is over, so they never show. */
  const startedAt = Number(document.timeline.currentTime) - 950;
  const view = render(<WaitIndicator active label='Loading chat' startedAt={startedAt} />);
  await act(async () => {
    await nextFrame();
  });
  holdMainThread(700);
  act(() => {
    view.rerender(<WaitIndicator active={false} label='Loading chat' startedAt={startedAt} />);
  });

  expect(screen.getByRole('status').dataset['state'], 'the words showed after their content arrived').toBe('idle');
});

it('should not serve the minimum again when a wait restarts during a hold that drew the words first', async () => {
  /* The region mounts with its reveal due and its content in the same task, so the hold draws the words. A refetch
     restarts the wait 150 ms into that hold and settles: the words were on screen all along, so the minimum runs from
     the hold's first frame, not from the restart's. */
  const startedAt = Number(document.timeline.currentTime) - 1200;
  let shownAt = Number.NaN;
  const view = render(<WaitIndicator active label='Loading chat' startedAt={startedAt} />);
  act(() => {
    view.rerender(<WaitIndicator active={false} label='Loading chat' startedAt={startedAt} />);
  });
  requestAnimationFrame(() => {
    shownAt = performance.now();
  });
  await act(async () => {
    await nextFrame();
  });
  await act(async () => {
    await frameAtOrAfter(shownAt + 150);
  });
  const restartedAt = Number(document.timeline.currentTime);
  act(() => {
    view.rerender(<WaitIndicator active label='Loading chat' startedAt={restartedAt} />);
  });
  await act(async () => {
    await nextFrame();
    await nextFrame();
  });
  act(() => {
    view.rerender(<WaitIndicator active={false} label='Loading chat' startedAt={restartedAt} />);
  });

  expect(screen.getByRole('status').dataset['state']).toBe('holding');
  expect(
    (await effectTime('wait-conceal')) - shownAt,
    'the restart served the minimum again from its own frame',
  ).toBeLessThan(500 + 3 * oneFrame);
});

it('should hold words a settle drew after a long render for the minimum from their paint through a restart', async () => {
  /* One task restarts one region's wait, which reads the timeline, renders 300 ms of content, and settles a second
     region whose reveal is due and undrawn. Its words paint after the task, later than the timeline the settle read. A
     restart 250 ms after that paint still owes the minimum. */
  const startedAt = Number(document.timeline.currentTime) - 1100;
  const page = (phase: number, second: { active: boolean; startedAt: number }) => (
    <>
      <WaitIndicator active label='Loading chat' startedAt={phase === 0 ? startedAt : startedAt + 1} />
      {phase === 1 ? <Busy milliseconds={300} /> : null}
      <div data-region='second'>
        <WaitIndicator active={second.active} label='Loading history' startedAt={second.startedAt} />
      </div>
    </>
  );
  const view = render(page(0, { active: true, startedAt }));
  act(() => {
    view.rerender(page(1, { active: false, startedAt }));
  });
  let shownAt = Number.NaN;
  requestAnimationFrame(() => {
    shownAt = performance.now();
  });
  await act(async () => {
    await nextFrame();
  });
  await act(async () => {
    await frameAtOrAfter(shownAt + 250);
  });
  const restartedAt = Number(document.timeline.currentTime);
  act(() => {
    view.rerender(page(2, { active: true, startedAt: restartedAt }));
  });
  act(() => {
    view.rerender(page(2, { active: false, startedAt: restartedAt }));
  });
  const second = within(view.container.querySelector<HTMLElement>('[data-region=second]')!).getByRole('status');

  expect(second.dataset['state'], 'the restart hid words that still owed their minimum').toBe('holding');
  expect(
    (await effectTime('wait-conceal', second.querySelector<HTMLElement>('[data-slot=wait-indicator-body]')!)) - shownAt,
  ).toBeGreaterThanOrEqual(500 - oneFrame);
});

it('should hold a wait that restarted over an undrawn hold 500 ms from the frame its words showed in', async () => {
  /* The region mounts with its reveal due and settles, so a hold will draw the words; a refetch restarts the wait in
     the same task, and a long task holds the first frame. The minimum runs from that frame. */
  const startedAt = Number(document.timeline.currentTime) - 1100;
  const view = render(<WaitIndicator active label='Loading chat' startedAt={startedAt} />);
  act(() => {
    view.rerender(<WaitIndicator active={false} label='Loading chat' startedAt={startedAt} />);
  });
  const restartedAt = Number(document.timeline.currentTime);
  act(() => {
    view.rerender(<WaitIndicator active label='Loading chat' startedAt={restartedAt} />);
  });
  let shownAt = Number.NaN;
  const onFrame = (): void => {
    if (Number.isNaN(shownAt)) {
      shownAt = performance.now();
    }
  };
  document.addEventListener('animationstart', onFrame, { capture: true });
  requestAnimationFrame(onFrame);
  holdMainThread(400);
  await act(async () => {
    await nextFrame();
    await nextFrame();
  });
  document.removeEventListener('animationstart', onFrame, { capture: true });
  act(() => {
    view.rerender(<WaitIndicator active={false} label='Loading chat' startedAt={restartedAt} />);
  });

  expect(view.getByRole('status').dataset['state']).toBe('holding');
  expect(
    (await effectTime('wait-conceal')) - shownAt,
    'the restart held the words from a hold no frame had drawn',
  ).toBeGreaterThanOrEqual(500 - oneFrame);
});

/** A page with two waiting regions, whose second settles in one task with `milliseconds` of rendering before or after. */
function twoRegions({
  phase,
  first,
  second,
  busy,
}: {
  readonly phase: number;
  readonly first: number;
  readonly second: { active: boolean; startedAt: number };
  readonly busy: { milliseconds: number; where: 'before' | 'after' };
}): React.JSX.Element {
  const isBusy = phase === 1;
  return (
    <>
      <WaitIndicator active label='Loading chat' startedAt={first} />
      {isBusy && busy.where === 'before' ? <Busy milliseconds={busy.milliseconds} /> : null}
      <div data-region='second'>
        <WaitIndicator active={second.active} label='Loading history' startedAt={second.startedAt} />
      </div>
      {isBusy && busy.where === 'after' ? <Busy milliseconds={busy.milliseconds} /> : null}
    </>
  );
}

const secondStatus = (container: HTMLElement): HTMLElement =>
  within(container.querySelector<HTMLElement>('[data-region=second]')!).getByRole('status');

it('should not show words no frame drew once a render longer than their minimum has passed', async () => {
  /* The settle reads the timeline its task read first, 1,100 ms into the wait; the render before it runs 700 ms, so by
     the time any frame could draw the words their minimum is long over. */
  await nextFrame();
  const startedAt = Number(document.timeline.currentTime) - 1100;
  const busy = { milliseconds: 700, where: 'before' } as const;
  const view = render(twoRegions({ phase: 0, first: startedAt, second: { active: true, startedAt }, busy }));
  act(() => {
    view.rerender(twoRegions({ phase: 1, first: startedAt + 1, second: { active: false, startedAt }, busy }));
  });

  expect(secondStatus(view.container).dataset['state'], 'the words showed after their content arrived').toBe('idle');
});

it('should hold words a hold drew after the rest of its task for the minimum from their paint through a restart', async () => {
  /* The second region settles with its reveal due and undrawn, and 300 ms of rendering follow it in the task: the hold
     draws the words only after that. A restart 250 ms after the paint still owes the minimum. The row starts in a
     frame, so the timeline it reads is the time now. */
  await nextFrame();
  const startedAt = Number(document.timeline.currentTime) - 1100;
  const busy = { milliseconds: 300, where: 'after' } as const;
  const view = render(twoRegions({ phase: 0, first: startedAt, second: { active: true, startedAt }, busy }));
  act(() => {
    view.rerender(twoRegions({ phase: 1, first: startedAt + 1, second: { active: false, startedAt }, busy }));
  });
  let shownAt = Number.NaN;
  requestAnimationFrame(() => {
    shownAt = performance.now();
  });
  await act(async () => {
    await nextFrame();
  });
  await act(async () => {
    await frameAtOrAfter(shownAt + 250);
  });
  const restartedAt = Number(document.timeline.currentTime);
  act(() => {
    view.rerender(
      twoRegions({ phase: 2, first: startedAt + 1, second: { active: true, startedAt: restartedAt }, busy }),
    );
  });
  act(() => {
    view.rerender(
      twoRegions({ phase: 2, first: startedAt + 1, second: { active: false, startedAt: restartedAt }, busy }),
    );
  });

  expect(secondStatus(view.container).dataset['state'], 'the restart hid words that still owed their minimum').toBe(
    'holding',
  );
});

it('should not show words a hidden page never drew when its wait ends', () => {
  /* A hidden page draws no frames, so a reveal that fell due there was never seen; the content arriving ends the wait
     with nothing to hold, rather than with words over the content when the page shows again. */
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  try {
    const startedAt = Number(document.timeline.currentTime) - 1200;
    const view = render(<WaitIndicator active label='Loading chat' startedAt={startedAt} />);
    act(() => {
      view.rerender(<WaitIndicator active={false} label='Loading chat' startedAt={startedAt} />);
    });

    expect(view.getByRole('status').dataset['state'], 'the words wait to show over the content').toBe('idle');
  } finally {
    Reflect.deleteProperty(document, 'visibilityState');
  }
});

/**
 * Moves the named CSS animation on `element` to a hair before the end of its 0.01 ms step, where Chromium already
 * counts it finished: a frame time a whole hold apart from its start can land there (A15f2 History evidence, a 500 ms
 * hold started at 6,502.555 ms ended at progress 0.9999999999954).
 */
function seekToStepEnd(element: Element, name: string): Animation {
  const animation = element.getAnimations().find((candidate) => (candidate as CSSAnimation).animationName === name)!;
  const { delay } = animation.effect!.getComputedTiming();
  animation.pause();
  animation.currentTime = Number(delay) + 0.01 - 7e-14;
  return animation;
}

it('should hide a hold whose step ends a hair short of progress 1', () => {
  const view = renderAt(900, { active: true, label: 'Loading chat', startedAt: 0 });
  view.rerender(
    <WaitClockProvider clock={clockAt(1000)}>
      <WaitIndicator active={false} label='Loading chat' startedAt={0} />
    </WaitClockProvider>,
  );
  const body = find('wait-indicator-body');
  const conceal = seekToStepEnd(body, 'wait-conceal');

  expect(conceal.effect!.getComputedTiming().progress, 'the step did not end short of 1').toBeLessThan(1);
  expect(isShown(body), 'the hold kept its words past its end').toBe(false);
});

it('should hide the label at the slow mark when its step ends a hair short of progress 1', () => {
  renderAt(0, { active: true, label: 'Loading chat', slowLabel: 'Still loading chat', startedAt: 0 });
  seek(1001);
  const label = find('wait-indicator-label');
  const conceal = seekToStepEnd(label, 'wait-conceal');

  expect(conceal.effect!.getComputedTiming().progress, 'the step did not end short of 1').toBeLessThan(1);
  expect(isShown(label), 'the label stayed beside the slow words').toBe(false);
});
