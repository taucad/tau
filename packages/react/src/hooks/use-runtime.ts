import { useCallback, useEffect, useRef, useState } from 'react';
import { createRuntimeClient } from '@taucad/runtime/client';
import type {
  Artifact,
  CapabilitiesManifest,
  DocumentViewRequest,
  DocumentStatus,
  ExportResult,
  KernelPlugin,
  MiddlewarePlugin,
  RuntimeDocument,
  RuntimeDocumentProtocol,
  OpenInput,
  Rendering,
  RuntimeFromTransport,
  RuntimeSource,
  RuntimeSourceFiles,
  TranscoderPlugin,
  TransportPlugin,
} from '@taucad/runtime';
import type { RuntimeClientOptionsWithTransport } from '@taucad/runtime/client';
import type {
  AnyRuntimeDefinition,
  RuntimeKernels,
  RuntimeMiddleware,
  RuntimeTranscoders,
} from '@taucad/runtime/worker';
import type { JSONSchema7 } from '@taucad/runtime/types';
import type { ParameterManifest } from '@taucad/parameters';

type AnyTransport = TransportPlugin<
  RuntimeDocumentProtocol,
  Readonly<Record<string, unknown>>,
  string,
  AnyRuntimeDefinition | undefined
>;
/** A transport accepted by the runtime hook's typed wrappers. @public */
export type UseRuntimeTransportPlugin = AnyTransport;
type RuntimeFor<
  Runtime extends AnyRuntimeDefinition | undefined,
  Transport extends AnyTransport,
> = Runtime extends AnyRuntimeDefinition ? Runtime : RuntimeFromTransport<Transport>;
type KernelsFor<Runtime extends AnyRuntimeDefinition | undefined, Transport extends AnyTransport> =
  RuntimeKernels<RuntimeFor<Runtime, Transport>> extends readonly KernelPlugin[]
    ? RuntimeKernels<RuntimeFor<Runtime, Transport>>
    : readonly KernelPlugin[];
type MiddlewareFor<Runtime extends AnyRuntimeDefinition | undefined, Transport extends AnyTransport> =
  RuntimeMiddleware<RuntimeFor<Runtime, Transport>> extends readonly MiddlewarePlugin[]
    ? RuntimeMiddleware<RuntimeFor<Runtime, Transport>>
    : readonly MiddlewarePlugin[];
type TranscodersFor<Runtime extends AnyRuntimeDefinition | undefined, Transport extends AnyTransport> =
  RuntimeTranscoders<RuntimeFor<Runtime, Transport>> extends readonly TranscoderPlugin[]
    ? RuntimeTranscoders<RuntimeFor<Runtime, Transport>>
    : readonly TranscoderPlugin[];
type DocumentFor<Runtime extends AnyRuntimeDefinition | undefined, Transport extends AnyTransport> = RuntimeDocument<
  KernelsFor<Runtime, Transport>,
  MiddlewareFor<Runtime, Transport>,
  TranscodersFor<Runtime, Transport>
>;
type CapabilitiesFor<
  Runtime extends AnyRuntimeDefinition | undefined,
  Transport extends AnyTransport,
> = CapabilitiesManifest<
  KernelsFor<Runtime, Transport>,
  MiddlewareFor<Runtime, Transport>,
  TranscodersFor<Runtime, Transport>
>;
type ClientOptions<
  Runtime extends AnyRuntimeDefinition | undefined,
  Transport extends AnyTransport,
> = RuntimeClientOptionsWithTransport<Runtime, Transport>;

/** Stable client options or a stable synchronous/asynchronous provider. @public */
export type UseRuntimeClientOptionsProvider<
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
  Transport extends AnyTransport = AnyTransport,
> =
  | ClientOptions<Runtime, Transport>
  | (() => ClientOptions<Runtime, Transport>)
  | (() => Promise<ClientOptions<Runtime, Transport>>);

/** Hook-owned parameter values. @public */
export type RuntimeParameterRecord = Record<string, unknown>;
/** Replace effective parameters, or derive them from the current values. @public */
export type SetRuntimeParameters = (
  next: RuntimeParameterRecord | ((current: RuntimeParameterRecord) => RuntimeParameterRecord),
) => void;
/** Uncontrolled parameter state. @public */
export type UseRuntimeParameterOptions = {
  readonly initialParameters?: RuntimeParameterRecord;
  readonly onParametersChange?: (parameters: RuntimeParameterRecord) => void;
};
/** The selected view and its typed request. @public */
export type UseRuntimeView<
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
  Transport extends AnyTransport = AnyTransport,
> = {
  [Id in Parameters<DocumentFor<Runtime, Transport>['view']>[0] & string]: { readonly id: Id } & DocumentViewRequest<
    KernelsFor<Runtime, Transport>,
    MiddlewareFor<Runtime, Transport>,
    Id
  >;
}[Parameters<DocumentFor<Runtime, Transport>['view']>[0] & string];

