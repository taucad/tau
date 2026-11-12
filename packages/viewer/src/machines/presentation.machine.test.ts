import { createActor, createCallbackLogic } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import { describe, expect, it } from 'vitest';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import {
  presentationEventTypes,
  presentationIgnoredEvents,
  presentationMachine,
} from '#machines/presentation.machine.js';
import type {
  PresentationContext,
  PresentationEvent,
  PresentationHostCommand,
  PresentationRequest,
} from '#machines/presentation.machine.js';

const request = (revision: number, key: string): PresentationRequest => ({
  revision,
  key,
  unitId: `unit:${key}`,
  sourceFile: undefined,
  bytes: new Uint8Array([revision]),
});

/** A presentation and a host factory whose hosts log each command and their stop. */
const setup = () => {
  const log: string[] = [];
  const host = (name: string) =>
    createCallbackLogic<PresentationHostCommand, undefined>(({ receive }) => {
      receive((command) => {
        log.push(command.type === 'prepare' ? `${name} prepare ${command.request.key}` : `${name} ${command.type}`);
      });
      return () => {
        log.push(`${name} stopped`);
      };
    });
  const actor = createActor(presentationMachine, { inspect: guardActors().inspect }).start();
  return { actor, host, log };
};

describe('presentation machine (G11b)', () => {
  it('should wait in idle for a host, and prepare the request in hand once one attaches', () => {
    const { actor, host, log } = setup();
    actor.send({ type: 'present', request: request(1, 'a') });
    expect(actor.getSnapshot().value).toBe('idle');
    actor.send({ type: 'hostAttached', hostId: 'one', host: host('one') });
    expect(actor.getSnapshot().value).toBe('preparing');
    expect(log).toEqual(['one prepare a']);
    actor.stop();
    expect(log).toEqual(['one prepare a', 'one stopped']);
  });

  it('should stay idle when a host attaches with no request, and still tell the host to cancel on a clear', () => {
    const { actor, host, log } = setup();
    actor.send({ type: 'hostAttached', hostId: 'one', host: host('one') });
    expect(actor.getSnapshot().value).toBe('idle');
    actor.send({ type: 'clear' });
    expect(log).toEqual(['one cancel']);
    expect(actor.getSnapshot().context.request).toBeUndefined();
    actor.stop();
  });

  it('should ignore outcomes of another request, and outcomes that arrive with no host', () => {
    const { actor, host } = setup();
    actor.send({ type: 'present', request: request(1, 'a') });
    // No host: nothing prepared the request, so no outcome is its.
    actor.send({ type: 'gltfPresentationCommitted', revision: 1, key: 'a' });
    expect(actor.getSnapshot().value).toBe('idle');
    actor.send({ type: 'hostAttached', hostId: 'one', host: host('one') });
    actor.send({ type: 'gltfPresentationCommitted', revision: 2, key: 'a' });
    actor.send({ type: 'gltfPresentationFailed', revision: 1, key: 'b' });
    actor.send({ type: 'gltfDisplayReady', revision: 1, key: 'b', barrier: 'analysis-ready' });
    expect(actor.getSnapshot().value).toBe('preparing');
    // A display-ready scene without a section barrier is still preparing until React attaches it.
    actor.send({ type: 'gltfDisplayReady', revision: 1, key: 'a', barrier: 'display-ready' });
    expect(actor.getSnapshot().value).toBe('preparing');
    actor.send({ type: 'gltfPresentationCommitted', revision: 1, key: 'a' });
    expect(actor.getSnapshot().value).toBe('presented');
    actor.stop();
  });

  it('should keep the request across a host that leaves, and ignore the leave of a replaced host', () => {
    const { actor, host, log } = setup();
    actor.send({ type: 'present', request: request(1, 'a') });
    actor.send({ type: 'hostAttached', hostId: 'one', host: host('one') });
    actor.send({ type: 'hostAttached', hostId: 'two', host: host('two') });
    actor.send({ type: 'hostDetached', hostId: 'one' });
    expect(actor.getSnapshot().context.host?.hostId).toBe('two');
    actor.send({ type: 'hostDetached', hostId: 'two' });
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context).toMatchObject({ request: request(1, 'a'), host: undefined });
    // A request made while no host is attached supersedes the kept one.
    actor.send({ type: 'present', request: request(2, 'b') });
    actor.send({ type: 'hostAttached', hostId: 'three', host: host('three') });
    expect(log).toEqual(['one prepare a', 'one stopped', 'two prepare a', 'two stopped', 'three prepare b']);
    actor.stop();
  });

  it('should leave presented or failed for preparing when a new request arrives', () => {
    const { actor, host } = setup();
    actor.send({ type: 'hostAttached', hostId: 'one', host: host('one') });
    actor.send({ type: 'present', request: request(1, 'a') });
    actor.send({ type: 'gltfPresentationFailed', revision: 1, key: 'a' });
    expect(actor.getSnapshot().value).toBe('failed');
    actor.send({ type: 'present', request: request(2, 'b') });
    expect(actor.getSnapshot().value).toBe('preparing');
    actor.send({ type: 'gltfPresentationCommitted', revision: 2, key: 'b' });
    actor.send({ type: 'present', request: request(3, 'c') });
    expect(actor.getSnapshot().value).toBe('preparing');
    actor.stop();
  });

  it('should hand a late section arm to the host, and keep the request and state it has', () => {
    const { actor, host, log } = setup();
    actor.send({ type: 'analyse' });
    expect(log).toEqual([]);
    actor.send({ type: 'present', request: request(1, 'a') });
    actor.send({ type: 'hostAttached', hostId: 'one', host: host('one') });
    actor.send({ type: 'gltfPresentationCommitted', revision: 1, key: 'a' });
    actor.send({ type: 'analyse' });
    expect(log).toEqual(['one prepare a', 'one analyse']);
    expect(actor.getSnapshot().value).toBe('presented');
    expect(actor.getSnapshot().context.request?.key).toBe('a');
    actor.stop();
  });
});

