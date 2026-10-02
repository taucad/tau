/**
 * Electron PoC renderer (Topology C).
 *
 * Receives a `MessagePort` minted by Electron main (via the preload
 * `runtime-port` IPC relay), constructs a `RuntimeClient` over the
 * `electronUtilityTransport`, and drives the OpenSCAD kernel hosted
 * inside the utility process.
 *
 * UI state is event-driven:
 *
 * - `parametersResolved` populates the parameter label list before any
 *   geometry settles, mirroring the LSP-style "params first" UX.
 * - `geometry` updates the bounding-box readout, gated by `rgen`
 *   supersession so a stale render cannot overwrite a fresher one.
 *
 * Editor edits are forwarded as `client.openFile({ code, file })`; the
 * autonomous render loop on the kernel host drives the next `geometry`
 * event without an explicit per-call render request.
 *
 * Debug logs (gated by `TAU_ELECTRON_DEBUG=1` in main + utility env)
 * surface every boot-sequence seam in the renderer console for
 * Playwright failure capture.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { createRuntimeClient } from '@taucad/runtime';
import type { GetParametersResult, HashedGeometryResult, RuntimeClient } from '@taucad/runtime';
import { openscad } from '@taucad/openscad';

import { electronUtilityTransport } from '../transport/electron-utility-transport.js';
import type { ParametersFormRow } from './parameters-form.js';
import { ParametersForm } from './parameters-form.js';
import { resolveElectronNumericParameterOverride } from './parameter-override-sync.js';
import { BoundingBoxViewer } from './bounding-box-viewer.js';
import { MinimalGlbThreeViewer } from './geometry-three-viewer.js';
import type { GltfInspection } from './gltf-inspector.js';
import { inspectGlb } from './gltf-inspector.js';

const INITIAL_SOURCE = 'len=200;\ncube(len);\n';
/** Matches `e2e/electron-utility-fs-supply.spec.ts` seeded fixture on disk. */
const DISK_SEEDED_PREVIEW = '// e2e-disk-seed\ncube(10);\n';
const RENDERER_FILE = 'main.scad';

const debugLog = (origin: string, message: string, data?: Record<string, unknown>): void => {
  console.log(`[tau-electron:renderer:${origin}] ${message}${data ? ` ${JSON.stringify(data)}` : ''}`);
};

/**
 * R10 — Gate the `window.__taucadTransportDescriptor` diagnostic surface
 * (and any future debug probes) behind `TAU_ELECTRON_DEBUG=1`. Production
 * Electron builds should not ship the descriptor since it leaks transport
 * topology details and pins the renderer to test-shaped expectations.
 *
 * Mirrors the existing `DEBUG_ENABLED` switch in the main / utility /
 * transport modules plus the preload‑exposed `window.__TAU_ELECTRON_DEBUG`
 * boolean so packaged renderer builds still see the runtime env flag (the
 * Vite bundle does not retain `process.env` the way dev‑server SSR does).
 */
const tauPreloadDebug =
  (globalThis as unknown as Window & { __TAU_ELECTRON_DEBUG?: boolean }).__TAU_ELECTRON_DEBUG === true;
const tauProcessReflect = Reflect.get(globalThis as unknown as Record<string, unknown>, 'process') as
  | { env?: Readonly<Record<string, string | undefined>> }
  | undefined;
const tauProcessDebug = tauProcessReflect?.env?.['TAU_ELECTRON_DEBUG'] === '1';
const TAU_DEBUG = tauPreloadDebug || tauProcessDebug;

declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Electron PoC example: a small standalone app shell that mixes SCREAMING_SNAKE_CASE constants (glTF magic numbers) with React components, making the workspace's strict naming-convention contract an awkward fit. The example is non-shipping, so we relax the rule mirror-style to `libs/tau-examples`.
  interface Window {
    /**
     * `TAU_ELECTRON_DEBUG=1` forwarded from preload (`process.env` is not
     * available in production renderer bundles the same way as dev-server).
     */
    readonly __TAU_ELECTRON_DEBUG?: boolean;
    readonly taucad?: {
      requestRuntimePort(): void;
      readonly relayTag: {
        readonly runtime: string;
      };
    };
    /**
     * Topology-C diagnostic probe: surfaces the live transport
     * descriptor so the Playwright e2e can assert the renderer wired
     * through `electronUtilityTransport` and not a fallback.
     */
    __taucadTransportDescriptor?: {
      readonly id: string;
      readonly wire: string;
      readonly geometryDelivery: string;
      readonly fileDelivery: string;
      readonly abortSignal: string;
      readonly fileSystem: string;
    };
    __taucadLastError?: string;
  }
}

