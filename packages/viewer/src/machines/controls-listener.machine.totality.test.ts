/**
 * Totality baseline for the controls listener (MC-R17): every public event is sampled in its one state, and each
 * pair left unanswered must be on `controlsListenerIgnoredEvents`. Path table: 1. `active`, initial.
 */
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import {
  controlsListenerEventTypes,
  controlsListenerIgnoredEvents,
  controlsListenerMachine,
} from '#machines/controls-listener.machine.js';
import type { ControlsListenerEvent } from '#machines/controls-listener.machine.js';
import { graphicsMachine } from '#machines/graphics.machine.js';

/** One sample of every event type; the mapped type fails to compile when the union gains a type. */
const samples: { [T in ControlsListenerEvent['type']]: Extract<ControlsListenerEvent, { type: T }> } = {
  stopListening: { type: 'stopListening' },
  controlsInteractionStart: { type: 'controlsInteractionStart' },
  controlsInteractionMoved: { type: 'controlsInteractionMoved' },
  controlsInteractionEnd: { type: 'controlsInteractionEnd' },
};

/* The enumeration is pure: no actor starts, no listener is added and nothing reaches the graphics actor. */
const options = {
  input: {
    graphicsActorRef: createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      { input: {} },
    ),
    controls: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  },
  events: Object.values(samples),
  limit: 100,
  serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
};

describe('controls listener totality baseline', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...controlsListenerEventTypes].toSorted());
  });

  it('should reach its one state', () => {
    expect(pathTable(controlsListenerMachine, options)).toEqual([{ state: 'active', events: [] }]);
    expect(unreachedStates(controlsListenerMachine, options)).toEqual([]);
  });

  it('should answer every sampled event except the declared baseline', () => {
    expect(unansweredEvents(controlsListenerMachine, { ...options, ignore: controlsListenerIgnoredEvents })).toEqual(
      [],
    );
  });

  it('should declare no baseline pair that the machine now answers', () => {
    expect(unansweredEvents(controlsListenerMachine, options)).toEqual(
      controlsListenerIgnoredEvents.map(([state, eventType]) => ({ state, eventType })),
    );
  });
});
