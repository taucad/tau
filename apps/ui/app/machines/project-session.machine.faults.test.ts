/**
 * First-fault recording for the project session (MC-R12, charter D23, plan B2; A6c brings the machine to first-fault).
 *
 * On `main` the session's root `onError` overwrote `fault` with each later failure and reported none: these rows
 * fail there.
 */
import { describe, expect, it, vi } from 'vitest';
import { createActor, createCallbackLogic } from 'xstate';
import type { EventObject } from 'xstate';
import { projectSessionMachine } from '#machines/project-session.machine.js';
import type * as AppRuntimeFaultsModule from '#runtime/app-runtime-faults.js';

const runtimeFaults = vi.hoisted(() => ({ reportAppRuntimeFault: vi.fn() }));
vi.mock('#runtime/app-runtime-faults.js', async (importOriginal) => ({
  ...(await importOriginal<typeof AppRuntimeFaultsModule>()),
  reportAppRuntimeFault: runtimeFaults.reportAppRuntimeFault,
}));

type RootErrorHandler = (
  args: Readonly<{ context: unknown; event: Readonly<{ type: string; error: unknown }> }>,
  enq: unknown,
) => unknown;

/** A child that throws as it starts: its fault reaches the session's root, which no transition models. */
const throwing = (message: string) =>
  createCallbackLogic<EventObject, { projectId: string }>(() => {
    throw new Error(message);
  });
const silent = createCallbackLogic<EventObject, { projectId: string }>(() => undefined);

describe('the project session keeps its first fault (B2, D23)', () => {
  it('should keep the first child fault over a later one, and report it once', () => {
    runtimeFaults.reportAppRuntimeFault.mockClear();
    const actor = createActor(
      projectSessionMachine.provide({
        actors: { fileManager: silent, project: throwing('first'), agentHost: throwing('second'), compute: silent },
      }),
      { input: { projectId: 'p' } },
    ).start();

    expect(actor.getSnapshot().context.fault).toBe('first');
    expect(runtimeFaults.reportAppRuntimeFault.mock.calls.map(([error]) => (error as Error).message)).toEqual([
      'first',
    ]);
    actor.stop();
  });

  it('should record the first fault from its root onError, answer a later one with no change, and name no target', () => {
    const { onError } = projectSessionMachine.config as { onError?: RootErrorHandler };
    const enq = vi.fn();
    const first = new Error('boom');

    expect(
      onError!({ context: { fault: undefined }, event: { type: 'xstate.error.actor', error: first } }, enq),
    ).toEqual({ context: { fault: 'boom' } });
    expect(enq.mock.calls).toEqual([[runtimeFaults.reportAppRuntimeFault, first]]);
    expect(
      onError!({ context: { fault: 'boom' }, event: { type: 'xstate.error.actor', error: new Error('later') } }, enq),
    ).toEqual({});
    expect(enq).toHaveBeenCalledOnce();
  });
});
