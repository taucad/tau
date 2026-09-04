import { packageVersion } from '@taucad/runtime/metadata';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';

import { ENV } from '#environment.config.js';
import { createRemoteHostSession, RemoteHostApiError } from '#lib/remote-host-client.js';
import { getRemoteComputePlacement, setRemoteComputePlacement } from '#lib/remote-compute-placement.js';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';

const failureState = (error: unknown): 'device-offline' | 'busy' | 'version-mismatch' | 'disconnected' => {
  if (!(error instanceof RemoteHostApiError)) {
    return 'disconnected';
  }
  if (error.code === 'DEVICE_OFFLINE' || error.code === 'AGENT_NOT_FOUND') {
    return 'device-offline';
  }
  if (error.code === 'BUSY') {
    return 'busy';
  }
  return error.code === 'VERSION_MISMATCH' ? 'version-mismatch' : 'disconnected';
};

/** Build a fresh cookie-authenticated remote transport for the selected daemon. */
export const remoteKernelOptions: LazyKernelOptionsFactory = async () => {
  const selected = getRemoteComputePlacement();
  if (selected.state === 'local') {
    throw new Error('Remote compute was deselected before the runtime connected.');
  }
  setRemoteComputePlacement({ state: 'connecting', deviceId: selected.deviceId });
  try {
    const session = await createRemoteHostSession(selected.deviceId, packageVersion);
    const runtimeConfig = createUiRuntimeConfig(ENV);
    return ({ fileSystem }) => ({
      config: runtimeConfig,
      transport: webSocketTransport({
        url: session.url,
        fileSystem,
        createSocket(url) {
          const socket = new WebSocket(url);
          if (new URL(url).pathname.endsWith('/runtime')) {
            socket.addEventListener('open', () => {
              setRemoteComputePlacement({ state: 'remote', deviceId: selected.deviceId });
            });
            socket.addEventListener('close', () => {
              const current = getRemoteComputePlacement();
              if (current.state !== 'local' && current.deviceId === selected.deviceId) {
                setRemoteComputePlacement({ state: 'disconnected', deviceId: selected.deviceId });
              }
            });
          }
          return socket;
        },
      }),
    });
  } catch (error) {
    setRemoteComputePlacement({
      state: failureState(error),
      deviceId: selected.deviceId,
      message: error instanceof Error ? error.message : 'Remote compute connection failed',
    });
    throw error;
  }
};
