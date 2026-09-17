/**
 * Electron utility-process transport — renderer client factory (Topology C).
 *
 * @public
 */

import { wrapMessagePort, wrapMessagePortMain, createChannelClient } from '@taucad/rpc';
import type { Channel, MessagePortMainLike, Port } from '@taucad/rpc';
import type { Geometry } from '@taucad/types';
import type {
  ExportGeometryResult,
  GeometryTransport,
  RuntimeExportResultTransport,
  RuntimeInitializeResult,
  RuntimeProtocol,
} from '#index.js';
import { runtimeProtocolSchemas } from '#transport/index.js';
import { materialiseExportResult } from '#transport/_internal/export-materialiser.js';
import { materialiseGeometry } from '#transport/_internal/geometry-materialiser.js';
import { triggerRenderTimeout } from '#transport/_internal/abort-channel.js';
import type {
  RuntimeInitializeMemoryHandle,
  RuntimeInitializePayload,
  RuntimeTransportCloseResult,
  RuntimeTransportClient,
  TransportClientReady,
  TransportDescriptor,
} from '#transport/index.js';

import type { ElectronUtilityTransportOptions } from '#electron/electron-utility-transport.schemas.js';
import { takeElectronRuntimeHostExit, takeElectronRuntimeHostRelease } from '#electron/_internal/runtime-host-lease.js';
import type { ElectronRuntimeHostExitDetail } from '#electron/_internal/runtime-host-lease.js';

const electronUtilityId = 'electron-utility';
const sessionKey = 'tau.runtime/v1';
/**
 * How long a DOM `close` waits for main's exit relay before reporting the exit
 * as unsignalled. Chromium disentangles the port 0.2–6 ms before the relay's
 * extra IPC hop lands, so finishing on the DOM event alone loses the code every
 * time; the window makes `exitCode: undefined` mean "no signal", not "lost a
 * race". Milliseconds.
 */
const hostExitRelayWindow = 250;
/** `@taucad/rpc`'s stand-in reason for a port that died without sending a bye. */
const portClosedReason = 'port-closed';

const isDebugEnabled = (): boolean => {
  if ((globalThis as { __TAU_ELECTRON_DEBUG?: unknown }).__TAU_ELECTRON_DEBUG === true) {
    return true;
  }
  // oxlint-disable-next-line n/prefer-global/process -- guarded by typeof check below
  const processEnv = typeof process === 'undefined' ? undefined : process.env;
  return processEnv?.['TAU_ELECTRON_DEBUG'] === '1';
};

const debugLog = (origin: string, message: string, data?: Record<string, unknown>): void => {
  if (!isDebugEnabled()) {
    return;
  }
  const payload = data ? ` ${JSON.stringify(data)}` : '';
  // oxlint-disable-next-line no-console -- diagnostic seam (gated by TAU_ELECTRON_DEBUG)
  console.log(`[tau-electron:${origin}] ${message}${payload}`);
};

const electronUtilityDescriptor = (): TransportDescriptor<typeof electronUtilityId> => ({
  id: electronUtilityId,
  wire: 'electron-utility',
  memory: {
    geometryDelivery: 'copy',
    abortSignal: 'wire-notify',
  },
  fileSystem: 'host-local',
});

/**
 * Pure descriptor for Electron utility renderer client options.
 *
 * @param _options - Renderer client options; the descriptor is port-independent.
 * @returns The Electron utility transport descriptor.
 * @public
 */
export const electronUtilityClientDescribe = (
  _options: ElectronUtilityTransportOptions,
): TransportDescriptor<typeof electronUtilityId> => electronUtilityDescriptor();

/** Options for an Electron utility-process client using an emitter-shaped transferred port. @public */
export type ElectronUtilityMainClientOptions = {
  /** `MessagePortMain` transferred from Electron main into another utility process. */
  readonly port: MessagePortMainLike;
  /** Release the corresponding main-owned utility lease. */
  readonly release?: (reason: 'requested' | 'render-timeout') => void;
};

