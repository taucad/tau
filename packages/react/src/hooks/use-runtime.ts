import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileExtension, Geometry, JSONSchema7 } from '@taucad/runtime/types';
import type {
  CapabilitiesManifest,
  ExportFormatsFor,
  ExportContentFor,
  ExportOptionsFor,
  ExportResult,
  HashedGeometryResult,
  KernelPlugin,
  MiddlewarePlugin,
  RenderOutcome,
  RenderStatus as RuntimeRenderStatus,
  RuntimeFromTransport,
  RuntimeProtocol,
  RuntimeRenderInput,
  RuntimeSource,
  RuntimeSourceFiles,
  TransportPlugin,
  TranscoderPlugin,
  ContentRequestFor,
} from '@taucad/runtime';
import type { RuntimeClientOptionsWithTransport } from '@taucad/runtime/client';
import type {
  AnyRuntimeDefinition,
  RuntimeKernels,
  RuntimeMiddleware,
  RuntimeTranscoders,
} from '@taucad/runtime/worker';
import { createRuntimeClient } from '@taucad/runtime/client';

type RuntimeTransportPlugin = TransportPlugin<
  RuntimeProtocol,
  Readonly<Record<string, unknown>>,
  string,
  AnyRuntimeDefinition | undefined
>;

/**
 * Transport witness accepted by {@link useRuntime} when a caller needs to
 * name hook options that may be backed by any runtime transport.
 *
 * Most consumers never need this type because `useRuntime(...)` infers the
 * transport from `clientOptions`. It is useful for typed wrappers that branch
 * between inline-code and filesystem input while sharing one hook call.
 *
 * @public
 */
export type UseRuntimeTransportPlugin = RuntimeTransportPlugin;

type UseRuntimeClientOptions<
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
  Transport extends RuntimeTransportPlugin = RuntimeTransportPlugin,
> = RuntimeClientOptionsWithTransport<Runtime, Transport>;

type RuntimeDefinitionForHook<
  Runtime extends AnyRuntimeDefinition | undefined,
  Transport extends RuntimeTransportPlugin,
> = Runtime extends AnyRuntimeDefinition
  ? Runtime
  : RuntimeFromTransport<Transport> extends AnyRuntimeDefinition
    ? RuntimeFromTransport<Transport>
    : undefined;

type UseRuntimeKernels<Runtime extends AnyRuntimeDefinition | undefined, Transport extends RuntimeTransportPlugin> =
  RuntimeDefinitionForHook<Runtime, Transport> extends AnyRuntimeDefinition
    ? RuntimeKernels<RuntimeDefinitionForHook<Runtime, Transport>> extends readonly KernelPlugin[]
      ? RuntimeKernels<RuntimeDefinitionForHook<Runtime, Transport>>
      : readonly KernelPlugin[]
    : readonly KernelPlugin[];

type UseRuntimeTranscoders<Runtime extends AnyRuntimeDefinition | undefined, Transport extends RuntimeTransportPlugin> =
  RuntimeDefinitionForHook<Runtime, Transport> extends AnyRuntimeDefinition
    ? RuntimeTranscoders<RuntimeDefinitionForHook<Runtime, Transport>> extends readonly TranscoderPlugin[]
      ? RuntimeTranscoders<RuntimeDefinitionForHook<Runtime, Transport>>
      : readonly TranscoderPlugin[]
    : readonly TranscoderPlugin[];

type UseRuntimeMiddleware<Runtime extends AnyRuntimeDefinition | undefined, Transport extends RuntimeTransportPlugin> =
  RuntimeDefinitionForHook<Runtime, Transport> extends AnyRuntimeDefinition
    ? RuntimeMiddleware<RuntimeDefinitionForHook<Runtime, Transport>> extends readonly MiddlewarePlugin[]
      ? RuntimeMiddleware<RuntimeDefinitionForHook<Runtime, Transport>>
      : readonly MiddlewarePlugin[]
    : readonly MiddlewarePlugin[];

type UseRuntimeCapabilities<
  Runtime extends AnyRuntimeDefinition | undefined,
  Transport extends RuntimeTransportPlugin,
