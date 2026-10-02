import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useCallback } from 'react';
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
  readonly geometries: Geometry[];
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
 * Provider that creates a lightweight CAD rendering pipeline (cadMachine + graphicsMachine),
 * optionally writes files to the filesystem, and exposes all rendering state via the useCadPreview() hook.
 *
 * Replaces the heavyweight ProjectProvider for preview-only contexts.
 * Uses cadPreviewMachine to orchestrate file preparation and kernel initialization,
 * following the same invoke+fromPromise pattern as projectMachine.
 *
 * @example <caption>Simple thumbnail</caption>
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
  const { fileManagerRef } = useFileManager();

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

            const { contentService } = snapshot.context;
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

            await contentService.writeFiles(projectFiles, 'machine');
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

  // Selectors on cadRef for reactive state
  const geometries = useSelector(cadRef, (s) => s.context.geometries);
  const cadStateValue = useSelector(cadRef, (s) => s.value);
  const kernelIssues = useSelector(cadRef, (s) => s.context.kernelIssues);
  const defaultParameters = useSelector(cadRef, (s) => s.context.defaultParameters);
  const jsonSchema = useSelector(cadRef, (s) => s.context.jsonSchema);
  const cadUnits = useSelector(cadRef, (s) => s.context.units);

  // Initialization error from the preview machine
  const initError = useSelector(previewRef, (s) => s.context.initError);

  const status = initError ? 'error' : deriveStatus(typeof cadStateValue === 'string' ? cadStateValue : 'idle');

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

  // Forward geometries to graphics machine
  useEffect(() => {
    if (geometries.length > 0) {
      graphicsRef.send({
        type: 'updateGeometries',
        geometries,
        units: cadUnits,
      });
    }
  }, [geometries, cadUnits, graphicsRef]);

  const setParameters = useCallback(
    (newParameters: Record<string, unknown>) => {
      previewRef.send({ type: 'setParameters', parameters: newParameters });
    },
    [previewRef],
  );

  const value = useMemo<CadPreviewContextValue>(
    () => ({
      geometries,
      status,
      error,
      cadRef,
      graphicsRef,
      defaultParameters,
      jsonSchema,
      setParameters,
    }),
    [geometries, status, error, cadRef, graphicsRef, defaultParameters, jsonSchema, setParameters],
  );

  return <CadPreviewContext.Provider value={value}>{children}</CadPreviewContext.Provider>;
}

/**
 * Access the CAD preview context from the nearest CadPreviewProvider.
 *
 * @example <caption>Read preview state</caption>
 * ```tsx
 * const { geometries, status, setParameters } = useCadPreview();
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
