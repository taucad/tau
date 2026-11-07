/**
 * The authority's compute news on the event channel (charter D14, W10).
 *
 * The compute worker has one supervisor, and it is not this package: the
 * revisions package's `createSupervisedComputeWorker` spawns the worker,
 * watches it by heartbeat, fails the calls a dead worker held with a typed
 * error, restarts it within a budget and falls back inline past it. The bridge
 * only relays what that supervisor reports. The host hands the relay's
 * `onCrash` to the supervisor and its `source` to the bridge as
 * `computeEvents`, and every rooted connection's event channel hears one
 * `compute-restarted` frame per death.
 *
 * `ComputeCrashNotice` is the supervisor's `ComputeCrashReport`, written out
 * structurally so this package does not depend on revisions.
 */
import { Topic } from '@taucad/events';

/**
 * What the compute worker's supervisor reports when its worker dies.
 *
 * @public
 */
export type ComputeCrashNotice = Readonly<{
  /** Calls the dead worker held that failed typed. */
  failedCalls: number;
  /** Restarts inside the supervisor's window so far, this one included. */
  restarts: number;
  /** Whether the supervisor gave up restarting; later calls run on its fallback or fail typed. */
  abandoned: boolean;
}>;

/**
 * One compute frame on the event channel: the authority's compute worker
 * died. No file state was lost, since the compute worker holds none.
 *
 * @public
 */
export type ComputeRestartedEvent = Readonly<{ kind: 'compute-restarted' }> & ComputeCrashNotice;

/**
 * Where the bridge hears compute news: the bridge's event channels subscribe.
 *
 * @public
 */
export type ComputeEventSource = {
  subscribe(listener: (event: ComputeRestartedEvent) => void): () => void;
};

/**
 * The seam between the compute worker's supervisor and the bridge.
 *
 * @public
 */
export type ComputeEventRelay = {
  /** Hand to `exposeFileSystem`, `serveFileSystemBridgePort` or `createFileSystemBridgePort` as `computeEvents`. */
  readonly source: ComputeEventSource;
  /** Hand to the supervisor as its `onCrash`. */
  readonly onCrash: (report: ComputeCrashNotice) => void;
  /** Drop every listener. */
  dispose(): void;
};

/**
 * Relay a compute supervisor's crash reports to the bridge's event channels.
 *
 * @returns The relay: `onCrash` for the supervisor, `source` for the bridge.
 * @public
 */
export const computeEventRelay = (): ComputeEventRelay => {
  const topic = new Topic<ComputeRestartedEvent>({ name: 'FileSystemBridge.computeEvents' });
  return {
    source: {
      subscribe(listener) {
        return topic.subscribe(listener);
      },
    },
    onCrash(report) {
      topic.emit({
        kind: 'compute-restarted',
        failedCalls: report.failedCalls,
        restarts: report.restarts,
        abandoned: report.abandoned,
      });
    },
    dispose() {
      topic.dispose();
    },
  };
};
