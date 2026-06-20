/**
 * Electron renderer.
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

import { electronUtilityTransport, requestElectronRuntimePort } from '@taucad/runtime/electron/renderer';
import type { runtime } from '../main/runtime-definition.js';
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
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Electron example: a small standalone app shell that mixes SCREAMING_SNAKE_CASE constants (glTF magic numbers) with React components, making the workspace's strict naming-convention contract an awkward fit.
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
  asset: { version: '2.0', generator: 'tau-electron-example' },
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
        // The runtime helper subscribes before triggering IPC so the
        // relayed port cannot race the listener registration.
        debugLog('bootstrap', 'awaiting-relayed-port');
        const port = await requestElectronRuntimePort({ bridge });
        debugLog('bootstrap', 'port-received');
        if (cancelled) {
          return;
        }

        const client = createRuntimeClient<typeof runtime>({
          transport: electronUtilityTransport({ port }),
        });
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

  const statusLabel = useMemo(() => {
    if (connectionState === 'connecting') {
      return 'connecting';
    }
    if (connectionState === 'error') {
      return 'error';
    }
    if (connectionState === 'ready') {
      return 'ready';
    }
    return 'idle';
  }, [connectionState]);

  const runtimeMessage = useMemo(() => {
    if (connectionState === 'connecting') {
      return 'Connecting to the Electron utility-process runtime.';
    }
    if (connectionState === 'error') {
      return `Runtime bridge unavailable${errorMessage ? `: ${errorMessage.slice(0, 200)}` : ''}`;
    }
    if (connectionState === 'ready') {
      return 'OpenSCAD rendered through @taucad/runtime in an Electron utility process.';
    }
    return 'Waiting for runtime startup.';
  }, [connectionState, errorMessage]);

  return (
    <div data-testid='app-root' style={rootStyles}>
      <header style={headerStyles}>
        <div>
          <div style={eyebrowStyles}>Electron + Utility Process</div>
          <h1 style={titleStyles}>Tau Runtime Example</h1>
          <p style={subtitleStyles}>
            Edit OpenSCAD source, tune parameters, and inspect the GLB produced by @taucad/runtime.
          </p>
        </div>
        <div style={headerActionsStyles}>
          <div data-state={statusLabel} style={statusPillStyles}>
            {statusLabel}
          </div>
          {TAU_DEBUG ? (
            <button type='button' data-testid='open-seeded' onClick={() => void openSeededFromDisk()}>
              Open disk seeded.scad
            </button>
          ) : null}
        </div>
      </header>
      <div style={mainStyles}>
        <section style={{ ...paneStyles, ...sourcePaneStyles }}>
          <div style={paneHeaderStyles}>
            <h2 style={paneTitleStyles}>main.scad</h2>
          </div>
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
        <section style={{ ...paneStyles, ...previewPaneStyles }}>
          <div style={paneHeaderStyles}>
            <h2 style={paneTitleStyles}>Preview</h2>
            <span style={transportStyles}>electron-utility</span>
          </div>
          <MinimalGlbThreeViewer glb={geometryGlbBuffer} />
          <div style={resultStyles}>
            <strong style={resultTitleStyles}>
              {statusLabel === 'error' ? 'Error' : statusLabel === 'ready' ? 'Ready' : 'Working'}
            </strong>
            <span>{runtimeMessage}</span>
          </div>
        </section>
        <aside style={sideStackStyles}>
          <section style={{ ...paneStyles, ...sidePaneStyles }}>
            <div style={paneHeaderStyles}>
              <h2 style={paneTitleStyles}>Parameters</h2>
            </div>
            <ParametersForm
              params={parameters}
              override={override}
              onChange={(name, value) => {
                setOverride({ name, value });
              }}
            />
          </section>
          <section style={{ ...paneStyles, ...sidePaneStyles, ...diagnosticsPaneStyles }}>
            <div style={paneHeaderStyles}>
              <h2 style={paneTitleStyles}>Diagnostics</h2>
            </div>
            <BoundingBoxViewer inspection={inspection} />
          </section>
        </aside>
      </div>
    </div>
  );
}

const rootStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minWidth: 0,
  overflow: 'hidden',
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  background: '#070b0f',
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  color: '#eef2f7',
  fontFamily: 'Inter, system-ui, sans-serif',
  padding: '1rem',
  gap: '0.85rem',
};

const headerStyles: React.CSSProperties = {
  alignItems: 'center',
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  background: 'rgba(13, 20, 28, 0.86)',
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  border: '1px solid rgba(148, 163, 184, 0.18)',
  borderRadius: 8,
  display: 'flex',
  gap: '1rem',
  justifyContent: 'space-between',
  minHeight: 76,
  padding: '1rem 1.1rem',
};

const headerActionsStyles: React.CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flex: '0 0 auto',
  gap: '0.75rem',
};

const eyebrowStyles: React.CSSProperties = {
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  color: '#5eead4',
  fontSize: '0.75rem',
  fontWeight: 750,
  letterSpacing: 0,
  textTransform: 'uppercase',
};

const titleStyles: React.CSSProperties = {
  fontSize: '1.65rem',
  fontWeight: 760,
  lineHeight: 1.15,
  margin: '0.25rem 0 0',
};

const subtitleStyles: React.CSSProperties = {
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  color: '#aab6c5',
  fontSize: '0.95rem',
  lineHeight: 1.45,
  margin: '0.5rem 0 0',
};

const statusPillStyles: React.CSSProperties = {
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  background: 'rgba(13, 148, 136, 0.16)',
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  border: '1px solid rgba(45, 212, 191, 0.32)',
  borderRadius: 999,
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  color: '#7dd3fc',
  fontSize: '0.8rem',
  fontWeight: 750,
  padding: '0.45rem 0.8rem',
  textTransform: 'capitalize',
};

const mainStyles: React.CSSProperties = {
  display: 'grid',
  flex: 1,
  gap: '0.85rem',
  gridTemplateColumns: 'minmax(320px, 0.85fr) minmax(420px, 1.35fr) minmax(280px, 0.55fr)',
  minHeight: 0,
};

const paneStyles: React.CSSProperties = {
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  background: 'rgba(11, 17, 24, 0.9)',
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  border: '1px solid rgba(148, 163, 184, 0.18)',
  borderRadius: 8,
  overflow: 'hidden',
  minHeight: 0,
  minWidth: 0,
};

const sourcePaneStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

const previewPaneStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

const sideStackStyles: React.CSSProperties = {
  display: 'grid',
  gap: '0.85rem',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  minHeight: 0,
};

const sidePaneStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

const diagnosticsPaneStyles: React.CSSProperties = {
  minHeight: 0,
};

const paneHeaderStyles: React.CSSProperties = {
  alignItems: 'center',
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  background: 'rgba(15, 23, 32, 0.9)',
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
  display: 'flex',
  gap: '0.75rem',
  justifyContent: 'space-between',
  minHeight: 42,
  padding: '0.6rem 0.8rem',
};

const paneTitleStyles: React.CSSProperties = {
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  color: '#d9e2ee',
  fontSize: '0.85rem',
  fontWeight: 750,
  letterSpacing: 0,
  margin: 0,
};

const transportStyles: React.CSSProperties = {
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  color: '#aab6c5',
  fontSize: '0.75rem',
  fontWeight: 700,
};

const editorStyles: React.CSSProperties = {
  flex: 1,
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  background: '#151a1f',
  border: 0,
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  color: '#dbe4ef',
  fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, monospace',
  fontSize: '0.9rem',
  lineHeight: 1.6,
  outline: 0,
  padding: '1rem',
  resize: 'none',
};

const resultStyles: React.CSSProperties = {
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  background: 'rgba(15, 23, 32, 0.82)',
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  borderTop: '1px solid rgba(148, 163, 184, 0.16)',
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  color: '#aab6c5',
  display: 'grid',
  fontSize: '0.82rem',
  gap: '0.25rem',
  minHeight: 58,
  padding: '0.75rem 0.85rem',
};

const resultTitleStyles: React.CSSProperties = {
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example shell has no shared design token layer
  color: '#eef2f7',
};
