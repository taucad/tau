// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { RevisionStatusProjection } from '@taucad/revisions';
import { createProjectOpenTimer, isHostedCheckoutApplied } from '#machines/project-open-timer.js';
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
  it('should time a cold open from the root opening: first view at checkout, fully fetched once every object is local', () => {
    const { marks, advance, timer } = harness();
    advance(1200);
    timer.fetchedFromNetwork();
    advance(800);
    timer.firstView();
    expect(marks).toEqual([]);
    advance(3000);
    timer.fetchedFromNetwork();
    timer.fullyFetched();

    expect(marks).toEqual([
      { phase: 'first_view', cache: 'cold', durationMilliseconds: 2000 },
      { phase: 'fully_fetched', cache: 'cold', durationMilliseconds: 5000 },
    ]);
  });

  it('should mark an open that fetched nothing from the network as warm, both phases together', () => {
    const { marks, advance, timer } = harness();
    advance(800);
    timer.firstView();
    timer.fullyFetched();

    expect(marks).toEqual([
      { phase: 'first_view', cache: 'warm', durationMilliseconds: 800 },
      { phase: 'fully_fetched', cache: 'warm', durationMilliseconds: 800 },
    ]);
  });

  it('should never read fully fetched earlier than first view, when objects land before the checkout', () => {
    const { marks, advance, timer } = harness();
    timer.fetchedFromNetwork();
    advance(4000);
    timer.fullyFetched();
    advance(500);
    timer.firstView();

    expect(marks).toEqual([
      { phase: 'first_view', cache: 'cold', durationMilliseconds: 4500 },
      { phase: 'fully_fetched', cache: 'cold', durationMilliseconds: 4500 },
    ]);
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

  it('should send nothing until everything is local', () => {
    const { marks, timer } = harness();
    timer.fetchedFromNetwork();
    timer.firstView();

    expect(marks).toEqual([]);
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
