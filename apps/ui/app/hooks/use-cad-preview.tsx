import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useCallback, useId, useRef } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import type { Artifact } from '@taucad/runtime';
import type { JSONSchema7 } from '@taucad/json-schema';
import type { ParameterManifest } from '@taucad/parameters';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import type { MachineActors } from '#lib/xstate.lib.js';
import { cadMachine, disposeCadRuntime, selectCadFailureIssues } from '#machines/cad.machine.js';
import { cadPreviewMachine } from '#machines/cad-preview.machine.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { joinPath } from '@taucad/utils/path';
import { defaultGraphicsSettings } from '#constants/editor.constants.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';
import { ephemeralKernelOptions, ephemeralPreviewStage } from '#constants/ephemeral-kernel-options.js';
import { useProjectKernelOptions } from '#hooks/use-project-kernel-options.js';
import { nativeKernelRequirementForEntryPath } from '#constants/available-kernel-configurations.js';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';

/**
 * Status of the CAD preview.
 */
export type CadPreviewStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Context value exposed by CadPreviewProvider via the useCadPreview() hook.
 */
export type CadPreviewContextValue = {
  readonly artifact: Artifact | undefined;
  readonly artifactHash: string | undefined;
  readonly status: CadPreviewStatus;
  readonly error: Error | undefined;
  readonly cadRef: ActorRefFrom<typeof cadMachine>;
  readonly graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  readonly defaultParameters: Record<string, unknown>;
  readonly jsonSchema: JSONSchema7 | undefined;
  readonly parameterManifest: ParameterManifest | undefined;
  /** Values this preview last sent to the kernel; a change is a viewer interaction. */
  readonly parameters: Record<string, unknown>;
  readonly setParameters: (parameters: Record<string, unknown>) => void;
};

const CadPreviewContext = createContext<CadPreviewContextValue | undefined>(undefined);

/**
 * Props for CadPreviewProvider.
 */
export type CadPreviewProviderProps = {
  readonly projectId: string;
  readonly mainFile: string;
  /** When provided, files are written to the filesystem before kernel init. Omit for dynamic projects where files already exist. */
  readonly files?: Record<string, { content: Uint8Array<ArrayBuffer> }>;
  readonly parameters?: Record<string, unknown>;
  /** Whether the rendering should be triggered (default: true) */
  readonly isEnabled?: boolean;
  readonly kernelOptionsFactory?: LazyKernelOptionsFactory;
  readonly children: ReactNode;
};

function deriveStatus(cadState: string): CadPreviewStatus {
  switch (cadState) {
    case 'idle': {
      return 'ready';
    }

    case 'buffering':
    case 'rendering':
    case 'connecting': {
      return 'loading';
    }

    case 'error': {
      return 'error';
    }

    default: {
      return 'idle';
    }
  }
}

/**
 * Combines CAD machine phase and initialization errors into the preview status
 * exposed by {@link useCadPreview}.
 */
export const deriveCadPreviewStatus = (args: {
  readonly initError: Error | undefined;
  readonly cadState: string;
  /** The latest render settled as a failure and no frame exists to keep showing. */
  readonly renderingFailed?: boolean;
}): CadPreviewStatus => {
  if (args.initError) {
    return 'error';
  }

  const status = deriveStatus(args.cadState);
  /* A kernel result with `success: false` settles the worker to `idle`, not
   * `error`, so a failed *first* render would otherwise display as an
   * eternal loader. A failure after a successful frame keeps the stale
   * frame (geometryFailed is false then). */
  if (args.renderingFailed === true && (status === 'ready' || status === 'idle')) {
    return 'error';
  }
  return status;
};

/**
 * Provider that creates a lightweight CAD rendering pipeline (cadMachine + graphicsMachine),
 * optionally writes files to the filesystem, and exposes all rendering state via the useCadPreview() hook.
 *
 * Replaces the heavyweight ProjectProvider for preview-only contexts.
 * Uses cadPreviewMachine to orchestrate file preparation and kernel initialization,
 * following the same invoke+fromSafeAsync pattern as projectMachine.
 *
 * When `files` is supplied, each provider instance owns a distinct ephemeral
 * `/previews/<instance>` memory root. Preview setup and teardown therefore
 * cannot replace a persistent `/projects/<projectId>` route. When `files` is
 * omitted, the CAD machine reads the existing persistent project route.
 *
 * @example <caption>Simple thumbnail (isolated ephemeral mount)</caption>
 * ```tsx
 * <CadPreviewProvider projectId="my-project" mainFile="main.ts" files={files}>
 *   <CadPreviewViewer className="size-full" />
 * </CadPreviewProvider>
 * ```
 *
 * @example <caption>Dynamic project (files already in the filesystem)</caption>
 * ```tsx
 * <CadPreviewProvider projectId={existingProjectId} mainFile="main.ts">
 *   <CadPreviewViewer enablePan enableZoom />
 * </CadPreviewProvider>
 * ```
 */