/**
 * Resolve the next `MessagePort` relayed from preload that carries the
 * supplied tag. Listens on the renderer's main-world `window` for the
 * `'message'` event dispatched by preload's relay — only the
 * renderer-side listener receives the genuine `MessagePort`.
 */
const awaitRelayedPort = async (relayTag: string): Promise<MessagePort> =>
  new Promise<MessagePort>((resolve) => {
    const handler = (event: MessageEvent): void => {
      const data = event.data as { taucadRelay?: string } | undefined;
      if (!data || data.taucadRelay !== relayTag) {
        return;
      }
      const port = event.ports[0];
      if (!port) {
        return;
      }
      (globalThis as unknown as Window).removeEventListener('message', handler);
      resolve(port);
    };
    (globalThis as unknown as Window).addEventListener('message', handler);
  });

type SchemaProperties = Record<string, { default?: unknown; type?: string } | undefined>;

/** Maps runtime `GetParametersResult` rows for {@link ParametersForm}. */
const parametersFromResult = (result: GetParametersResult): readonly ParametersFormRow[] => {
  if (!result.success) {
    return [];
  }
  const { defaultParameters, jsonSchema } = result.data;
  const properties = (jsonSchema as { properties?: SchemaProperties } | undefined)?.properties ?? {};
  const seen = new Set<string>();
  const out: ParametersFormRow[] = [];
  for (const [name, descriptor] of Object.entries(properties)) {
    seen.add(name);
    out.push({
      name,
      defaultValue: (defaultParameters[name] ?? descriptor?.default ?? 0) as ParametersFormRow['defaultValue'],
    });
  }
  for (const [name, value] of Object.entries(defaultParameters)) {
    if (seen.has(name)) {
      continue;
    }
    out.push({ name, defaultValue: value as ParametersFormRow['defaultValue'] });
  }
  return out;
};

const emptyInspection: GltfInspection = {
  asset: { version: '2.0', generator: 'tau-electron-poc' },
  bbox: {
    min: [0, 0, 0],
    max: [0, 0, 0],
    size: [0, 0, 0],
    center: [0, 0, 0],
  },
  counts: { meshes: 0, primitives: 0, vertices: 0, triangles: 0 },
};

/** Copy so `GLTFLoader.parse` and `inspectGlb` own a stable `ArrayBuffer`. */
const bytesToDisposableArrayBuffer = (bytes: Uint8Array<ArrayBuffer>): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

