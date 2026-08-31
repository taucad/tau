import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useCallback, useId, useRef } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { Geometry } from '@taucad/types';
import type { JSONSchema7 } from '@taucad/json-schema';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { cadMachine } from '#machines/cad.machine.js';
import { cadPreviewMachine } from '#machines/cad-preview.machine.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { joinPath } from '@taucad/utils/path';
import { defaultGraphicsSettings } from '#constants/editor.constants.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';
import { defaultKernelOptions } from '#constants/kernel-options.presets.js';

/**
 * Status of the CAD preview.
 */
export type CadPreviewStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Context value exposed by CadPreviewProvider via the useCadPreview() hook.
 */
export type CadPreviewContextValue = {
  readonly geometry: Geometry | undefined;
  readonly status: CadPreviewStatus;
  readonly error: Error | undefined;
  readonly cadRef: ActorRefFrom<typeof cadMachine>;
  readonly graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  readonly defaultParameters: Record<string, unknown>;
  readonly jsonSchema: JSONSchema7 | undefined;
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
  /** The latest render settled as a failure and no geometry frame exists to keep showing. */
  readonly geometryFailed?: boolean;
}): CadPreviewStatus => {
  if (args.initError) {
    return 'error';
  }

  const status = deriveStatus(args.cadState);
  /* A kernel result with `success: false` settles the worker to `idle`, not
   * `error`, so a failed *first* render would otherwise display as an
   * eternal loader. A failure after a successful frame keeps the stale
   * frame (geometryFailed is false then). */
  if (args.geometryFailed === true && (status === 'ready' || status === 'idle')) {
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
 * following the same invoke+fromPromise pattern as projectMachine.
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
export function CadPreviewProvider({
  projectId,
  mainFile,
  files,
  parameters,
  isEnabled = true,
  kernelOptionsFactory = defaultKernelOptions,
  children,
}: CadPreviewProviderProps): React.JSX.Element {
  const { fileManagerRef, client, workspace } = useFileManager();
  const previewInstance = useId().replaceAll(':', '');
  const previewPrefix = joinPath('/previews', previewInstance);
  const fileSystemRoot = files === undefined ? joinPath('/projects', projectId) : previewPrefix;

  // Set only after this provider instance successfully installs its isolated mount.
  const mountedPrefixRef = useRef<string | undefined>(undefined);
  // Capture `workspace.unmount` so the cleanup effect uses a stable reference
  // even if the gated facade re-renders.
  const unmountRef = useRef(workspace.unmount);
  unmountRef.current = workspace.unmount;

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
      defaultCameraFovAngle: defaultGraphicsSettings.cameraFovAngle,
      measureSnapDistance: 40,
      enableSurfaces: defaultGraphicsSettings.enableSurfaces,
      enableLines: defaultGraphicsSettings.enableLines,
      enableGizmo: defaultGraphicsSettings.enableGizmo,
      enableGrid: defaultGraphicsSettings.enableGrid,
      enableAxes: defaultGraphicsSettings.enableAxes,
      enableMatcap: defaultGraphicsSettings.enableMatcap,
      enablePostProcessing: defaultGraphicsSettings.enablePostProcessing,
      upDirection: defaultGraphicsSettings.upDirection,
      environmentPreset: defaultGraphicsSettings.environmentPreset,
      graphicsBackendPreference: defaultGraphicsSettings.graphicsBackend ?? 'webgl',
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
        prepareFiles: fromSafeAsync(async ({ input, signal }) => {
          if (input.files) {
            const snapshot = await waitFor(fileManagerRef, (state) => state.matches('ready') || state.matches('error'));

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
            });
            mountedPrefixRef.current = previewPrefix;
            signal.throwIfAborted();
            await client.writeFiles(projectFiles);
          }
        }),
      },
    }),
    {
      input: {
        cadRef,
        projectId,
        mainFile,
        files,
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

  // Unmount the preview-owned ephemeral prefix on React teardown.
  // The effect intentionally has an empty dependency array — it should run
  // exactly once at unmount (or `projectId` change, which remounts the
  // provider via the `key={projectId-mainFile}` callers use). React invokes
  // cleanup on unmount; the actor is what sets the ref between mount and
  // cleanup.
  useEffect(() => {
    return () => {
      const previewPrefix = mountedPrefixRef.current;
      if (previewPrefix !== undefined) {
        mountedPrefixRef.current = undefined;
        unmountRef.current(previewPrefix);
      }
    };
  }, []);

  // Selectors on cadRef for reactive state
  const geometry = useSelector(cadRef, (s) => s.context.geometry);
  const cadStateValue = useSelector(cadRef, (state) => {
    if (state.matches('connecting')) {
      return 'connecting';
    }
    if (state.matches('buffering')) {
      return 'buffering';
    }
    if (state.matches('rendering')) {
      return 'rendering';
    }
    if (state.matches('error')) {
      return 'error';
    }
    return 'idle';
  });
  const kernelIssues = useSelector(cadRef, (s) => s.context.kernelIssues);
  const latestGeometryOutcome = useSelector(cadRef, (s) => s.context.latestGeometryOutcome);
  const defaultParameters = useSelector(cadRef, (s) => s.context.defaultParameters);
  const jsonSchema = useSelector(cadRef, (s) => s.context.jsonSchema);
  const cadUnits = useSelector(cadRef, (s) => s.context.units);

  // Initialization error from the preview machine
  const initError = useSelector(previewRef, (s) => s.context.initError);

  const status = useMemo(
    () =>
      deriveCadPreviewStatus({
        initError,
        cadState: cadStateValue,
        geometryFailed: latestGeometryOutcome === 'failure' && geometry === undefined,
      }),
    [initError, cadStateValue, latestGeometryOutcome, geometry],
  );

  const error = useMemo(() => {
    if (initError) {
      return initError;
    }

    if (status !== 'error') {
      return undefined;
    }

    const firstIssue = [...kernelIssues.values()].flat()[0];
    if (firstIssue) {
      return new Error(firstIssue.message);
    }

    return new Error('Unknown CAD error');
  }, [status, kernelIssues, initError]);

  // Forward geometry to graphics machine
  useEffect(() => {
    if (geometry) {
      graphicsRef.send({
        type: 'updateGeometry',
        geometry,
        units: cadUnits,
      });
    }
  }, [geometry, cadUnits, graphicsRef]);

  const setParameters = useCallback(
    (newParameters: Record<string, unknown>) => {
      previewRef.send({ type: 'setParameters', parameters: newParameters });
    },
    [previewRef],
  );

  const value = useMemo<CadPreviewContextValue>(
    () => ({
      geometry,
      status,
      error,
      cadRef,
      graphicsRef,
      defaultParameters,
      jsonSchema,
      setParameters,
    }),
    [geometry, status, error, cadRef, graphicsRef, defaultParameters, jsonSchema, setParameters],
  );

  return <CadPreviewContext.Provider value={value}>{children}</CadPreviewContext.Provider>;
}

/**
 * Access the CAD preview context from the nearest CadPreviewProvider.
 *
 * @example <caption>Read preview state</caption>
 * ```tsx
 * const { geometry, status, setParameters } = useCadPreview();
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
