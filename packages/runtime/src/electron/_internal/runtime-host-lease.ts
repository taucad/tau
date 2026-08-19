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
 * Hands the transport client a subscription to this port's host-exit relay.
 * The renderer owns the `message` listener (and removes it on release); the
 * client owns what to do with the code.
 */
type ElectronRuntimeHostExitSubscribe = (notify: (exitCode?: number) => void) => void;

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
