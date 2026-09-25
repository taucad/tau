/**
 * Audience: owner-machine tests and W1's seam simulator. A per-actor-system clock
 * that fires chained timers in due order, so a test never waits on real time and
 * never patches the process's global timers.
 *
 * @packageDocumentation
 */

import { SimulatedClock } from 'xstate';

/**
 * Wait one real macrotask, so promise effects that settled in the meantime deliver
 * their results before the next timer fires.
 *
 * @returns A promise that resolves on the next macrotask.
 * @public
 */
export const flush = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * A `SimulatedClock` that steps to each next due timer.
 *
 * `SimulatedClock.increment` fires only the timers due at the end of the jump, so a
 * timer armed while advancing is counted from the end of the advance. `advance`
 * here fires every timer due within the window in due order, including timers armed
 * while firing; ties fire in arming order. Pass one instance per actor system as
 * `createActor(logic, { clock })`.
 *
 * @public
 */
export class StepClock extends SimulatedClock {
  readonly #due = new Map<number, number>();

  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- matches the `Clock` signature xstate declares.
  public override setTimeout(callback: (...args: any[]) => void, delayMilliseconds: number): number {
    const id = super.setTimeout(() => {
      this.#due.delete(id);
      callback();
    }, delayMilliseconds);
    this.#due.set(id, this.now() + delayMilliseconds);
    return id;
  }

  public override clearTimeout(id: number): void {
    this.#due.delete(id);
    super.clearTimeout(id);
  }

  /**
   * When the next pending timer is due.
   *
   * @returns The due time, or `undefined` when no timer is pending.
   */
  public nextDue(): number | undefined {
    const at = Math.min(...this.#due.values());
    return Number.isFinite(at) ? at : undefined;
  }

  /**
   * Fire the timers due at the next due time.
   *
   * @returns `false` when no timer is pending.
   */
  public next(): boolean {
    const at = this.nextDue();
    if (at === undefined) {
      return false;
    }
    this.#fireAt(at);
    return true;
  }

  /**
   * Fire each timer due within `milliseconds`, in due order, including timers armed
   * while firing, then move the clock to the end of the window.
   *
   * @param milliseconds - How far to move the clock.
   */
  public advance(milliseconds: number): void {
    const end = this.now() + milliseconds;
    for (let at = this.nextDue(); at !== undefined && at <= end; at = this.nextDue()) {
      this.#fireAt(at);
    }
    this.set(end);
  }

  /**
   * Like {@link StepClock.advance}, but awaits {@link flush} after each timer so that
   * promise effects settle between timers.
   *
   * @param milliseconds - How far to move the clock.
   */
  public async advanceAsync(milliseconds: number): Promise<void> {
    const end = this.now() + milliseconds;
    for (let at = this.nextDue(); at !== undefined && at <= end; at = this.nextDue()) {
      this.#fireAt(at);
      // oxlint-disable-next-line no-await-in-loop -- each timer must see the effects the previous one settled.
      await flush();
    }
    this.set(end);
    await flush();
  }

  #fireAt(at: number): void {
    this.set(Math.max(at, this.now()));
    const stuck = this.nextDue();
    if (stuck !== undefined && stuck <= this.now()) {
      throw new Error(
        `StepClock: a timer due at ${stuck} did not fire at ${this.now()}; was the clock advanced from inside a timer?`,
      );
    }
  }
}