> = CapabilitiesManifest<
  UseRuntimeKernels<Runtime, Transport>,
  UseRuntimeMiddleware<Runtime, Transport>,
  UseRuntimeTranscoders<Runtime, Transport>
>;

/**
 * Export options accepted by {@link UseRuntimeResult.exportGeometry}.
 *
 * React owns `source` and `parameters`, so the hook exposes only the runtime's
 * format-specific export option projection.
 *
 * @public
 */
export type UseRuntimeExportGeometryOptions<
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
  Transport extends RuntimeTransportPlugin = RuntimeTransportPlugin,
  Format extends ExportFormatsFor<UseRuntimeKernels<Runtime, Transport>, UseRuntimeTranscoders<Runtime, Transport>> =
    ExportFormatsFor<UseRuntimeKernels<Runtime, Transport>, UseRuntimeTranscoders<Runtime, Transport>>,
> = {
  readonly exportOptions?: ExportOptionsFor<
    UseRuntimeKernels<Runtime, Transport>,
    UseRuntimeTranscoders<Runtime, Transport>,
    Format
  >;
} & ContentRequestFor<
  ExportContentFor<
    UseRuntimeKernels<Runtime, Transport>,
    UseRuntimeMiddleware<Runtime, Transport>,
    UseRuntimeTranscoders<Runtime, Transport>,
    Format
  >
>;

/**
 * Export helper returned from {@link useRuntime}.
 *
 * @public
 */
export type UseRuntimeExportGeometry<
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
  Transport extends RuntimeTransportPlugin = RuntimeTransportPlugin,
> = <
  const Format extends ExportFormatsFor<
    UseRuntimeKernels<Runtime, Transport>,
    UseRuntimeTranscoders<Runtime, Transport>
  >,
>(
  format: Format,
  options?: UseRuntimeExportGeometryOptions<Runtime, Transport, Format>,
) => Promise<ExportResult>;

/**
 * Stable runtime client options or a stable provider that resolves them.
 *
 * Providers are resolved when their function identity changes. Keep provider
 * functions in module scope or wrap dynamic providers in `useCallback` so the
 * hook does not repeatedly request transports during render churn.
 *
 * @public
 */
export type UseRuntimeClientOptionsProvider<
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
  Transport extends RuntimeTransportPlugin = RuntimeTransportPlugin,
> =
  | UseRuntimeClientOptions<Runtime, Transport>
  | (() => UseRuntimeClientOptions<Runtime, Transport>)
  | (() => Promise<UseRuntimeClientOptions<Runtime, Transport>>);

type SeenReference = Record<PropertyKey, unknown>;
type RuntimeClientExportGeometryInput = {
  readonly source?: unknown;
  readonly parameters?: unknown;
  readonly exportOptions?: unknown;
  readonly content?: unknown;
};
type RuntimeClientHandle = {
  readonly render: (
    input: RuntimeRenderInput<readonly KernelPlugin[], readonly MiddlewarePlugin[]>,
  ) => Promise<RenderOutcome>;
  readonly updateParameters: (parameters: RuntimeParameterRecord) => Promise<RenderOutcome>;
  readonly exportGeometry: (format: FileExtension, options?: RuntimeClientExportGeometryInput) => Promise<ExportResult>;
  readonly terminate: () => void;
};

/**
 * UI-ready render lifecycle mirrored from `@taucad/runtime`.
 *
 * @public
 */
export type RenderStatus = RuntimeRenderStatus;

/**
 * Render parameter record owned by {@link useRuntime}.
 *
 * @public
 */
export type RuntimeParameterRecord = Record<string, unknown>;

/**
 * Setter for the effective render parameters exposed by {@link useRuntime}.
 *
 * @public
 */
export type SetRuntimeParameters = (
  next: RuntimeParameterRecord | ((current: RuntimeParameterRecord) => RuntimeParameterRecord),
) => void;

/**
 * Uncontrolled parameter-state options for {@link useRuntime}.
 *
 * @public
 */
