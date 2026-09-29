import { describe, expect, it } from 'vitest';
import { createActor, createAsyncLogic, setup } from 'xstate';

import { StepClock } from '#clock.js';

describe('StepClock', () => {
  it('should fire timers armed during one advance', () => {
    const clock = new StepClock();
    const fired: string[] = [];
    // Each timer arms the next one when it fires: a at 0, then b 100 later, and so on.
    const chain: ReadonlyArray<readonly [name: string, delayMilliseconds: number]> = [
      ['a', 0],
      ['b', 100],
      ['c', 50],
      ['d', 200],
      ['e', 10],
    ];
    const arm = (index: number): void => {
      const link = chain[index];
      if (link === undefined) {
        return;
      }
      clock.setTimeout(() => {
        fired.push(`${clock.now()}:${link[0]}`);
        arm(index + 1);
      }, link[1]);
    };
    arm(0);

    clock.advance(1000);

    expect(fired).toEqual(['0:a', '100:b', '150:c', '350:d', '360:e']);
    expect(clock.now()).toBe(1000);
  });

  it('should drive a machine chain of after timers in one advance', () => {
    const machine = setup({}).createMachine({
      id: 'chain',
      initial: 'a',
      states: { a: { after: { 100: { target: 'b' } } }, b: { after: { 50: { target: 'c' } } }, c: {} },
    });
    const clock = new StepClock();
    const actor = createActor(machine, { clock }).start();

    clock.advance(150);

    expect(actor.getSnapshot().value).toBe('c');
  });

  it('should report the next due time', () => {
    const clock = new StepClock();
    expect(clock.nextDue()).toBeUndefined();

    const late = clock.setTimeout(() => undefined, 300);
    clock.setTimeout(() => undefined, 100);
    expect(clock.nextDue()).toBe(100);

    clock.advance(100);
    expect(clock.nextDue()).toBe(300);

    clock.clearTimeout(late);
    expect(clock.nextDue()).toBeUndefined();
  });

  it('should fire only the next due timers with next()', () => {
    const clock = new StepClock();
    const fired: string[] = [];
    clock.setTimeout(() => fired.push('a'), 100);
    clock.setTimeout(() => fired.push('b'), 100);
    clock.setTimeout(() => fired.push('c'), 200);

    expect(clock.next()).toBe(true);
    expect(fired).toEqual(['a', 'b']);
    expect(clock.now()).toBe(100);

    expect(clock.next()).toBe(true);
    expect(fired).toEqual(['a', 'b', 'c']);
    expect(clock.next()).toBe(false);
  });

  it('should time out async logic on the same clock', async () => {
    const hang = createAsyncLogic({
      timeout: 1000,
      run: async ({ signal }) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new Error('aborted', { cause: signal.reason }));
          });
        }),
    });
    const machine = setup({ actors: { hang } }).createMachine({
      id: 'timeout',
      initial: 'waiting',
      states: {
        waiting: { invoke: { src: 'hang', onDone: { target: 'done' }, onError: { target: 'timedOut' } } },
        done: {},
        timedOut: {},
      },
    });
    const clock = new StepClock();
    const actor = createActor(machine, { clock }).start();

    await clock.advanceAsync(999);
    expect(actor.getSnapshot().value).toBe('waiting');

    await clock.advanceAsync(1);
    expect(actor.getSnapshot().value).toBe('timedOut');
  });

  it('should settle promise effects between timers with advanceAsync', async () => {
    const load = createAsyncLogic({ run: async () => 'loaded' });
    const machine = setup({ actors: { load } }).createMachine({
      id: 'settle',
      initial: 'waiting',
      states: {
        waiting: { after: { 100: { target: 'loading' } } },
        loading: { invoke: { src: 'load', onDone: { target: 'cooling' }, onError: { target: 'failed' } } },
        cooling: { after: { 50: { target: 'done' } } },
        done: {},
        failed: {},
      },
    });
    const clock = new StepClock();
    const actor = createActor(machine, { clock }).start();

    await clock.advanceAsync(150);

    expect(actor.getSnapshot().value).toBe('done');
  });
});