/** One watched source and one selected view. @public */
export type UseRuntimeOptions<
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
  Transport extends AnyTransport = AnyTransport,
  Files extends RuntimeSourceFiles = RuntimeSourceFiles,
> = Omit<OpenInput<Files, KernelsFor<Runtime, Transport>>, 'source' | 'parameters' | 'stage' | 'watch' | 'signal'> & {
  readonly clientOptions: UseRuntimeClientOptionsProvider<Runtime, Transport>;
  readonly source: RuntimeSource<Files>;
  readonly enabled?: boolean;
  readonly view?: UseRuntimeView<Runtime, Transport>;
} & UseRuntimeParameterOptions;

/** Export from this hook's committed document. @public */
export type UseRuntimeExportModel<
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
  Transport extends AnyTransport = AnyTransport,
> = DocumentFor<Runtime, Transport>['export'];

/** Current document, selected view, parameter state and committed export. @public */
export type UseRuntimeResult<
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
  Transport extends AnyTransport = AnyTransport,
> = {
  readonly artifact: Artifact | undefined;
  /** Hash of the retained successful rendering, including while its artifact is stale. */
  readonly artifactHash: string | undefined;
  readonly artifactStatus: 'empty' | 'current' | 'stale';
  readonly status: DocumentStatus;
  readonly error: Error | undefined;
  readonly defaultParameters: RuntimeParameterRecord;
  readonly parameters: RuntimeParameterRecord;
  readonly setParameters: SetRuntimeParameters;
  readonly resetParameters: () => void;
  readonly jsonSchema: JSONSchema7 | undefined;
  readonly parameterManifest: ParameterManifest | undefined;
  readonly exportModel: UseRuntimeExportModel<Runtime, Transport>;
  readonly capabilities: CapabilitiesFor<Runtime, Transport> | undefined;
};

const emptyParameters: RuntimeParameterRecord = {};
type SeenReference = Record<PropertyKey, unknown>;
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
const cloneParameters = (value: RuntimeParameterRecord | undefined): RuntimeParameterRecord =>
  value ? { ...value } : emptyParameters;
const mergeParameters = (defaults: RuntimeParameterRecord, edits: RuntimeParameterRecord): RuntimeParameterRecord =>
  Object.keys(defaults).length > 0 || Object.keys(edits).length > 0 ? { ...defaults, ...edits } : emptyParameters;
const diffParameters = (values: RuntimeParameterRecord, defaults: RuntimeParameterRecord): RuntimeParameterRecord => {
  const edits: RuntimeParameterRecord = {};
  for (const [key, value] of Object.entries(values)) {
    if (stableStringify(value) !== stableStringify(defaults[key])) {
      edits[key] = value;
    }
  }
  return Object.keys(edits).length > 0 ? edits : emptyParameters;
};
const pruneEdits = (edits: RuntimeParameterRecord, defaults: RuntimeParameterRecord): RuntimeParameterRecord => {
  const result: RuntimeParameterRecord = {};
  for (const key of Object.keys(defaults)) {
    if (Object.hasOwn(edits, key)) {
      result[key] = edits[key];
    }
  }
  return Object.keys(result).length > 0 ? result : emptyParameters;
};
const issueError = (issues: ReadonlyArray<{ message: string }>, fallback: string): Error =>
  new Error(issues[0]?.message ?? fallback);

/**
 * Watch one document and render its default or selected view.
 * @param options - Source, transport, view, and parameter options.
 * @returns Reactive document and selected view state.
 * @public
 */
export function useRuntime<
  const Files extends RuntimeSourceFiles,
  const Runtime extends AnyRuntimeDefinition | undefined = undefined,
  const Transport extends AnyTransport = AnyTransport,
>(options: UseRuntimeOptions<Runtime, Transport, Files>): UseRuntimeResult<Runtime, Transport>;
/**
 * Runtime hook implementation.
 * @param options - Source, transport, view, and parameter options.
 * @returns Reactive document and selected view state.
 * @public
 */
export function useRuntime<
  const Runtime extends AnyRuntimeDefinition | undefined = undefined,
  const Transport extends AnyTransport = AnyTransport,
  const Files extends RuntimeSourceFiles = RuntimeSourceFiles,