const gltfPayloadFromGeometry = (
  result: HashedGeometryResult,
): { glbBuffer: ArrayBuffer; inspection: GltfInspection } | undefined => {
  if (!result.success) {
    return undefined;
  }
  const first = result.data[0];
  if (first?.format !== 'gltf') {
    return undefined;
  }
  /* The wire-delivered `data[0].content` is a discriminated wrapper:
   * `{ delivery: 'inline', bytes: Uint8Array }` for inline / copy
   * tiers, or `{ delivery: 'pooled', key: string }` for SAB-pool
   * tiers. The Electron utility transport advertises
   * `geometryDelivery: 'inline'` so we always see the inline arm; a
   * defensive extractor still handles a raw `Uint8Array` (some
   * transports normalise before fan-out). */
  const content = first.content as unknown;
  let bytes: Uint8Array<ArrayBuffer> | undefined;
  if (content instanceof Uint8Array) {
    bytes = content as Uint8Array<ArrayBuffer>;
  } else if (
    content !== null &&
    typeof content === 'object' &&
    'bytes' in (content as Record<string, unknown>) &&
    (content as { bytes?: unknown }).bytes instanceof Uint8Array
  ) {
    bytes = (content as { bytes: Uint8Array<ArrayBuffer> }).bytes;
  }
  if (!bytes) {
    debugLog('inspector', 'no-bytes-on-geometry', {
      contentShape:
        content !== null && typeof content === 'object'
          ? Object.keys(content as Record<string, unknown>).join(',')
          : typeof content,
    });
    return undefined;
  }
  try {
    const glbBuffer = bytesToDisposableArrayBuffer(bytes);
    const inspection = inspectGlb(glbBuffer);
    debugLog('inspector', 'glb-inspect-success', {
      bytes: glbBuffer.byteLength,
      bboxSize: inspection.bbox.size,
    });
    return { glbBuffer, inspection };
  } catch (error) {
    debugLog('inspector', 'glb-inspect-failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
};

export function App(): React.ReactElement {
  const [source, setSource] = useState(INITIAL_SOURCE);
  const [parameters, setParameters] = useState<readonly ParametersFormRow[]>([]);
  const [inspection, setInspection] = useState<GltfInspection>(emptyInspection);
  const [geometryGlbBuffer, setGeometryGlbBuffer] = useState<ArrayBuffer | undefined>();
  const [override, setOverride] = useState<{ name: string; value: number } | undefined>();
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const clientReference = useRef<RuntimeClient | undefined>(undefined);
  const latestRgenReference = useRef<number>(-1);
  const lastKernelNumericReference = useRef<{ name: string; value: number } | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const cancellation = (): boolean => cancelled;
    const cleanups: Array<() => void> = [];

    const recordError = (where: string, error: unknown): void => {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      const payload = `[${where}] ${message}${stack ? `\n${stack}` : ''}`;
      (globalThis as unknown as Window).__taucadLastError = payload;
      setErrorMessage(payload);
      debugLog('bootstrap', `error-at-${where}`, { message });
    };

    const bootstrap = async (): Promise<void> => {
      const bridge = (globalThis as unknown as Window).taucad;
      if (!bridge) {
        recordError('bridge-missing', new Error('window.taucad bridge unavailable (preload failed)'));
        if (!cancelled) {
          setConnectionState('error');
        }
        return;
      }

      setConnectionState('connecting');
      debugLog('bootstrap', 'requesting-runtime-port');

      try {
        // Subscribe BEFORE triggering the IPC request so the relayed
        // 'message' event cannot race the listener registration.
        const portPromise = awaitRelayedPort(bridge.relayTag.runtime);
        bridge.requestRuntimePort();
        debugLog('bootstrap', 'awaiting-relayed-port');
        const port = await portPromise;
        debugLog('bootstrap', 'port-received');
        port.start();
        if (cancelled) {
          return;
        }

        const client = createRuntimeClient({
          transport: electronUtilityTransport({ port }),
          kernels: [openscad()],
        }) as unknown as RuntimeClient;
        clientReference.current = client;
        debugLog('bootstrap', 'runtime-client-constructed');

        /* `client.transport` is populated immediately on construction
         * — `describe()` is synchronous and runs in the
         * `RuntimeWorkerClient` constructor. Surface the descriptor
         * for the Playwright e2e harness, but only when the debug
         * flag is set so production builds do not ship it (R10). */
        const exposeDescriptor = (): void => {
          if (!TAU_DEBUG) {
            return;
          }
          // oxlint-disable-next-line unicorn/prefer-global-this -- ambient renderer-only diagnostic surface
          (globalThis as unknown as Window).__taucadTransportDescriptor = {
            id: client.transport.id,
            wire: client.transport.descriptor.wire,
            geometryDelivery: client.transport.descriptor.memory.geometryDelivery,
            fileDelivery: client.transport.descriptor.memory.fileDelivery,
            abortSignal: client.transport.descriptor.memory.abortSignal,
            fileSystem: client.transport.descriptor.fileSystem,
          };
          debugLog('bootstrap', 'transport-descriptor-exposed', {
            id: client.transport.id,
          });
        };

        const offParameters = client.on('parametersResolved', (result: GetParametersResult) => {
          if (cancelled) {
            return;
          }
          debugLog('event', 'parametersResolved', { success: result.success });
          setParameters(parametersFromResult(result));
        });
        cleanups.push(offParameters);

        const offGeometry = client.on('geometry', (result: HashedGeometryResult) => {
          if (cancelled) {
            return;
          }
          debugLog('event', 'geometry', {
            success: result.success,
            count: result.success ? result.data.length : 0,
          });
          const next = gltfPayloadFromGeometry(result);
          if (!next) {
            return;
          }
          /* The runtime client already supersedes stale renders before
           * fanning out the `'geometry'` event — no per-listener rgen
           * gate required. The `latestRgenReference` is still tracked
           * for diagnostic purposes only. */
          latestRgenReference.current += 1;
          setGeometryGlbBuffer(next.glbBuffer);
          setInspection(next.inspection);
        });
        cleanups.push(offGeometry);

        const offError = client.on('error', (issues) => {
          const message = issues.map((index) => index.message).join('; ') || 'unknown error';
          debugLog('event', 'error', { message, count: issues.length });
          recordError('runtime-error-event', new Error(message));
        });
        cleanups.push(offError);

        /* Surface the descriptor before the first openFile so the
         * Playwright harness can assert wiring even if the kernel
         * round-trip is slow. */
        exposeDescriptor();

        debugLog('bootstrap', 'opening-file');
        await client.openFile({ code: { [RENDERER_FILE]: INITIAL_SOURCE } });
        debugLog('bootstrap', 'openFile-resolved');

        if (cancellation()) {
          return;
        }
        setConnectionState('ready');
      } catch (error) {
        recordError('bootstrap-throw', error);
        if (!cancelled) {
          setConnectionState('error');
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      for (const off of cleanups) {
        off();
      }
      const client = clientReference.current;
      clientReference.current = undefined;
      void client?.terminate();
    };
  }, []);

  useEffect(() => {
    const client = clientReference.current;
    if (!client || connectionState !== 'ready') {
      return;
    }
    if (source === INITIAL_SOURCE) {
      return;
    }
    debugLog('effect', 'forwarding-source-update');
    void client.openFile({ code: { [RENDERER_FILE]: source } });
  }, [source, connectionState]);

  useEffect(() => {
    const numeric = parameters.find((p) => typeof p.defaultValue === 'number');
    if (!numeric) {
      lastKernelNumericReference.current = undefined;
      setOverride(undefined);
      return;
    }
    const numericDefault = typeof numeric.defaultValue === 'number' ? numeric.defaultValue : 0;
    const lastKernelNumericSnapshot = lastKernelNumericReference.current;
    lastKernelNumericReference.current = { name: numeric.name, value: numericDefault };
    setOverride((previous) =>
      resolveElectronNumericParameterOverride(
        { name: numeric.name, defaultValue: numericDefault },
        previous,
        lastKernelNumericSnapshot,
      ),
    );
  }, [parameters]);

  /* When parameter override changes, push a re-render with the new
   * parameter value baked into the source. This drives the bbox-size
   * change in the e2e parameter-form interaction test (200 → 400). */
  useEffect(() => {
    const client = clientReference.current;
    if (!client || connectionState !== 'ready' || !override) {
      return;
    }
    debugLog('effect', 'forwarding-parameter-override', { override });
    void client.openFile({
      code: { [RENDERER_FILE]: source },
      parameters: { [override.name]: override.value },
    });
  }, [override, connectionState, source]);

  const openSeededFromDisk = async (): Promise<void> => {
    const client = clientReference.current;
    if (!client) {
      return;
    }
    /* Drop prior model parameter UI so the override effect cannot
     * re-apply `len=200` from the previous `main.scad` session after
     * we switch entry files (see `forwarding-parameter-override`). */
    setOverride(undefined);
    setParameters([]);
    await client.openFile({ file: '/seeded.scad' });
    /* Keep editor state aligned with disk so follow-up autonomous
     * `openFile({ code })` paths (parameter resolution) cannot
     * stomp the seeded entry with stale in-memory INITIAL_SOURCE. */
    setSource(DISK_SEEDED_PREVIEW);
  };

  const banner = useMemo(() => {
    if (connectionState === 'connecting') {
      return 'Connecting to runtime…';
    }
    if (connectionState === 'error') {
      return `Runtime bridge unavailable${errorMessage ? `: ${errorMessage.slice(0, 200)}` : ''}`;
    }
    return 'Tau Electron PoC';
  }, [connectionState, errorMessage]);

  return (
    <div data-testid='app-root' style={rootStyles}>
      <header style={headerStyles}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h1 style={titleStyles}>{banner}</h1>
          {TAU_DEBUG ? (
            <button type='button' data-testid='open-seeded' onClick={() => void openSeededFromDisk()}>
              Open disk seeded.scad
            </button>
          ) : null}
        </div>
      </header>
      <div style={mainStyles}>
        <section style={paneStyles}>
          <h2 style={paneTitleStyles}>Editor</h2>
          <textarea
            data-testid='editor'
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
            }}
            spellCheck={false}
            style={editorStyles}
          />
        </section>
        <section style={paneStyles}>
          <h2 style={paneTitleStyles}>Preview</h2>
          <MinimalGlbThreeViewer glb={geometryGlbBuffer} />
        </section>
        <section style={paneStyles}>
          <h2 style={paneTitleStyles}>Parameters</h2>
          <ParametersForm
            params={parameters}
            override={override}
            onChange={(name, value) => {
              setOverride({ name, value });
            }}
          />
        </section>
        <section style={paneStyles}>
          <h2 style={paneTitleStyles}>Bounding box viewer</h2>
          <BoundingBoxViewer inspection={inspection} />
        </section>
      </div>
    </div>
  );
}

const rootStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  fontFamily: 'system-ui, sans-serif',
};

const headerStyles: React.CSSProperties = {
  padding: '0.5rem 1rem',
  borderBottom: '1px solid #ccc',
};

const titleStyles: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 600,
  margin: 0,
};

const mainStyles: React.CSSProperties = {
  display: 'grid',
  gap: '1rem',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1fr)',
  minHeight: 0,
  padding: '1rem',
  flex: 1,
};

const paneStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  border: '1px solid #ddd',
  borderRadius: 6,
  padding: '0.5rem',
  minHeight: 0,
};

const paneTitleStyles: React.CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: 600,
  marginTop: 0,
  marginBottom: '0.5rem',
};

const editorStyles: React.CSSProperties = {
  flex: 1,
  fontFamily: 'ui-monospace, monospace',
  fontSize: '0.9rem',
  padding: '0.5rem',
  border: '1px solid #ccc',
  borderRadius: 4,
  resize: 'none',
};
