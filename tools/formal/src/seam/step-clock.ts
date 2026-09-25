import { SimulatedClock } from 'xstate';

/**
 * Stand-in for W2's `StepClock` (`@taucad/xstate-testing/clock`, machine-contract blueprint MC-S1),
 * reduced to what the simulator uses: `nextDue()` and `next()` (FM-Q6). Delete this file and import
 * W2's class once `libs/xstate-testing` lands; the simulator's use is the same.
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

  /** When the next pending timer is due, or `undefined` when none is pending. */
  public nextDue(): number | undefined {
    const at = Math.min(...this.#due.values());
    return Number.isFinite(at) ? at : undefined;
  }

  /** Fires the timers due at the next due time; `false` when none is pending. */
  public next(): boolean {
    const at = this.nextDue();
    if (at === undefined) {
      return false;
    }
    this.set(Math.max(at, this.now()));
    return true;
  }
}