>(options: UseRuntimeOptions<Runtime, Transport, Files>): UseRuntimeResult<Runtime, Transport> {
  const {
    clientOptions,
    source,
    enabled = true,
    view,
    evaluateOptions,
    initialParameters,
    onParametersChange,
  } = options;
  const sourceKey = stableStringify(source);
  const viewKey = stableStringify(view);
  const evaluateKey = stableStringify(evaluateOptions);
  const [lastRendering, setLastRendering] = useState<Extract<Rendering, { success: true }> | undefined>();
  const artifact = lastRendering?.artifact;
  const artifactHash = lastRendering?.hash;
  const [settledKey, setSettledKey] = useState<string>();
  const [status, setStatus] = useState<DocumentStatus>('closed');
  const [error, setError] = useState<Error | undefined>();
  const [parameterManifest, setParameterManifest] = useState<ParameterManifest | undefined>();
  const [capabilities, setCapabilities] = useState<CapabilitiesFor<Runtime, Transport> | undefined>();
  const [parameterEdits, setParameterEdits] = useState<RuntimeParameterRecord>(() =>
    cloneParameters(initialParameters),
  );
  const defaults = cloneParameters(parameterManifest?.defaults);
  const parameters = mergeParameters(defaults, parameterEdits);
  const parametersKey = stableStringify(parameters);
  const evaluationKey = `${sourceKey}:${evaluateKey}:${parametersKey}`;
  const requestKey = `${evaluationKey}:${viewKey}`;
  const artifactStatus = artifact === undefined ? 'empty' : settledKey === requestKey ? 'current' : 'stale';
  const [clientGeneration, setClientGeneration] = useState(0);
  const [documentGeneration, setDocumentGeneration] = useState(0);
  const clientRef = useRef<{ open: () => RuntimeDocument; terminate: () => void } | undefined>(undefined);
  const documentRef = useRef<RuntimeDocument | undefined>(undefined);
  const defaultsRef = useRef(defaults);
  const parametersRef = useRef(parameters);
  const sourceRef = useRef(source);
  const evaluateOptionsRef = useRef(evaluateOptions);
  const evaluationKeyRef = useRef(evaluationKey);
  const operationKeyRef = useRef(evaluationKey);
  const evaluationKeysRef = useRef(new Map<string, string>());
  const viewErrorRef = useRef(false);
  const lastUpdateRef = useRef<string | undefined>(undefined);
  const onChangeRef = useRef(onParametersChange);
  const notifiedRef = useRef(false);
  defaultsRef.current = defaults;
  parametersRef.current = parameters;
  sourceRef.current = source;
  evaluateOptionsRef.current = evaluateOptions;
  evaluationKeyRef.current = evaluationKey;
  onChangeRef.current = onParametersChange;

  const setParameters = useCallback<SetRuntimeParameters>((next) => {
    setParameterEdits((edits) => {
      const current = mergeParameters(defaultsRef.current, edits);
      return diffParameters(typeof next === 'function' ? next(current) : next, defaultsRef.current);
    });
  }, []);
  const resetParameters = useCallback(() => {
    setParameterEdits(emptyParameters);
  }, []);
  useEffect(() => {
    if (!notifiedRef.current) {
      notifiedRef.current = true;
      return;
    }
    onChangeRef.current?.(parameters);
  }, [parametersKey]);

  useEffect(() => {
    let cancelled = false;
    let active: { open: () => RuntimeDocument; terminate: () => void } | undefined;
    clientRef.current = undefined;
    setCapabilities(undefined);
    setSettledKey(undefined);
    // async-iife: bootstrap — resolve an optional asynchronous transport provider in the effect.
    void (async () => {
      try {
        const resolved = typeof clientOptions === 'function' ? await clientOptions() : clientOptions;
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup can run while an async provider settles.
        if (cancelled) {
          return;
        }
        const client = createRuntimeClient(resolved);
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup can run during client creation.
        if (cancelled) {
          client.terminate();
          return;
        }
        const unsubscribeCapabilities = client.on('capabilities', (manifest) => {
          if (!cancelled) {
            setCapabilities(manifest as CapabilitiesFor<Runtime, Transport>);
          }
        });
        active = {
          open: () =>
            client.open({
              source: sourceRef.current,
              parameters: parametersRef.current,
              ...(evaluateOptionsRef.current === undefined ? {} : { evaluateOptions: evaluateOptionsRef.current }),
              watch: true,
            } as Parameters<typeof client.open>[0]),
          terminate: () => {
            unsubscribeCapabilities();
            client.terminate();
          },
        };
        clientRef.current = active;
        setClientGeneration((generation) => generation + 1);
      } catch (error) {
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup can run while an async provider rejects.
        if (cancelled) {
          return;
        }
        setError(error instanceof Error ? error : new Error(String(error)));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      documentRef.current?.close();
      documentRef.current = undefined;
      if (clientRef.current === active) {
        clientRef.current = undefined;
      }
      active?.terminate();
    };
  }, [clientOptions]);

  useEffect(() => {
    const client = clientRef.current;
    if (!client || !enabled) {
      documentRef.current?.close();
      documentRef.current = undefined;
      setStatus('closed');
      return;
    }
    let cancelled = false;
    let document: RuntimeDocument;
    try {
      document = client.open();
    } catch (error) {
      setError(error instanceof Error ? error : new Error(String(error)));
      setStatus('error');
      return;
    }
    documentRef.current = document;
    evaluationKeysRef.current.clear();
    operationKeyRef.current = evaluationKeyRef.current;
    lastUpdateRef.current = evaluationKeyRef.current;
    setSettledKey(undefined);
    setParameterManifest(undefined);
    setError(undefined);
    setStatus('evaluating');
    const unsubs = [
      document.on('status', (next) => {
        if (!cancelled) {
          setStatus(next === 'ready' && viewErrorRef.current ? 'error' : next);
          if (next === 'evaluating') {
            setSettledKey(undefined);
          }
        }
      }),
      document.on('described', (description) => {
        if (cancelled || !description.success) {
          return;
        }
        const nextDefaults = cloneParameters(description.parameters.defaults);
        setParameterManifest(description.parameters);
        setParameterEdits((edits) => pruneEdits(edits, nextDefaults));
      }),
      document.on('evaluated', (evaluation) => {
        if (cancelled) {
          return;
        }
        if (evaluation.success) {
          evaluationKeysRef.current.clear();
          evaluationKeysRef.current.set(evaluation.id, operationKeyRef.current);
          setError(undefined);
        } else {
          setSettledKey(undefined);
          setError(issueError(evaluation.issues, 'Evaluation failed'));
        }
      }),
    ];
    setDocumentGeneration((generation) => generation + 1);
    return () => {
      cancelled = true;
      for (const unsub of unsubs) {
        unsub();
      }
      if (documentRef.current === document) {
        documentRef.current = undefined;
        document.close();
      }
    };
  }, [clientGeneration, enabled, sourceKey]);

  useEffect(() => {
    const document = documentRef.current;
    if (!document || !enabled) {
      return;
    }
    let cancelled = false;
    viewErrorRef.current = false;
    const { id, ...request } = view ?? { id: undefined };
    const subscription = id === undefined ? document.view() : document.view(id, request);
    const unsubscribe = subscription.on('rendered', (rendering) => {
      if (cancelled) {
        return;
      }
      if (rendering.success) {
        const key = evaluationKeysRef.current.get(rendering.evaluationId);
        if (key === undefined) {
          return;
        }
        setLastRendering(rendering);
        setSettledKey(`${key}:${viewKey}`);
        setError(undefined);
        viewErrorRef.current = false;
        setStatus('ready');
      } else {
        setSettledKey(undefined);
        setError(issueError(rendering.issues, 'View rendering failed'));
        viewErrorRef.current = true;
        setStatus('error');
      }
    });
    const unsubscribeStatus = subscription.on('status', (next) => {
      if (cancelled) {
        return;
      }
      if (next === 'rendering') {
        setSettledKey(undefined);
      } else if (next === 'error') {
        setSettledKey(undefined);
        viewErrorRef.current = true;
        setStatus('error');
        setError((current) => current ?? new Error('View rendering failed'));
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeStatus();
      subscription.close();
    };
  }, [documentGeneration, enabled, viewKey]);

  useEffect(() => {
    const document = documentRef.current;
    if (!document || !enabled) {
      return;
    }
    if (lastUpdateRef.current === evaluationKey) {
      return;
    }
    lastUpdateRef.current = evaluationKey;
    operationKeyRef.current = evaluationKey;
    let cancelled = false;
    // async-iife: bootstrap — update the watched document after committed parameters or evaluation options change.
    void (async () => {
      try {
        const outcome = await document.update({
          parameters,
          ...(evaluateOptions === undefined ? {} : { evaluateOptions }),
        });
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup can run during an update.
        if (cancelled || outcome.superseded) {
          return;
        }
        if (!outcome.evaluation.success) {
          setSettledKey(undefined);
          setError(issueError(outcome.evaluation.issues, 'Evaluation failed'));
        }
      } catch (error) {
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup can run during an update.
        if (cancelled) {
          return;
        }
        setSettledKey(undefined);
        setError(error instanceof Error ? error : new Error(String(error)));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentGeneration, enabled, evaluationKey]);

  const exportModel = useCallback(async (target: string, request?: { signal?: AbortSignal }): Promise<ExportResult> => {
    const document = documentRef.current;
    if (!document) {
      throw new Error('Runtime document is not open');
    }
    return document.export(target, request);
  }, []) as UseRuntimeExportModel<Runtime, Transport>;

  return {
    artifact,
    artifactHash,
    artifactStatus,
    status,
    error,
    defaultParameters: defaults,
    parameters,
    setParameters,
    resetParameters,
    jsonSchema:
      parameterManifest?.legacyProjection.status === 'usable' ? parameterManifest.legacyProjection.schema : undefined,
    parameterManifest,
    exportModel,
    capabilities,
  };
}