type ElectronUtilityClientHooks = {
  readonly origin: string;
  readonly release?: (reason: 'requested' | 'render-timeout') => void;
  readonly subscribeHostExit?: (listener: (detail: ElectronRuntimeHostExitDetail) => void) => void;
  readonly wrappedPort: Port<unknown>;
};

const createElectronUtilityClient = (
  hooks: ElectronUtilityClientHooks,
): RuntimeTransportClient<RuntimeProtocol, Readonly<Record<never, never>>, typeof electronUtilityId> => {
  const { origin, release, subscribeHostExit, wrappedPort } = hooks;
  debugLog(origin, 'port-wrapped');

  let openPromise: Promise<TransportClientReady> | undefined;
  let channel: Channel<RuntimeProtocol> | undefined;
  let isClosed = false;
  /* A utility that dies before its hello failed to start; one that dies after
   * it died mid-session. Readiness is the only thing that separates them. */
  let phase: 'boot' | 'session' = 'boot';
  /* The wire bye reason, when the peer sent one before the port died. */
  let wireReason: string | undefined;
  let relayWait: ReturnType<typeof setTimeout> | undefined;

  let resolveClosed: ((result: RuntimeTransportCloseResult) => void) | undefined;
  const closed = new Promise<RuntimeTransportCloseResult>((resolve) => {
    resolveClosed = resolve;
  });

  const finish = async (result: RuntimeTransportCloseResult): Promise<void> => {
    if (isClosed) {
      return;
    }
    isClosed = true;
    clearTimeout(relayWait);
    debugLog(origin, 'closing', { reason: result.cause });
    try {
      channel?.close(result.cause);
    } catch {
      /* Best-effort */
    }
    try {
      wrappedPort.close();
    } catch {
      /* Best-effort */
    }
    try {
      release?.(result.cause === 'render-timeout' ? 'render-timeout' : 'requested');
    } catch {
      /* Best-effort */
    }
    resolveClosed?.(result);
  };

  /**
   * Turn what is known about the dead host into the terminal close result.
   * A kill main initiated is a requested teardown, not an unexplained exit.
   *
   * @param detail - Main's exit report, when one arrived.
   * @returns The close result to settle `closed` with.
   */
  const hostExitResult = (detail: ElectronRuntimeHostExitDetail | undefined): RuntimeTransportCloseResult => {
    if (detail?.released === true) {
      return { cause: 'requested' };
    }
    return {
      cause: 'host-exit',
      phase,
      ...(detail === undefined ? {} : { released: false }),
      ...(detail?.exitCode === undefined ? {} : { exitCode: detail.exitCode }),
      ...(detail?.stderrTail === undefined ? {} : { stderrTail: detail.stderrTail }),
      ...(wireReason === undefined ? {} : { reason: wireReason }),
    };
  };

  /* The DOM `close` and main's exit relay report the same death; Chromium
   * disentangles the port first, so finishing on it immediately is what threw
   * the exit code away. Hold the close for the relay window instead — the relay
   * finishes at once whenever it arrives, before or after. */
  wrappedPort.onClose?.(() => {
    if (isClosed || relayWait !== undefined) {
      return;
    }
    relayWait = setTimeout(() => {
      relayWait = undefined;
      void finish(hostExitResult(undefined));
    }, hostExitRelayWindow);
  });
  subscribeHostExit?.((detail) => {
    void finish(hostExitResult(detail));
  });

  const open = async (): Promise<TransportClientReady> => {
    if (openPromise) {
      return openPromise;
    }
    openPromise = (async () => {
      if (isClosed) {
        throw new Error('electronUtilityClient: closed before open()');
      }
      channel = createChannelClient<RuntimeProtocol>({
        port: wrappedPort,
        sessionKey,
        protocolSchemas: runtimeProtocolSchemas,
      });
      debugLog(origin, 'channel-created');
      /* Only a bye the host chose to send is a reason. A local close echoes
       * this transport's own cause back, and `portClosedReason` is the
       * channel's own synthesis of the port dying — the very event being
       * classified here, so reporting it would say nothing. */
      channel.onClose((info) => {
        if (info.origin === 'remote' && info.reason !== portClosedReason) {
          wireReason = info.reason;
        }
      });
      await channel.ready;
      phase = 'session';
      debugLog(origin, 'channel-ready');
      return { channel };
    })();
    return openPromise;
  };

  return {
    id: electronUtilityId,
    reservePreview() {
      return {};
    },
    renderTimeoutRecovery: {
      kind: 'terminable',
      abortRender(target): void {
        if (!channel) {
          return;
        }
        debugLog(origin, 'render-timeout', target);
        triggerRenderTimeout(channel, undefined, target);
      },
      async terminate(): Promise<void> {
        await finish({ cause: 'render-timeout' });
      },
    },
    describe(): TransportDescriptor<typeof electronUtilityId> {
      return electronUtilityDescriptor();
    },
    open,
    async initialize(input: RuntimeInitializePayload): Promise<RuntimeInitializeResult> {
      if (!channel) {
        await open();
      }
      if (!channel) {
        throw new Error('electronUtilityClient: channel unavailable after open()');
      }
      const memoryHandle: RuntimeInitializeMemoryHandle = {};
      return channel.call('initialize', { ...input, memoryHandle });
    },
    async resolveGeometry(transport: GeometryTransport): Promise<Geometry> {
      return materialiseGeometry(transport, undefined);
    },
    async resolveExport(transport: RuntimeExportResultTransport): Promise<ExportGeometryResult> {
      return materialiseExportResult(transport, undefined);
    },
    async close(): Promise<void> {
      await finish({ cause: 'requested' });
    },
    closed,
  };
};

