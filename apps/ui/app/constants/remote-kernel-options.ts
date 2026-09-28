import { packageVersion } from '@taucad/runtime/metadata';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';

import { createRemoteHostSession, RemoteHostApiError } from '#lib/remote-host-client.js';
import type { RemoteHostSession } from '#lib/remote-host-client.js';
import {
  getRemoteComputePlacement,
  selectRemoteComputeDevice,
  setRemoteComputePlacement,
} from '#lib/remote-compute-placement.js';
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

/** WebSocket 1012 Service Restart: the API Machine relaying this session is stopping. */
const serviceRestartCloseCode = 1012;

/**
 * Waits between session requests after an API restart. The daemon reconnects to
 * a staying Machine within about 1.25 s and reads as offline until it does, so
 * the last request lands 3.75 s after the first.
 */
const restartRedialDelays = [250, 500, 1000, 2000] as const;

/** Set by a 1012 close; the next session request rides out the daemon's reconnect. */
let redialAfterRestart = false;

const createSessionAfterRestart = async (deviceId: string): Promise<RemoteHostSession> => {
  for (const redialDelay of restartRedialDelays) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- Each request waits on the previous one's answer.
      return await createRemoteHostSession(deviceId, packageVersion);
    } catch (error) {
      if (failureState(error) !== 'device-offline') {
        throw error;
      }
    }
    // oxlint-disable-next-line no-await-in-loop -- The wait between requests is the point.
    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, redialDelay);
    });
  }
  return createRemoteHostSession(deviceId, packageVersion);
};

/** Build a fresh cookie-authenticated remote transport for the selected daemon. */
export const remoteKernelOptions: LazyKernelOptionsFactory = async () => {
  const selected = getRemoteComputePlacement();
  if (selected.state === 'local') {
    throw new Error('Remote compute was deselected before the runtime connected.');
  }
  const afterRestart = redialAfterRestart;
  redialAfterRestart = false;
  setRemoteComputePlacement({ state: 'connecting', deviceId: selected.deviceId });
  try {
    const session = afterRestart
      ? await createSessionAfterRestart(selected.deviceId)
      : await createRemoteHostSession(selected.deviceId, packageVersion);
    return ({ fileSystem }) => ({
      transport: webSocketTransport({
        url: session.url,
        fileSystem,
        createSocket(url) {
          const socket = new WebSocket(url);
          if (new URL(url).pathname.endsWith('/runtime')) {
            socket.addEventListener('open', () => {
              setRemoteComputePlacement({ state: 'remote', deviceId: selected.deviceId });
            });
            socket.addEventListener('close', (event) => {
              const current = getRemoteComputePlacement();
              if (current.state === 'local' || current.deviceId !== selected.deviceId) {
                return;
              }
              if (event.code === serviceRestartCloseCode) {
                /* A new selection revision rebuilds the runtime on a fresh session. */
                redialAfterRestart = true;
                selectRemoteComputeDevice(selected.deviceId);
                return;
              }
              setRemoteComputePlacement({ state: 'disconnected', deviceId: selected.deviceId });
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