export type UseRuntimeParameterOptions = {
  /** Seed applied over discovered defaults before the user edits. */
  readonly initialParameters?: RuntimeParameterRecord;
  /** Mirrors the effective parameters outward; it does not control state. */
  readonly onParametersChange?: (parameters: RuntimeParameterRecord) => void;
};

/**
 * Options for the {@link useRuntime} hook.
 *
 * Callers must provide a stable `clientOptions` reference. Prefer a module-level
 * object or provider. If the options depend on React state, wrap the provider in
 * `useCallback`. Changing the reference triggers a new client lifecycle
 * (terminate old, create new).
 *
 * @public
 */
export type UseRuntimeOptions<
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
  Transport extends RuntimeTransportPlugin = RuntimeTransportPlugin,
  Files extends RuntimeSourceFiles = RuntimeSourceFiles,
> = UseRuntimeBaseOptions<Runtime, Transport> &
  Omit<
    RuntimeRenderInput<UseRuntimeKernels<Runtime, Transport>, UseRuntimeMiddleware<Runtime, Transport>, Files>,
    'parameters'
  > &
  UseRuntimeParameterOptions;

/**
 * Shared lifecycle options for {@link useRuntime}.
 *
 * @public
 */
export type UseRuntimeBaseOptions<
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
  Transport extends RuntimeTransportPlugin = RuntimeTransportPlugin,
> = {
  /** Runtime client configuration. The transport owns executable runtime wiring. */
  readonly clientOptions: UseRuntimeClientOptionsProvider<Runtime, Transport>;
  /** When false, defers rendering until set to true. Defaults to true. */
  readonly enabled?: boolean;
};

/**
 * Return value of the {@link useRuntime} hook.
 *
 * @public
 */
export type UseRuntimeResult<
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
  Transport extends RuntimeTransportPlugin = RuntimeTransportPlugin,
> = {
  /** Rendered geometry from the latest successful render. */
  readonly geometry: Geometry | undefined;
  /** Current status of the render lifecycle. */
  readonly status: RenderStatus;
  /** Error from the most recent render attempt, if any. */
  readonly error: Error | undefined;
  /** Default parameter values extracted from the model. */
  readonly defaultParameters: RuntimeParameterRecord;
  /** Effective render parameter values sent to runtime. */
  readonly parameters: RuntimeParameterRecord;
  /** Replace effective render parameters. Accepts full values, not a diff. */
  readonly setParameters: SetRuntimeParameters;
  /** Clear user overrides and return to the latest runtime defaults. */
  readonly resetParameters: () => void;
  /** JSON Schema describing the model's parameters. */
  readonly jsonSchema: JSONSchema7 | undefined;
  /** Export the latest settled geometry, or request-scope render the hook source when preview rendering has not settled. */
  readonly exportGeometry: UseRuntimeExportGeometry<Runtime, Transport>;
  /** Capabilities manifest from the runtime worker, available after initialization. */
  readonly capabilities: UseRuntimeCapabilities<Runtime, Transport> | undefined;
};

const emptyParameters: RuntimeParameterRecord = {};

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

const resolveClientOptions = async <
  Runtime extends AnyRuntimeDefinition | undefined,
  Transport extends RuntimeTransportPlugin,
>(
  clientOptions: UseRuntimeClientOptionsProvider<Runtime, Transport>,
): Promise<UseRuntimeClientOptions<Runtime, Transport>> => {
  if (typeof clientOptions === 'function') {
    return clientOptions();
  }
  return clientOptions;
};

const cloneParameterRecord = (parameters: RuntimeParameterRecord | undefined): RuntimeParameterRecord =>
  parameters ? { ...parameters } : emptyParameters;

const mergeParameterRecords = (
  defaults: RuntimeParameterRecord,
  overrides: RuntimeParameterRecord,
): RuntimeParameterRecord =>
  Object.keys(defaults).length === 0 && Object.keys(overrides).length === 0
    ? emptyParameters
    : { ...defaults, ...overrides };