type CadPreviewPipelineProps = Omit<CadPreviewProviderProps, 'kernelOptionsFactory'> & {
  readonly kernelOptionsFactory: LazyKernelOptionsFactory;
};

function PersistentCadPreviewProvider(props: Omit<CadPreviewProviderProps, 'files'>): React.JSX.Element {
  const requirement = nativeKernelRequirementForEntryPath(props.mainFile);
  const selection = useProjectKernelOptions({
    projectId: props.projectId,
    nativeKernelId: requirement?.runtimeKernelId,
  });

  return (
    <CadPreviewPipeline
      key={`${props.projectId}:${props.mainFile}:${selection.key}`}
      {...props}
      kernelOptionsFactory={selection.kernelOptionsFactory}
    />
  );
}

export function CadPreviewProvider(props: CadPreviewProviderProps): React.JSX.Element {
  if (props.kernelOptionsFactory) {
    return <CadPreviewPipeline {...props} kernelOptionsFactory={props.kernelOptionsFactory} />;
  }
  if (props.files !== undefined) {
    return <CadPreviewPipeline {...props} kernelOptionsFactory={ephemeralKernelOptions} />;
  }
  return <PersistentCadPreviewProvider {...props} />;
}

function CadPreviewPipeline({
  projectId,
  mainFile,
  files,
  parameters,
  isEnabled = true,
  kernelOptionsFactory,
  children,
}: CadPreviewPipelineProps): React.JSX.Element {
  'use no memo';

  const { fileManagerRef, previewFiles, workspace } = useFileManager();
  const previewInstance = useId().replaceAll(':', '');
  const previewPrefix = joinPath('/previews', previewInstance);
  const fileSystemRoot = files === undefined ? joinPath('/projects', projectId) : previewPrefix;

  // Set only after this provider instance successfully installs its isolated mount.
  const mountedPrefixRef = useRef<string | undefined>(undefined);
  // Capture `workspace.unmount` so the cleanup effect uses a stable reference
  // even if the gated facade re-renders.
  const unmountRef = useRef(workspace.unmount);

  useEffect(() => {
    unmountRef.current = workspace.unmount;
  }, [workspace.unmount]);

  const cadRef = useActorRef(cadMachine, {
    input: {
      shouldInitializeKernelOnStart: false,
      fileManagerRef,
      kernelOptionsFactory,
      fileSystemRoot,
    },
  });

  const graphicsRef = useActorRef(graphicsMachine, {
    input: {
      enableSurfaces: defaultGraphicsSettings.enableSurfaces,
      enableLines: defaultGraphicsSettings.enableLines,
      enableGizmo: defaultGraphicsSettings.enableGizmo,
      enableGrid: defaultGraphicsSettings.enableGrid,
      enableAxes: defaultGraphicsSettings.enableAxes,
      enableMatcap: defaultGraphicsSettings.enableMatcap,
      enablePostProcessing: defaultGraphicsSettings.enablePostProcessing,
      upDirection: defaultGraphicsSettings.upDirection,
      graphicsBackend: defaultGraphicsSettings.graphicsBackend ?? 'webgl',
    },
  });

  // Orchestration machine -- file preparation + cadRef initialization.
  // prepareFiles actor is injected via .provide(), using fileManagerRef (stable actor ref)
  // to wait for the file manager to be ready and access services directly from the snapshot.
  // This avoids stale closures: useActorRef creates the actor once, so closured callbacks
  // from useFileManager() would permanently capture the initial undefined services.
  const previewRef = useActorRef(
    cadPreviewMachine.provide({
      actors: {
        /* oxlint-disable react/refs -- XState's stable ActorRef is an imperative public API, not a mutable React ref read during render. */
        prepareFiles: fromSafeAsync(async ({ input, signal }) => {
          if (input.files) {
            const snapshot: SnapshotFrom<typeof fileManagerMachine> = await waitFor(
              fileManagerRef,
              (state) => state.matches('ready') || state.matches('error'),
            );

            if (snapshot.matches('error')) {
              throw new Error(snapshot.context.error?.message ?? 'File manager initialization failed');
            }

            signal.throwIfAborted();

            // Always write the full snapshot. Preview imports are not hot enough
            // to justify stale-file detection, and every instance has its own root.
            const projectFiles: Record<string, { content: Uint8Array<ArrayBuffer> }> = {};
            for (const [path, file] of Object.entries(input.files)) {
              projectFiles[joinPath(previewPrefix, path)] = {
                content: new Uint8Array(file.content),
              };
            }

            await workspace.mount(previewPrefix, {
              backend: 'memory',
              storageRootKey: `memory:preview:${previewInstance}`,
              // Regenerated from the shared bundle on every mount.
              class: 'derived',
            });
            if (signal.aborted) {
              // The pipeline unmounted while the mount was pending; its cleanup saw no prefix.
              unmountRef.current(previewPrefix);
              signal.throwIfAborted();
            }
            mountedPrefixRef.current = previewPrefix;
            await previewFiles.writeFiles(projectFiles);
          }
        }),
        /* oxlint-enable react/refs -- End XState ActorRef boundary. */
      } satisfies Partial<MachineActors<typeof cadPreviewMachine>>,
    }),
    {
      input: {
        cadRef,
        projectId,
        mainFile,
        files,
        stage: files === undefined ? undefined : ephemeralPreviewStage(files),
        parameters,
      },
    },
  );

  // Send 'start' when enabled -- the machine handles the rest
  useEffect(() => {
    if (isEnabled) {
      previewRef.send({ type: 'start' });
    }
  }, [isEnabled, previewRef]);

  // Release the preview on React teardown: the ephemeral prefix, and the kernel
  // client (stopping the CAD actor runs no exit actions, so it is released here,
  // as ProjectProvider does for workbench units). `cadRef` is stable, so this runs
  // once at unmount; callers remount via `key={projectId-mainFile}`.
  useEffect(() => {
    return () => {
      disposeCadRuntime(cadRef.getSnapshot().context);
      const previewPrefix = mountedPrefixRef.current;
      if (previewPrefix !== undefined) {
        mountedPrefixRef.current = undefined;
        unmountRef.current(previewPrefix);
      }
    };
  }, [cadRef]);

  // Selectors on cadRef for reactive state
  const rendering = useSelector(cadRef, (s) => s.context.rendering);
  const artifact = rendering?.success ? rendering.artifact : undefined;
  const artifactHash = rendering?.success ? rendering.hash : undefined;
  const cadStateValue = useSelector(cadRef, (state) => {
    if (state.hasTag('cad-runtime-error')) {
      return 'error';
    }
    if (state.hasTag('cad-loading')) {
      return 'rendering';
    }
    return 'idle';
  });
  const failureIssues = useSelector(cadRef, selectCadFailureIssues);
  const parameterManifest = useSelector(cadRef, (s) => s.context.parameterManifest);
  const defaultParameters = parameterManifest?.defaults ?? {};
  const jsonSchema =
    parameterManifest?.legacyProjection.status === 'usable' ? parameterManifest.legacyProjection.schema : undefined;

  // Initialization error from the preview machine
  const initError = useSelector(previewRef, (s) => s.context.initError);
  const previewParameters = useSelector(previewRef, (s) => s.context.parameters);

  const status = useMemo(
    () =>
      deriveCadPreviewStatus({
        initError,
        cadState: cadStateValue,
        renderingFailed: failureIssues !== undefined && artifact === undefined,
      }),
    [initError, cadStateValue, failureIssues, artifact],
  );

  const error = useMemo(() => {
    if (initError) {
      return initError;
    }

    const firstIssue = failureIssues?.find((issue) => issue.severity === 'error') ?? failureIssues?.[0];
    if (firstIssue) {
      return new Error(firstIssue.message);
    }

    return undefined;
  }, [failureIssues, initError]);

  const setParameters = useCallback(
    (newParameters: Record<string, unknown>) => {
      previewRef.send({ type: 'setParameters', parameters: newParameters });
    },
    [previewRef],
  );

  const value = useMemo<CadPreviewContextValue>(
    () => ({
      artifact,
      artifactHash,
      status,
      error,
      cadRef,
      graphicsRef,
      defaultParameters,
      jsonSchema,
      parameterManifest,
      parameters: previewParameters,
      setParameters,
    }),
    [
      artifact,
      artifactHash,
      status,
      error,
      cadRef,
      graphicsRef,
      defaultParameters,
      jsonSchema,
      parameterManifest,
      previewParameters,
      setParameters,
    ],
  );

  return <CadPreviewContext.Provider value={value}>{children}</CadPreviewContext.Provider>;
}

/**
 * Access the CAD preview context from the nearest CadPreviewProvider.
 *
 * @example <caption>Read preview state</caption>
 * ```tsx
 * const { artifact, status, setParameters } = useCadPreview();
 * ```
 */
export function useCadPreview(): CadPreviewContextValue;
export function useCadPreview(options: { readonly optional: true }): CadPreviewContextValue | undefined;
export function useCadPreview(options?: { readonly optional?: boolean }): CadPreviewContextValue | undefined {
  const context = useContext(CadPreviewContext);
  if (context === undefined && !options?.optional) {
    throw new Error('useCadPreview must be used within a CadPreviewProvider');
  }

  return context;
}