describe('presentation machine totality (G11b)', () => {
  const host = createCallbackLogic<PresentationHostCommand, undefined>(() => undefined);
  const samples: { [T in PresentationEvent['type']]: ReadonlyArray<Extract<PresentationEvent, { type: T }>> } = {
    present: [{ type: 'present', request: request(1, 'a') }],
    clear: [{ type: 'clear' }],
    analyse: [{ type: 'analyse' }],
    hostAttached: [{ type: 'hostAttached', hostId: 'one', host }],
    hostDetached: [{ type: 'hostDetached', hostId: 'one' }],
    gltfDisplayReady: [
      { type: 'gltfDisplayReady', revision: 1, key: 'a', barrier: 'analysis-ready' },
      { type: 'gltfDisplayReady', revision: 1, key: 'a', barrier: 'display-ready' },
    ],
    gltfAnalysisReady: [{ type: 'gltfAnalysisReady', revision: 1, key: 'a' }],
    gltfPresentationCommitted: [{ type: 'gltfPresentationCommitted', revision: 1, key: 'a' }],
    gltfPresentationFailed: [{ type: 'gltfPresentationFailed', revision: 1, key: 'a' }],
  };
  // A state is its value and whether a request and a host are in hand.
  const serializeState = (snapshot: AnyMachineSnapshot): string => {
    const context = snapshot.context as PresentationContext;
    return JSON.stringify([snapshot.value, context.request?.key, context.host?.hostId]);
  };
  const pathOptions = { events: Object.values(samples).flat(), limit: 500, serializeState };

  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...presentationEventTypes].toSorted());
  });

  it('should reach every state', () => {
    expect(unreachedStates(presentationMachine, pathOptions)).toEqual([]);
  });

  it('should answer every event in every state', () => {
    expect(unansweredEvents(presentationMachine, { ...pathOptions, ignore: presentationIgnoredEvents })).toEqual([]);
  });
});
