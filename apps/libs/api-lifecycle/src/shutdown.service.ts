import { setMaxListeners } from 'node:events';
import { Injectable } from '@nestjs/common';

/**
 * The API's stop signal and the work that must finish before modules tear down.
 *
 * `closeGracefully` aborts {@link ShutdownService.signal} the moment a stop
 * begins. Whatever would otherwise hold the HTTP drain open listens to it and
 * lets go at once: parked long polls answer, WebSockets close 1012, a push not
 * yet committing is refused. Work that outlives its response (a push's
 * announcement, a model step's settlement, a departure published to Redis) is
 * {@link ShutdownService.track}ed, and `closeGracefully` waits for it after the
 * drain and before Postgres and Redis close.
 */
@Injectable()
export class ShutdownService {
  readonly #controller = new AbortController();
  readonly #work = new Set<Promise<void>>();

  public constructor() {
    // Every parked long poll listens; Node would warn past ten listeners.
    setMaxListeners(0, this.signal);
  }

  /** Aborted once, when the process starts to stop. */
  public get signal(): AbortSignal {
    return this.#controller.signal;
  }

  /** Starts the stop. Idempotent. */
  public stop(): void {
    this.#controller.abort();
  }

  /**
   * Holds `work` open against the shutdown deadline. Its owner logs its own
   * failures; a rejection here only ends the wait.
   *
   * @param work - Work a request or a stop started that must finish before modules close.
   */
  public track(work: Promise<unknown>): void {
    const settle = async (): Promise<void> => {
      try {
        await work;
      } catch {
        // Owned and logged where it started.
      } finally {
        this.#work.delete(tracked);
      }
    };
    const tracked = settle();
    this.#work.add(tracked);
  }

  /**
   * Waits until nothing tracked is pending, including work registered while
   * waiting, or until `deadline`.
   *
   * @param deadline - Epoch milliseconds to give up at.
   * @returns How many tracked promises were still pending at the deadline.
   */
  public async settled(deadline: number): Promise<number> {
    let deadlineTimer: NodeJS.Timeout | undefined;
    const expired = new Promise<'expired'>((resolve) => {
      deadlineTimer = setTimeout(resolve, Math.max(0, deadline - Date.now()), 'expired');
    });
    try {
      while (this.#work.size > 0) {
        // oxlint-disable-next-line no-await-in-loop -- each pass waits for what the last one registered
        if ((await Promise.race([Promise.all(this.#work), expired])) === 'expired') {
          break;
        }
      }
    } finally {
      clearTimeout(deadlineTimer);
    }
    return this.#work.size;
  }
}
