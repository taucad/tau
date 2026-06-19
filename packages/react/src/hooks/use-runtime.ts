import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileExtension, Geometry } from '@taucad/types';
import type {
  CapabilitiesManifest,
  ExportResult,
  HashedGeometryResult,
  RuntimeProtocol,
  TransportPlugin,
} from '@taucad/runtime';
import type { RuntimeClientOptionsWithTransport } from '@taucad/runtime/client';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import { createRuntimeClient } from '@taucad/runtime/client';
import type { JSONSchema7 } from '@taucad/json-schema';

type RuntimeTransportPlugin = TransportPlugin<
  RuntimeProtocol,
  Readonly<Record<string, unknown>>,
  string,
  AnyRuntimeDefinition | undefined
>;
type UseRuntimeClientOptions<
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
  Transport extends RuntimeTransportPlugin = RuntimeTransportPlugin,
> = RuntimeClientOptionsWithTransport<Runtime, Transport>;

type SeenReference = Record<PropertyKey, unknown>;
type RuntimeClientHandle = {
  readonly openFile: (input: {
    readonly code: Record<string, string>;
    readonly file: string;
    readonly parameters?: Record<string, unknown>;
  }) => Promise<unknown>;
  readonly exportGeometry: (format: FileExtension, options?: Record<string, unknown>) => Promise<ExportResult>;
  readonly terminate: () => void;
};

/**
 * Status of a transient render operation.
 *
 * @public
 */
export type RuntimeStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * Options for the {@link useRuntime} hook.
 *
 * Callers must provide a stable `clientOptions` reference (via module-level
 * a module-level object or `useMemo`). Changing the reference triggers
 * a new client lifecycle (terminate old, create new).
 *
 * @public
 */
export type UseRuntimeOptions<
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
  Transport extends RuntimeTransportPlugin = RuntimeTransportPlugin,
> = {
  /** Runtime client configuration. The transport owns executable runtime wiring. */
  readonly clientOptions: UseRuntimeClientOptions<Runtime, Transport>;
  /** Filename-to-content map of source code to render. */
  readonly code: Record<string, string>;
  /** Entry point filename. Required when `code` has multiple keys; inferred for single-key maps. */
  readonly file?: string;
  /** Parameters passed to the kernel for parametric models. */
  readonly parameters?: Record<string, unknown>;
  /** When false, defers rendering until set to true. Defaults to true. */
  readonly enabled?: boolean;
};

/**
 * Return value of the {@link useRuntime} hook.
 *
 * @public
 */
export type UseRuntimeResult = {
  /** Rendered geometries (empty until first successful render). */
  readonly geometries: Geometry[];
  /** Current status of the render lifecycle. */
  readonly status: RuntimeStatus;
  /** Error from the most recent render attempt, if any. */
  readonly error: Error | undefined;
  /** Default parameter values extracted from the model. */
  readonly defaultParameters: Record<string, unknown>;
  /** JSON Schema describing the model's parameters. */
  readonly jsonSchema: JSONSchema7 | undefined;
  /** Export the last render result to the specified format. Only available after a successful render. */
  readonly exportGeometry: (format: FileExtension, options?: Record<string, unknown>) => Promise<ExportResult>;
  /** Capabilities manifest from the runtime worker, available after initialization. */
  readonly capabilities: CapabilitiesManifest | undefined;
};

const emptyGeometries: Geometry[] = [];
const emptyParameters: Record<string, unknown> = {};

