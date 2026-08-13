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