const diffParameterRecords = (
  values: RuntimeParameterRecord,
  defaults: RuntimeParameterRecord,
): RuntimeParameterRecord => {
  const modified: RuntimeParameterRecord = {};
  for (const [key, value] of Object.entries(values)) {
    if (stableStringify(value) !== stableStringify(defaults[key])) {
      modified[key] = value;
    }
  }
  return Object.keys(modified).length === 0 ? emptyParameters : modified;
};

const pruneParameterOverrides = (
  overrides: RuntimeParameterRecord,
  defaults: RuntimeParameterRecord,
): RuntimeParameterRecord => {
  const pruned: RuntimeParameterRecord = {};
  for (const key of Object.keys(defaults)) {
    if (Object.hasOwn(overrides, key)) {
      pruned[key] = overrides[key];
    }
  }
  return Object.keys(pruned).length === 0 ? emptyParameters : pruned;
};

const withRuntimeParameters = <
  Kernels extends readonly KernelPlugin[],
  Middleware extends readonly MiddlewarePlugin[],
  Files extends RuntimeSourceFiles,
>(
  input: Omit<RuntimeRenderInput<Kernels, Middleware, Files>, 'parameters'>,
  parameters: RuntimeParameterRecord,
): RuntimeRenderInput<Kernels, Middleware, Files> =>
  (Object.keys(parameters).length === 0 ? input : { ...input, parameters }) as RuntimeRenderInput<
    Kernels,
    Middleware,
    Files
  >;

const isRuntimeSourceRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getRuntimeSourceInputError = (source: unknown): Error | undefined => {
  if (!isRuntimeSourceRecord(source)) {
    return new Error('Runtime source must be an object with files or path.');
  }

  const hasFiles = 'files' in source;
  const hasPath = 'path' in source;
  if (hasFiles === hasPath) {
    return new Error('Runtime source must provide exactly one of files or path.');
  }

  if (!hasFiles) {
    return undefined;
  }

  const { files } = source;
  if (!isRuntimeSourceRecord(files)) {
    return new Error('Runtime source.files must be a file map.');
  }

  const fileKeys = Object.keys(files);
  if (fileKeys.length === 0) {
    return new Error('Runtime source.files must contain at least one file.');
  }

  const { entry } = source;
  if (entry !== undefined) {
    if (typeof entry !== 'string') {
      return new Error('Runtime source.entry must be a file path string.');
    }
    if (!Object.hasOwn(files, entry)) {
      return new Error(`Runtime source.entry "${entry}" must reference a key in source.files.`);
    }
  } else if (fileKeys.length > 1) {
    return new Error('Runtime source.entry is required when source.files contains multiple files.');
  }

  return undefined;
};

/**
 * Headless hook for transient, in-memory CAD rendering using the v5
 * event-driven `RuntimeClient` surface.
 *
 * The hook owns the four-step lifecycle on the consumer's behalf:
 *
 * 1. **Construct** — resolves `clientOptions` (object, sync provider, or async
 *    provider), then calls `createRuntimeClient(...)` on `clientOptions` identity
 *    change (or first mount).
 * 2. **Connect** — subscribes to `client.on('geometry' | 'error' | 'parametersResolved' | 'capabilities', …)`
 *    and lets the runtime client establish its transport handshake.
 * 3. **Command** — `client.render({ source, parameters, renderOptions })` is invoked
 *    whenever `source`, `parameters`, `renderOptions`, or `enabled` changes. Multiple
 *    rapid changes naturally supersede each other via `RenderOutcome` —
 *    the prior settlement resolves with `{ superseded: true }` when a newer
 *    public command or watched-filesystem preview takes ownership. The selected
 *    preview's geometry arrives over the `'geometry'` event channel.
 * 4. **Consume** — geometry, status, parameter schema, and capabilities
 *    are exposed as React state, updating reactively as worker events
 *    flow through the event surface.
 *
 * Cleanup terminates the client on unmount. Subscriptions auto-dispose.
 *
 * @param options - Render configuration including source, kernels, and parameters
 * @returns Reactive render state including geometry, status, error, and parameter schema
 * @public
 *
 * @example <caption>Render a CAD model with replicad and esbuild</caption>
 * ```typescript
 * import { useRuntime } from '@taucad/react';
 * import { defineRuntime } from '@taucad/runtime';
 * import { fromMemoryFs } from '@taucad/runtime/filesystem';
 * import { inProcessTransport } from '@taucad/runtime/transport/in-process';
 * import { replicad } from '@taucad/replicad';
 * import { esbuild } from '@taucad/esbuild';
 *
 * const runtime = defineRuntime({ plugins: [replicad(), esbuild()] });
 * const transport = inProcessTransport({ runtime, fileSystem: fromMemoryFs() });
 *
 * const code = `
 *   import { drawCircle } from 'replicad';
 *   export default () => drawCircle(10).sketchOnPlane().extrude(20);
 * `;
 *
 * const { geometry, status, error } = useRuntime({
 *   clientOptions: { transport },
 *   source: { files: { 'main.ts': code } },
 *   initialParameters: { height: 20 },
 * });
 *
 * if (status === 'ready') {
 *   // geometry?.format === 'gltf' for the default replicad pipeline
 * }
 * ```
 */