const stableStringify = (value: unknown, seen = new WeakSet<SeenReference>()): string => {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  const reference = value as SeenReference;
  if (seen.has(reference)) {
    return '"[Circular]"';
  }
  seen.add(reference);

  if (Array.isArray(value)) {
    const result = `[${value.map((item) => stableStringify(item, seen)).join(',')}]`;
    seen.delete(reference);
    return result;
  }

  const record = value as Record<string, unknown>;
  const result = `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key], seen)}`)
    .join(',')}}`;
  seen.delete(reference);
  return result;
};

/**
 * Headless hook for transient, in-memory CAD rendering using the v5
 * event-driven `RuntimeClient` surface.
 *
 * The hook owns the four-step lifecycle on the consumer's behalf:
 *
 * 1. **Construct** — `createRuntimeClient(clientOptions)` on `clientOptions`
 *    change (or first mount).
 * 2. **Connect** — subscribes to `client.on('geometry' | 'error' | 'parametersResolved' | 'capabilities', …)`
 *    and lets the runtime client establish its transport handshake.
 * 3. **Command** — `client.openFile({ code, file, parameters })` is invoked
 *    whenever `code`, `file`, `parameters`, or `enabled` changes. Multiple
 *    rapid changes naturally supersede each other via `RenderOutcome` —
 *    the prior settlement resolves with `{ superseded: true }` and the
 *    latest call's geometry arrives over the `'geometry'` event channel.
 * 4. **Consume** — geometries, status, parameter schema, and capabilities
 *    are exposed as React state, updating reactively as worker events
 *    flow through the event surface.
 *
 * Cleanup terminates the client on unmount. Subscriptions auto-dispose.
 *
 * @param options - Render configuration including code, kernels, and parameters
 * @returns Reactive render state including geometries, status, error, and parameter schema
 * @public
 *
 * @example <caption>Render a CAD model with replicad and esbuild</caption>
 * ```typescript
 * import { useRuntime } from '@taucad/react';
 * import { defineRuntime } from '@taucad/runtime/worker';
 * import { inProcessTransport } from '@taucad/runtime/transport/in-process';
 * import { replicad } from '@taucad/runtime/kernels/replicad';
 * import { esbuild } from '@taucad/runtime/bundler/esbuild';
 *
 * const runtime = defineRuntime({
 *   kernels: [replicad()],
 *   bundlers: [esbuild()],
 * });
 * const transport = inProcessTransport({ runtime });
 *
 * const code = `
 *   import { drawCircle } from 'replicad';
 *   export default () => drawCircle(10).sketchOnPlane().extrude(20);
 * `;
 *
 * const { geometries, status, error } = useRuntime<typeof runtime, typeof transport>({
 *   clientOptions: { transport },
 *   code: { '/main.ts': code },
 *   file: '/main.ts',
 *   parameters: { height: 20 },
 * });
 *
 * if (status === 'success') {
 *   // geometries[0].format === 'gltf' for the default replicad pipeline
 * }
 * ```
 */
export function useRuntime<
  const Runtime extends AnyRuntimeDefinition | undefined = undefined,
  const Transport extends RuntimeTransportPlugin = RuntimeTransportPlugin,
>(options: UseRuntimeOptions<Runtime, Transport>): UseRuntimeResult {
  const { clientOptions, code, file, parameters, enabled = true } = options;
  const renderRequestKey = stableStringify({ code, enabled, file, parameters });

  const [geometries, setGeometries] = useState<Geometry[]>(emptyGeometries);
  const [status, setStatus] = useState<RuntimeStatus>('idle');
  const [error, setError] = useState<Error | undefined>();
  const [defaultParameters, setDefaultParameters] = useState<Record<string, unknown>>(emptyParameters);
  const [jsonSchema, setJsonSchema] = useState<JSONSchema7 | undefined>();

  const [capabilities, setCapabilities] = useState<CapabilitiesManifest | undefined>();
  const clientRef = useRef<RuntimeClientHandle | undefined>(undefined);

  useEffect(() => {
    const client = createRuntimeClient(clientOptions);
    const exportClient = client as {
      export: (format: FileExtension, options?: Record<string, unknown>) => Promise<ExportResult>;
    };
    clientRef.current = {
      openFile: async (input) => {
        await client.openFile(input);
      },
      exportGeometry: async (format, formatOptions) => exportClient.export(format, formatOptions),
      terminate: () => {
        client.terminate();
      },
    };

    const unsubscribers: Array<() => void> = [];

    unsubscribers.push(
      client.on('parametersResolved', (result) => {
        if (result.success) {
          setDefaultParameters(result.data.defaultParameters);
          setJsonSchema(result.data.jsonSchema as JSONSchema7);
        }
      }),
      client.on('capabilities', (manifest) => {
        setCapabilities(manifest as CapabilitiesManifest);
      }),
      client.on('geometry', (result: HashedGeometryResult) => {
        if (result.success) {
          setGeometries(result.data);
          setError(undefined);
          setStatus('success');
        } else {
          const firstIssue = result.issues[0];
          setError(new Error(firstIssue?.message ?? 'Render failed'));
          setStatus('error');
        }
      }),
      client.on('error', (issues) => {
        const firstIssue = issues[0];
        setError(new Error(firstIssue?.message ?? 'Render failed'));
        setStatus('error');
      }),
    );

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
      client.terminate();
      clientRef.current = undefined;
    };
  }, [clientOptions]);

  useEffect(() => {
    const client = clientRef.current;
    if (!client || !enabled) {
      return;
    }

    setStatus('loading');

    const resolvedFile = file ?? Object.keys(code)[0]!;

    // async-iife: bootstrap — openFile from effect; surface errors without blocking render
    void (async (): Promise<void> => {
      try {
        await client.openFile({ code, file: resolvedFile, parameters });
      } catch (error) {
        setError(error instanceof Error ? error : new Error(String(error)));
        setStatus('error');
      }
    })();
  }, [renderRequestKey]);

  const exportGeometry = useCallback(
    async (format: FileExtension, formatOptions?: Record<string, unknown>): Promise<ExportResult> => {
      const client = clientRef.current;
      if (!client) {
        return {
          success: false,
          issues: [{ message: 'Runtime client not initialized', code: 'RUNTIME', severity: 'error' }],
        };
      }
      return client.exportGeometry(format, formatOptions);
    },
    [],
  );

  return { geometries, status, error, defaultParameters, jsonSchema, exportGeometry, capabilities };
}