/**
 * Renderer-side client factory (`MessagePort`).
 *
 * @param clientOptions - Renderer-received runtime port.
 * @returns A runtime transport client over that port.
 * @public
 */
export const electronUtilityClient = (
  clientOptions: ElectronUtilityTransportOptions,
): RuntimeTransportClient<RuntimeProtocol, Readonly<Record<never, never>>, typeof electronUtilityId> => {
  const { port: receivedPort } = clientOptions;
  const releaseRuntimeHost = takeElectronRuntimeHostRelease(receivedPort);
  const wrappedPort = wrapMessagePort<unknown>(receivedPort, {
    label: 'electron-utility:renderer',
    /* The renderer's end of the wire is a DOM `MessagePort`, but its far end is
     * a `MessagePortMain` in the utility: it accepts a transfer list the far end
     * cannot receive, detaching the caller's buffer and dropping the frame with
     * no error (measured, L03 F-L03-3). `geometryDelivery: 'copy'` above is the
     * same fact stated to the runtime; this makes the wire enforce it. */
    copyOnly: true,
  });
  return createElectronUtilityClient({
    origin: 'renderer:client',
    wrappedPort,
    ...(releaseRuntimeHost === undefined ? {} : { release: releaseRuntimeHost }),
    subscribeHostExit: (listener) => {
      takeElectronRuntimeHostExit(receivedPort)?.(listener);
    },
  });
};

electronUtilityClient.describe = electronUtilityClientDescribe;

/**
 * Utility-side client factory for a runtime port minted by Electron main.
 *
 * @param options - Emitter-shaped transferred port.
 * @returns A runtime transport client over the standard Electron runtime wire.
 * @public
 */
export const electronUtilityMainClient = (
  options: ElectronUtilityMainClientOptions,
): RuntimeTransportClient<RuntimeProtocol, Readonly<Record<never, never>>, typeof electronUtilityId> =>
  createElectronUtilityClient({
    origin: 'utility:client',
    wrappedPort: wrapMessagePortMain<unknown>(options.port, { label: 'electron-utility:utility-client' }),
    ...(options.release === undefined ? {} : { release: options.release }),
  });

electronUtilityMainClient.describe = (_options: ElectronUtilityMainClientOptions) => electronUtilityDescriptor();
