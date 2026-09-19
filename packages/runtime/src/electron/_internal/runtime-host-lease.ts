type ElectronRuntimeHostReleaseReason = 'requested' | 'render-timeout';

type ElectronRuntimeHostRelease = (reason: ElectronRuntimeHostReleaseReason) => void;

const releasesByPort = new WeakMap<MessagePort, ElectronRuntimeHostRelease>();

export const registerElectronRuntimeHostRelease = (port: MessagePort, release: ElectronRuntimeHostRelease): void => {
  releasesByPort.set(port, release);
};

export const takeElectronRuntimeHostRelease = (port: MessagePort): ElectronRuntimeHostRelease | undefined => {
  const release = releasesByPort.get(port);
  releasesByPort.delete(port);
  return release;
};

/**
 * What Electron main reports about a dead utility: its exit code, whether main
 * itself initiated the kill, and the stderr it captured. `released` is what
 * separates an orderly teardown from an unexplained death.
 */
export type ElectronRuntimeHostExitDetail = {
  /** Absent only when the relay carried no numeric code — never fabricated. */
  readonly exitCode?: number;
  readonly released: boolean;
  readonly stderrTail?: string;
};

/**
 * Hands the transport client a subscription to this port's host-exit relay.
 * The renderer owns the `message` listener (and keeps it alive until the relay
 * for this host arrives, so a release-first teardown is still explained); the
 * client owns what to do with the detail.
 */
type ElectronRuntimeHostExitSubscribe = (notify: (detail: ElectronRuntimeHostExitDetail) => void) => void;

const hostExitsByPort = new WeakMap<MessagePort, ElectronRuntimeHostExitSubscribe>();

export const registerElectronRuntimeHostExit = (
  port: MessagePort,
  subscribe: ElectronRuntimeHostExitSubscribe,
): void => {
  hostExitsByPort.set(port, subscribe);
};

export const takeElectronRuntimeHostExit = (port: MessagePort): ElectronRuntimeHostExitSubscribe | undefined => {
  const subscribe = hostExitsByPort.get(port);
  hostExitsByPort.delete(port);
  return subscribe;
};
