/**
 * Electron main-process helpers for Tau runtime utility-process hosts.
 *
 * @public
 */

import { fileURLToPath } from 'node:url';

import type { ForkOptions, IpcMain, IpcMainEvent, Session, UtilityProcess } from 'electron';
import { ipcMain as defaultIpcMain, MessageChannelMain, session as defaultSession, utilityProcess } from 'electron';

import { electronRuntimeChannel as runtimeChannel } from '#electron/constants.js';

/** IPC channel used by Tau's Electron runtime bridge. */
export const electronRuntimeChannel = runtimeChannel;

export type ElectronRuntimeHeadersOptions = {
  readonly session?: Session;
};

export type RegisterElectronRuntimeMainOptions = {
  readonly channel?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly ipcMain?: IpcMain;
  readonly onError?: (error: Error) => void;
  readonly serviceName?: string;
  readonly stdio?: ForkOptions['stdio'];
  readonly utilityEntry: string | URL;
};

export type ElectronRuntimeMainHandle = {
  dispose(): void;
};

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

export const installElectronRuntimeHeaders = (options: ElectronRuntimeHeadersOptions = {}): void => {
  const targetSession = options.session ?? defaultSession.defaultSession;
  targetSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Embedder-Policy': ['require-corp'],
        'Cross-Origin-Opener-Policy': ['same-origin'],
      },
    });
  });
};

export const registerElectronRuntimeMain = (options: RegisterElectronRuntimeMainOptions): ElectronRuntimeMainHandle => {
  const channel = options.channel ?? electronRuntimeChannel;
  const targetIpcMain = options.ipcMain ?? defaultIpcMain;
  const liveUtilities = new Set<UtilityProcess>();

  const reportError = (error: unknown): void => {
    options.onError?.(toError(error));
  };

  const listener = (event: IpcMainEvent): void => {
    let utility: UtilityProcess | undefined;
    try {
      const utilityEntry =
        options.utilityEntry instanceof URL ? fileURLToPath(options.utilityEntry) : options.utilityEntry;
      const spawnedUtility = utilityProcess.fork(utilityEntry, [], {
        env: options.env,
        serviceName: options.serviceName ?? 'tau-runtime-host',
        stdio: options.stdio ?? 'inherit',
      });
      utility = spawnedUtility;
      liveUtilities.add(spawnedUtility);
      spawnedUtility.on('exit', () => {
        liveUtilities.delete(spawnedUtility);
      });

      const { port1: rendererPort, port2: utilityPort } = new MessageChannelMain();
      spawnedUtility.postMessage({ taucadRuntime: true }, [utilityPort]);

      const targetFrame = event.senderFrame;
      if (!targetFrame) {
        throw new Error('registerElectronRuntimeMain: IPC event did not include senderFrame');
      }
      targetFrame.postMessage(`${channel}:port`, undefined, [rendererPort]);

      event.sender.once('destroyed', () => {
        try {
          utility?.kill();
        } catch {
          /* Best-effort */
        }
      });
    } catch (error) {
      try {
        utility?.kill();
      } catch {
        /* Best-effort */
      }
      reportError(error);
    }
  };

  targetIpcMain.on(channel, listener);

  return {
    dispose(): void {
      targetIpcMain.off(channel, listener);
      for (const utility of liveUtilities) {
        try {
          utility.kill();
        } catch {
          /* Best-effort */
        }
      }
      liveUtilities.clear();
    },
  };
};