export function useRuntime<
  const Files extends RuntimeSourceFiles,
  const Runtime extends AnyRuntimeDefinition | undefined = undefined,
  const Transport extends RuntimeTransportPlugin = RuntimeTransportPlugin,
>(
  options: UseRuntimeOptions<Runtime, Transport, Files> & { readonly source: RuntimeSource<Files> },
): UseRuntimeResult<Runtime, Transport>;
export function useRuntime<
  const Runtime extends AnyRuntimeDefinition | undefined = undefined,
  const Transport extends RuntimeTransportPlugin = RuntimeTransportPlugin,
  const Files extends RuntimeSourceFiles = RuntimeSourceFiles,
>(options: UseRuntimeOptions<Runtime, Transport, Files>): UseRuntimeResult<Runtime, Transport>;
/**
 * Runtime hook implementation shared by inline source and filesystem source.
 *
 * @param options - Runtime hook options.
 * @returns Reactive runtime state.
 * @public
 */
export function useRuntime<
  const Runtime extends AnyRuntimeDefinition | undefined = undefined,
  const Transport extends RuntimeTransportPlugin = RuntimeTransportPlugin,
  const Files extends RuntimeSourceFiles = RuntimeSourceFiles,
>(options: UseRuntimeOptions<Runtime, Transport, Files>): UseRuntimeResult<Runtime, Transport> {
  const {
    clientOptions,
    enabled = true,
    initialParameters,
    onParametersChange,
    ...renderInputWithLegacyParameters
  } = options as UseRuntimeOptions<Runtime, Transport, Files> & { readonly parameters?: unknown };
  const { parameters: legacyParameters, ...renderInput } = renderInputWithLegacyParameters;
  const hasLegacyParameters = legacyParameters !== undefined;
  const runtimeRenderInput = renderInput as Omit<
    RuntimeRenderInput<UseRuntimeKernels<Runtime, Transport>, UseRuntimeMiddleware<Runtime, Transport>, Files>,
    'parameters'
  >;
  const renderRequestKey = stableStringify(runtimeRenderInput);

  const [geometry, setGeometry] = useState<Geometry | undefined>();
  const [status, setStatus] = useState<RenderStatus>('idle');
  const [error, setError] = useState<Error | undefined>();
  const [defaultParameters, setDefaultParameters] = useState<RuntimeParameterRecord>(emptyParameters);
  const [parameterEdits, setParameterEdits] = useState<RuntimeParameterRecord>(() =>
    cloneParameterRecord(initialParameters),
  );
  const [jsonSchema, setJsonSchema] = useState<JSONSchema7 | undefined>();
  const parameters = mergeParameterRecords(defaultParameters, parameterEdits);
  const parameterRequestKey = stableStringify(parameters);
  const commandRequestKey = `${renderRequestKey}:${parameterRequestKey}`;

  const [capabilities, setCapabilities] = useState<UseRuntimeCapabilities<Runtime, Transport> | undefined>();
  const [clientGeneration, setClientGeneration] = useState(0);
  const clientRef = useRef<RuntimeClientHandle | undefined>(undefined);
  const renderInputRef = useRef<
    RuntimeRenderInput<UseRuntimeKernels<Runtime, Transport>, UseRuntimeMiddleware<Runtime, Transport>, Files>
  >(withRuntimeParameters(runtimeRenderInput, parameters));
  const commandRequestKeyRef = useRef(commandRequestKey);
  const settledCommandRequestKeyRef = useRef<string | undefined>(undefined);
  const activeRenderRequestKeyRef = useRef<string | undefined>(undefined);
  const defaultParametersRef = useRef(defaultParameters);
  const onParametersChangeRef = useRef(onParametersChange);
  const hasMountedParameterNotificationRef = useRef(false);
  defaultParametersRef.current = defaultParameters;
  onParametersChangeRef.current = onParametersChange;
  renderInputRef.current = withRuntimeParameters(runtimeRenderInput, parameters);
  commandRequestKeyRef.current = commandRequestKey;

  const setParameters = useCallback<SetRuntimeParameters>((next) => {
    setParameterEdits((currentEdits) => {
      const currentParameters = mergeParameterRecords(defaultParametersRef.current, currentEdits);
      const nextParameters = typeof next === 'function' ? next(currentParameters) : next;
      return diffParameterRecords(nextParameters, defaultParametersRef.current);
    });
  }, []);

  const resetParameters = useCallback(() => {
    setParameterEdits(emptyParameters);
  }, []);

  useEffect(() => {
    if (!hasMountedParameterNotificationRef.current) {
      hasMountedParameterNotificationRef.current = true;
      return;
    }
    onParametersChangeRef.current?.(parameters);
  }, [parameterRequestKey]);

  useEffect(() => {
    let cancelled = false;
    let cleanupClient: (() => void) | undefined;
    clientRef.current = undefined;
    settledCommandRequestKeyRef.current = undefined;
    activeRenderRequestKeyRef.current = undefined;

    // async-iife: bootstrap — resolve stable client options from a React effect
    void (async (): Promise<void> => {
      try {
        const resolvedClientOptions = await resolveClientOptions(clientOptions);
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup may flip this while async config resolves
        if (cancelled) {
          return;
        }

        const client = createRuntimeClient(resolvedClientOptions);
        const exportClient = client as {
          export: (format: FileExtension, options?: RuntimeClientExportGeometryInput) => Promise<ExportResult>;
        };
        const renderClient = client as {
          render: (
            input: RuntimeRenderInput<readonly KernelPlugin[], readonly MiddlewarePlugin[]>,
          ) => Promise<RenderOutcome>;
          updateParameters: (parameters: RuntimeParameterRecord) => Promise<RenderOutcome>;
        };

        const unsubscribers: Array<() => void> = [];
        const handle: RuntimeClientHandle = {
          render: async (input) => renderClient.render(input),
          updateParameters: async (parameters) => renderClient.updateParameters(parameters),
          exportGeometry: async (format, formatOptions) => exportClient.export(format, formatOptions),
          terminate: () => {
            client.terminate();
          },
        };

        const dispose = (): void => {
          for (const unsub of unsubscribers) {
            unsub();
          }
          client.terminate();
          if (clientRef.current === handle) {
            clientRef.current = undefined;
          }
        };
        cleanupClient = dispose;

        unsubscribers.push(
          client.on('renderStatus', (nextStatus) => {
            if (cancelled) {
              return;
            }
            setStatus(nextStatus);
          }),
          client.on('parametersResolved', (result) => {
            if (cancelled) {
              return;
            }
            if (result.success) {
              const nextDefaults = cloneParameterRecord(result.data.defaultParameters);
              setDefaultParameters(nextDefaults);
              setParameterEdits((current) => pruneParameterOverrides(current, nextDefaults));
              setJsonSchema(result.data.jsonSchema);
            }
          }),
          client.on('capabilities', (manifest) => {
            if (cancelled) {
              return;
            }
            setCapabilities(manifest as UseRuntimeCapabilities<Runtime, Transport>);
          }),
          client.on('geometry', (result: HashedGeometryResult) => {
            if (cancelled) {
              return;
            }
            if (result.success) {
              settledCommandRequestKeyRef.current = commandRequestKeyRef.current;
              setGeometry(result.data);
              setError(undefined);
            } else {
              const firstIssue = result.issues[0];
              settledCommandRequestKeyRef.current = undefined;
              setGeometry(undefined);
              setError(new Error(firstIssue?.message ?? 'Render failed'));
            }
          }),
          client.on('error', (issues) => {
            if (cancelled) {
              return;
            }
            const firstIssue = issues[0];
            settledCommandRequestKeyRef.current = undefined;
            setGeometry(undefined);
            setError(new Error(firstIssue?.message ?? 'Render failed'));
          }),
        );

        // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup may run after subscriptions are installed
        if (cancelled) {
          dispose();
          return;
        }

        setError(undefined);
        setStatus(client.renderStatus);
        clientRef.current = handle;
        setClientGeneration((value) => value + 1);
      } catch (error) {
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup may run before an async provider rejects
        if (cancelled) {
          return;
        }
        setError(error instanceof Error ? error : new Error(String(error)));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      cleanupClient?.();
    };
  }, [clientOptions]);

  useEffect(() => {
    const client = clientRef.current;
    if (!client || !enabled) {
      return;
    }

    // async-iife: bootstrap — render from effect; surface errors without blocking render
    void (async (): Promise<void> => {
      try {
        if (hasLegacyParameters) {
          throw new Error('useRuntime parameters input was removed; use initialParameters or setParameters.');
        }
        const sourceError = getRuntimeSourceInputError(runtimeRenderInput.source);
        if (sourceError) {
          throw sourceError;
        }
        const shouldUpdateParameters = activeRenderRequestKeyRef.current === renderRequestKey;
        if (!shouldUpdateParameters) {
          activeRenderRequestKeyRef.current = renderRequestKey;
        }
        const outcome = shouldUpdateParameters
          ? await client.updateParameters(parameters)
          : await client.render(
              renderInputRef.current as unknown as RuntimeRenderInput<
                readonly KernelPlugin[],
                readonly MiddlewarePlugin[]
              >,
            );
        if (!outcome.superseded && outcome.geometry.success) {
          settledCommandRequestKeyRef.current = commandRequestKey;
        }
      } catch (error) {
        if (activeRenderRequestKeyRef.current === renderRequestKey) {
          activeRenderRequestKeyRef.current = undefined;
        }
        settledCommandRequestKeyRef.current = undefined;
        setError(error instanceof Error ? error : new Error(String(error)));
        setStatus('error');
      }
    })();
  }, [clientGeneration, commandRequestKey, enabled, hasLegacyParameters, parameterRequestKey, renderRequestKey]);

  const exportGeometry = useCallback<UseRuntimeExportGeometry<Runtime, Transport>>(async (format, formatOptions) => {
    const client = clientRef.current;
    if (!client) {
      return {
        success: false,
        issues: [{ message: 'Runtime client not initialized', code: 'RUNTIME', severity: 'error' }],
      };
    }
    const hasSettledCurrentRender = settledCommandRequestKeyRef.current === commandRequestKeyRef.current;
    if (!hasSettledCurrentRender) {
      const sourceError = getRuntimeSourceInputError(renderInputRef.current.source);
      if (sourceError) {
        return {
          success: false,
          issues: [{ message: sourceError.message, code: 'RUNTIME', severity: 'error' }],
        };
      }
    }
    const exportInput = hasSettledCurrentRender
      ? formatOptions
      : {
          source: renderInputRef.current.source,
          ...(renderInputRef.current.parameters ? { parameters: renderInputRef.current.parameters } : {}),
          ...(formatOptions as RuntimeClientExportGeometryInput | undefined),
        };
    return client.exportGeometry(format as FileExtension, exportInput);
  }, []);

  return {
    geometry,
    status,
    error,
    defaultParameters,
    parameters,
    setParameters,
    resetParameters,
    jsonSchema,
    exportGeometry,
    capabilities,
  };
}
