/**
 * A14: the session's file check (plan § 4 A14; I15, MC-R18). The session folds the `revisions` child's word and the
 * `fileCheck` child's patience into `availability`, and reports each change to the registry with its other facts. The
 * session runs alone here on a step clock, over scripted children; `focus.machine.file-check.test.ts` holds the rows
 * that compose it with focus.
 */
import { describe, expect, it } from 'vitest';
import { createActor, createCallbackLogic } from 'xstate';
import type { AnyActorRef, EventObject } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { projectSessionMachine } from '#machines/project-session.machine.js';
import type { ProjectSessionMachineEvent, ProjectSessionRegion } from '#machines/project-session.machine.js';
import { modelCheckPatienceMilliseconds } from '#machines/session-file-check.machine.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';

/** A started parent that records what the session reports to it. */
const recordingParent = () => {
  const received: Array<EventObject & Record<string, unknown>> = [];
  const ref = createActor(
    createCallbackLogic<EventObject>(({ receive }) => {
      receive((event) => received.push(event as EventObject & Record<string, unknown>));
    }),
  ).start();
  return { ref, received };
};

/** A file manager's stand-in: the session keeps the ref it is told and never reads it. */
const fileManagerStandIn = (): FileManagerRef =>
  createActor(createCallbackLogic(() => undefined)) as unknown as FileManagerRef;

/**
 * One session whose `fileManager` child reports a file manager and the views region in one callback, as the real one
 * does, and whose `revisions` children start but report only when the row says so.
 */
const harness = () => {
  const guard = guardActors();
  const clock = new StepClock();
  const parent = recordingParent();
  const revisions: Array<(event: ProjectSessionMachineEvent) => void> = [];
  const fileManager: { report?: (event: ProjectSessionMachineEvent) => void } = {};
  const ready = (region: ProjectSessionRegion) =>
    createCallbackLogic<EventObject, { projectId: string }>(({ sendBack }) => {
      sendBack({ type: 'childReady', region });
      return undefined;
    });
  const actor = createActor(
    projectSessionMachine.provide({
      actors: {
        fileManager: createCallbackLogic<EventObject, { projectId: string }>(({ sendBack }) => {
          fileManager.report = sendBack as (event: ProjectSessionMachineEvent) => void;
          sendBack({ type: 'fileManagerChanged', fileManagerRef: fileManagerStandIn() });
          sendBack({ type: 'childReady', region: 'views' });
          return undefined;
        }),
        project: ready('runtime'),
        agentHost: ready('agentHost'),
        compute: ready('compute'),
        revisions: createCallbackLogic(({ sendBack }) => {
          revisions.push(sendBack as (event: ProjectSessionMachineEvent) => void);
          return undefined;
        }),
      },
    }),
    { clock, inspect: guard.inspect, input: { projectId: 'proj_a', parentRef: parent.ref as AnyActorRef } },
  ).start();
  const reports = () =>
    parent.received
      .filter((event) => event.type === 'sessionState')
      .map((event) => ({ state: event['state'], availability: event['availability'] }));
  return {
    actor,
    clock,
    guard,
    reports,
    /** The newest `revisions` child's word on the file check. */
    report: (settled: boolean) => {
      revisions.at(-1)?.({ type: 'fileCheckChanged', settled, judged: true });
    },
    /** The `fileManager` child reports a new file manager (the shared worker was replaced). */
    rebuild: () => {
      fileManager.report?.({ type: 'fileManagerChanged', fileManagerRef: fileManagerStandIn() });
    },
    revisions,
  };
};

