import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useCallback, useRef } from 'react';
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
 * Whether `prepareFiles` should (re)mount the preview-owned ephemeral prefix.
 *
 * A retry after a post-mount failure (e.g. `client.writeFiles` rejected) re-runs
 * `prepareFiles` with the same prefix already mounted. Re-mounting the same
 * prefix would register a second, duplicate mount on the worker; skip it when the
 * prefix is already the one this provider registered.
 */
export const shouldMountPreviewPrefix = (mountedPrefix: string | undefined, previewPrefix: string): boolean =>
  mountedPrefix !== previewPrefix;

/**
 * Combines CAD machine phase and initialization errors into the preview status
 * exposed by {@link useCadPreview}.
 */
export const deriveCadPreviewStatus = (args: {
  readonly initError: Error | undefined;
  readonly cadState: string;
}): CadPreviewStatus => {
  if (args.initError) {
    return 'error';
  }

  return deriveStatus(args.cadState);
};

/**
 * Provider that creates a lightweight CAD rendering pipeline (cadMachine + graphicsMachine),
 * optionally writes files to the filesystem, and exposes all rendering state via the useCadPreview() hook.
 *
 * Replaces the heavyweight ProjectProvider for preview-only contexts.
 * Uses cadPreviewMachine to orchestrate file preparation and kernel initialization,
 * following the same invoke+fromPromise pattern as projectMachine.
 *
 * ## Two-mode filesystem contract (when `files` is provided)
 *
 * Preview files always land under `/projects/<projectId>/...`, but who owns
 * the worker-side mount depends on the surrounding `FileManagerProvider`:
 *
 * 1. **Case A — surrounding FM is project-scoped to the same `projectId`**
 *    (e.g. `projects_.$id_.preview/route.tsx` and `v.$id/route.tsx`, both of
 *    which wrap the preview in a `FileManagerProvider rootDirectory={/projects/<id>}`).
 *    The FM machine has already mounted that prefix on the worker
 *    (file-manager.machine.ts, gated on `context.projectId !== undefined`).
 *    The provider writes via `FileContentService.writeFiles` so the FM's
 *    cache + tree refresh stay coherent. Absolute keys resolve to
 *    workspace-relative paths inside the resolver — no escape, no extra
 *    mount lifecycle.
 *
 * 2. **Case B — surrounding FM does NOT match the preview's `projectId`**
 *    (e.g. `import-viewer.tsx` with `projectId='import-preview-<owner>-<repo>'`
 *    under the app shell's root FM at `/`, or `project-grid.tsx`
 *    thumbnails). No mount exists for the preview prefix; writing through
 *    the surrounding `FileContentService` would trip
 *    `WorkspaceScopeViolationError` (keys escape its `rootDirectory`).
 *    The provider mounts its own ephemeral `{ backend: 'memory',
 *    preservePath: true }` at `/projects/<projectId>`, writes via
 *    `client.writeFiles` (the worker-namespace escape hatch — see
 *    `use-file-manager.tsx` `FileSystemClientFacade` JSDoc), and unmounts
 *    on React teardown. Ephemerality keeps the user's persistent IDB clean.
 *
 * Detection is purely a function of `snapshot.context.projectId` on the
 * `fileManagerRef`. No mount-table query / `isMounted` API is required —
 * the FM machine is the only producer of `/projects/<id>` mounts.
 *
 * @example <caption>Simple thumbnail (Case B — root FM, ephemeral mount)</caption>
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

  // Tracks the mount prefix this provider instance registered on the worker.
  // Set by the `prepareFiles` actor when the preview owns the mount lifecycle
  // (root-FM / cross-scope case); left `undefined` when the surrounding
  // project-scoped FM already owns the mount. The unmount-on-cleanup effect
  // reads this ref so a sibling provider with the same `projectId` cannot
  // unmount someone else's mount.
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

            const { contentService, projectId: fmProjectId } = snapshot.context;
            if (!contentService) {
              throw new Error('File manager services not available after initialization');
            }

            signal.throwIfAborted();

            // Always write the full snapshot to the filesystem. A previous optimization skipped writes when
            // `exists(firstKey)` was true; first key order follows Map insertion (arbitrary), so a
            // stale match could skip the entire write while the kernel still read from disk — ENOENT,
            // empty geometry, and broken tree refresh. Preview imports are not hot enough to require skipping.
            const projectFiles: Record<string, { content: Uint8Array<ArrayBuffer> }> = {};
            for (const [path, file] of Object.entries(input.files)) {
              projectFiles[joinPath('/projects', input.projectId, path)] = {
                content: new Uint8Array(file.content),
              };
            }

            // Two-mode dispatch (see CadPreviewProvider JSDoc):
            //   - Case A (FM owns mount): surrounding FM machine has already
            //     mounted the project's backend at `/projects/<projectId>` (it
            //     does this iff `context.projectId !== undefined`, see
            //     file-manager.machine.ts ~lines 295-309). Write through the
            //     FM's `FileContentService` so its cache + tree refresh stay
            //     coherent for the editor / publication view.
            //   - Case B (preview owns mount): surrounding FM doesn't match
            //     this preview's `projectId` (root-FM thumbnail / import-
            //     preview / cross-scope). Mount an ephemeral `memory` backend
            //     at the preview prefix and write via `client.writeFiles`,
            //     the documented worker-namespace escape hatch. Going through
            //     `contentService.writeFiles` would trip
            //     `WorkspaceScopeViolationError` because the absolute keys
            //     escape the FM's `rootDirectory` (the bug this fix closes).
            const previewOwnsMount = fmProjectId !== input.projectId;
            if (previewOwnsMount) {
              const previewPrefix = joinPath('/projects', input.projectId);
              // Only mount when this prefix isn't already registered. A retry
              // after a post-mount write failure re-runs prepareFiles with the
              // prefix still mounted — remounting would duplicate the mount.
              if (shouldMountPreviewPrefix(mountedPrefixRef.current, previewPrefix)) {
                await workspace.mount(previewPrefix, { backend: 'memory', preservePath: true });
                mountedPrefixRef.current = previewPrefix;
              }
              signal.throwIfAborted();
              await client.writeFiles(projectFiles);
            } else {
              await contentService.writeFiles(projectFiles, 'machine');
            }
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
  // Mount-on-write registration happens inside `prepareFiles` (above) and
  // sets `mountedPrefixRef.current` only when the preview owns the mount.
  // Cleanup is a no-op when the surrounding FM already owned the mount.
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
  const cadStateValue = useSelector(cadRef, (s) => s.value);
  const kernelIssues = useSelector(cadRef, (s) => s.context.kernelIssues);
  const defaultParameters = useSelector(cadRef, (s) => s.context.defaultParameters);
  const jsonSchema = useSelector(cadRef, (s) => s.context.jsonSchema);
  const cadUnits = useSelector(cadRef, (s) => s.context.units);

  // Initialization error from the preview machine
  const initError = useSelector(previewRef, (s) => s.context.initError);

  const status = useMemo(
    () =>
      deriveCadPreviewStatus({
        initError,
        cadState: typeof cadStateValue === 'string' ? cadStateValue : 'idle',
      }),
    [initError, cadStateValue],
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
