// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { RevisionStatusProjection } from '@taucad/revisions';
import { createProjectOpenTimer, isHostedCheckoutApplied, markProjectOpen } from '#machines/project-open-timer.js';
import type { ProjectOpenMark } from '#machines/project-open-timer.js';

type OpenStatus = Pick<RevisionStatusProjection, 'remote' | 'sync'>;

const status = ({
  kind = 'tau',
  hasAppliedRemote,
}: Readonly<{ kind?: OpenStatus['remote']['kind']; hasAppliedRemote?: boolean }>): OpenStatus => ({
  remote: {
    kind,
    url: undefined,
    phase: kind === 'none' ? 'none' : 'connected',
    storage: undefined,
    overQuota: [],
    quota: undefined,
    error: undefined,
    reason: undefined,
    fetchOnly: false,
    provider: undefined,
    repositoryId: undefined,
  },
  sync: {
    state: 'checking',
    pullPhase: hasAppliedRemote === true ? 'idle' : 'applying',
    ...(hasAppliedRemote === undefined ? {} : { hasAppliedRemote }),
    pendingCount: 0,
    online: true,
    conflictRef: undefined,
    error: undefined,
    reason: undefined,
  },
});

const harness = (): Readonly<{
  marks: ProjectOpenMark[];
  advance: (milliseconds: number) => void;
  timer: ReturnType<typeof createProjectOpenTimer>;
}> => {
  let clock = 1000;
  const marks: ProjectOpenMark[] = [];
  const timer = createProjectOpenTimer({ now: () => clock, report: (mark) => marks.push(mark) });
  return {
    marks,
    advance: (milliseconds) => {
      clock += milliseconds;
    },
    timer,
  };
};

describe('createProjectOpenTimer', () => {
  it('should send first view on its own at the checkout, and fully fetched when every object is local', () => {
    const { marks, advance, timer } = harness();
    advance(1200);
    timer.fetchedFromNetwork();
    advance(800);
    timer.firstView();
    expect(marks).toEqual([{ phase: 'first_view', cache: 'cold', durationMilliseconds: 2000 }]);
    advance(3000);
    timer.fetchedFromNetwork();
    timer.fullyFetched();

    expect(marks).toEqual([
      { phase: 'first_view', cache: 'cold', durationMilliseconds: 2000 },
      { phase: 'fully_fetched', cache: 'cold', durationMilliseconds: 5000 },
    ]);
  });

  it('should label each mark by what was known then: a warm first view, a cold fully fetched', () => {
    const { marks, advance, timer } = harness();
    advance(800);
    timer.firstView();
    advance(400);
    timer.fetchedFromNetwork();
    timer.fullyFetched();

    expect(marks).toEqual([
      { phase: 'first_view', cache: 'warm', durationMilliseconds: 800 },
      { phase: 'fully_fetched', cache: 'cold', durationMilliseconds: 1200 },
    ]);
  });

  it('should never send fully fetched before first view', () => {
    const { marks, advance, timer } = harness();
    timer.fetchedFromNetwork();
    advance(4000);
    timer.fullyFetched();
    advance(500);
    timer.firstView();

    expect(marks).toEqual([{ phase: 'first_view', cache: 'cold', durationMilliseconds: 4500 }]);
    timer.fullyFetched();
    expect(marks.at(-1)).toEqual({ phase: 'fully_fetched', cache: 'cold', durationMilliseconds: 4500 });
  });

  it('should mark only the first open, so a later pull or fetch changes nothing', () => {
    const { marks, advance, timer } = harness();
    timer.firstView();
    timer.fullyFetched();
    timer.fetchedFromNetwork();
    advance(60_000);
    timer.firstView();
    timer.fullyFetched();

    expect(marks).toHaveLength(2);
    expect(marks.every((mark) => mark.cache === 'warm' && mark.durationMilliseconds === 0)).toBe(true);
  });

  it('should send no fully fetched while objects are still downloading, or ever when the root closes first', () => {
    const { marks, timer } = harness();
    timer.fetchedFromNetwork();
    timer.firstView();

    expect(marks.map(({ phase }) => phase)).toEqual(['first_view']);
  });
});

describe('isHostedCheckoutApplied', () => {
  it('should hold only for a Tau Cloud project whose open pull applied its checkout', () => {
    expect(isHostedCheckoutApplied(status({ hasAppliedRemote: true }))).toBe(true);
    expect(isHostedCheckoutApplied(status({ hasAppliedRemote: false }))).toBe(false);
    expect(isHostedCheckoutApplied(status({}))).toBe(false);
    expect(isHostedCheckoutApplied(status({ kind: 'git', hasAppliedRemote: true }))).toBe(false);
    expect(isHostedCheckoutApplied(status({ kind: 'none' }))).toBe(false);
  });
});

/* Open the UI, model waits: the view opens at the checkout, and the large objects finish after it. */
describe('markProjectOpen', () => {
  const downloading = {
    phase: 'fetching',
    paths: ['models/part.step'],
    objects: 0,
    totalObjects: 1,
    bytes: 0,
    totalBytes: 9,
  } as const;

  it('marks first view at the checkout and fully fetched only once the large objects are filled', () => {
    const { marks, advance, timer } = harness();
    markProjectOpen(timer, status({ hasAppliedRemote: false }));
    advance(200);
    markProjectOpen(timer, { ...status({ hasAppliedRemote: true }), largeObjects: downloading });
    expect(marks).toStrictEqual([{ phase: 'first_view', cache: 'cold', durationMilliseconds: 200 }]);
    advance(5000);
    markProjectOpen(timer, status({ hasAppliedRemote: true }));
    expect(marks).toStrictEqual([
      { phase: 'first_view', cache: 'cold', durationMilliseconds: 200 },
      { phase: 'fully_fetched', cache: 'cold', durationMilliseconds: 5200 },
    ]);
  });

  it('counts objects another reader was already downloading as cold, though no read of its own reported them', () => {
    const { marks, timer } = harness();
    markProjectOpen(timer, { ...status({ hasAppliedRemote: false }), largeObjects: downloading });
    markProjectOpen(timer, status({ hasAppliedRemote: true }));
    expect(marks.map(({ cache }) => cache)).toStrictEqual(['cold', 'cold']);
  });

  it('sends no fully fetched while the fill has failed', () => {
    const { marks, timer } = harness();
    markProjectOpen(timer, {
      ...status({ hasAppliedRemote: true }),
      largeObjects: { ...downloading, phase: 'failed', error: 'offline' },
    });
    expect(marks.map(({ phase }) => phase)).toStrictEqual(['first_view']);
  });

  it('marks both at once for a checkout with nothing left to fetch', () => {
    const { marks, advance, timer } = harness();
    advance(300);
    markProjectOpen(timer, status({ hasAppliedRemote: true }));
    expect(marks).toStrictEqual([
      { phase: 'first_view', cache: 'warm', durationMilliseconds: 300 },
      { phase: 'fully_fetched', cache: 'warm', durationMilliseconds: 300 },
    ]);
  });
});