describe('the session file check (A14)', () => {
  it('should be pending in its live report when its revisions child has said nothing yet', () => {
    const { actor, guard, reports, revisions } = harness();

    expect(actor.getSnapshot().matches('live')).toBe(true);
    expect(revisions).toHaveLength(1);
    expect(actor.getSnapshot().context.availability).toBe('pending');
    /* The views region came up in the same callback as the file manager: no live report says `settled`. Focus reads
     * the facts only of a live session, so the `opening` report's `settled` (no check yet) is never joined on. */
    expect(reports().filter((report) => report.state === 'live' && report.availability === 'settled')).toEqual([]);
    expect(reports().at(-1)).toEqual({ state: 'live', availability: 'pending' });
    actor.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should settle, stay settled through a later check of the same client until it turns slow, and say nothing for a repeat', () => {
    const { actor, clock, guard, report, reports } = harness();
    report(true);
    report(true);

    expect(reports().at(-1)).toEqual({ state: 'live', availability: 'settled' });
    const settledReports = reports().length;

    /* A later check: the open's wait is for a client's first check only (I20, B6), so focus would not wait on it. */
    report(false);
    report(false);
    clock.advance(modelCheckPatienceMilliseconds - 1);

    expect(reports().slice(settledReports)).toEqual([]);
    expect(actor.getSnapshot().context.availability).toBe('settled');

    /* It still turns slow at its patience, for "Try again", and settles from there. */
    clock.advance(1);
    report(true);

    expect(reports().slice(settledReports)).toEqual([
      { state: 'live', availability: 'slow' },
      { state: 'live', availability: 'settled' },
    ]);
    actor.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should take a check that starts before the check judged a status as its first, so the open waits for it (I20)', () => {
    const { actor, guard, reports, revisions } = harness();
    /* A Tau Cloud open still owed settles the first word, whatever the client publishes meanwhile. */
    revisions.at(-1)?.({ type: 'fileCheckChanged', settled: true, judged: false });
    expect(reports().at(-1)).toEqual({ state: 'live', availability: 'settled' });

    /* The open ends before the check judged a status: the check that follows is the first, and pending. */
    revisions.at(-1)?.({ type: 'fileCheckChanged', settled: false, judged: false });
    expect(reports().at(-1)).toEqual({ state: 'live', availability: 'pending' });
    actor.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should turn slow at the check patience on the clock, and settle from slow', () => {
    const { actor, clock, guard, report, reports } = harness();
    clock.advance(modelCheckPatienceMilliseconds - 1);

    expect(actor.getSnapshot().context.availability).toBe('pending');

    clock.advance(1);

    expect(reports().at(-1)).toEqual({ state: 'live', availability: 'slow' });

    report(true);

    expect(reports().at(-1)).toEqual({ state: 'live', availability: 'settled' });
    actor.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should count a new revision client from zero, so the patience of the one it replaced never makes it slow', () => {
    const { actor, guard, clock, rebuild, reports } = harness();
    clock.advance(modelCheckPatienceMilliseconds - 1);
    rebuild();
    clock.advance(modelCheckPatienceMilliseconds - 1);

    expect(actor.getSnapshot().context.availability).toBe('pending');

    clock.advance(1);

    expect(reports().at(-1)).toEqual({ state: 'live', availability: 'slow' });

    /* A new client again: back to pending, under a new check. */
    rebuild();
    expect(reports().at(-1)).toEqual({ state: 'live', availability: 'pending' });
    actor.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should drop a slow report about a check it has moved past (MC-R18)', () => {
    const { actor, guard, report } = harness();
    const { fileCheckId } = actor.getSnapshot().context;

    actor.send({ type: 'fileCheckSlow', check: fileCheckId - 1 });
    expect(actor.getSnapshot().context.availability).toBe('pending');

    report(true);
    actor.send({ type: 'fileCheckSlow', check: actor.getSnapshot().context.fileCheckId });
    expect(actor.getSnapshot().context.availability).toBe('settled');
    actor.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should stop its patience child with its other children', () => {
    const { actor, guard } = harness();
    const child = actor.getSnapshot().context.fileCheckRef;
    expect(child?.getSnapshot().status).toBe('active');

    actor.stop();
    expect(guard.take()).toEqual([]);

    expect(child?.getSnapshot().status).toBe('stopped');
  });
});
