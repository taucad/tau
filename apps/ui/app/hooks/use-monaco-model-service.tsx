/**
 * Monaco Model Service Provider
 *
 * React context provider that creates and orchestrates all platform services:
 * - MonacoModelService: Model lifecycle, file event handling, background sync
 * - MonacoMarkerService: Marker storage independent of model existence
 * - LanguageContributionRegistry: Two-phase language lifecycle management
 * - MonacoNavigationService: Global editor opener for cross-model navigation
 *
 * Services are initialized when Monaco becomes available and disposed on unmount.
 * Project session changes are forwarded to all services for clean state transitions.
 */

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useMonaco } from '@monaco-editor/react';
import { toast } from 'sonner';
import { MonacoMarkerService } from '#lib/monaco-marker-service.js';
import { MonacoModelService } from '#lib/monaco-model-service.js';
import { registry } from '#lib/monaco-language-registry.js';
import { registerMonacoNavigation } from '#lib/monaco-navigation-service.js';
import { registerTsFileRenameParticipant } from '#lib/monaco-typescript-extras/register-materializing-typescript-providers.client.js';
import {
  createMonacoWorkspaceFs,
  createExtraLibsFileSystemProvider,
  createWorkspaceFileSystemProvider,
  subscribeWorkspaceContentDispatch,
} from '#lib/monaco-workspace-fs/index.js';
import {
  clearTauLanguageHostPortFactory,
  openTauLanguageHostPort,
  setTauLanguageHostPortFactory,
} from '@taucad/lsp/language-fs-sync-host';
import type { ActorRefFrom } from 'xstate';
import type { cadMachine } from '#machines/cad.machine.js';
import { useProject } from '#hooks/use-project.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { getMonacoLanguageIdsForKernel } from '#lib/kernel-monaco-language.utils.js';

type MonacoServicesContextType = {
  modelService: MonacoModelService | undefined;
  markerService: MonacoMarkerService | undefined;
};

const defaultContextValue: MonacoServicesContextType = { modelService: undefined, markerService: undefined };

const MonacoServicesContext = createContext<MonacoServicesContextType>(defaultContextValue);

export function MonacoModelServiceProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const monaco = useMonaco();
  const { projectId, editorRef, geometryUnits } = useProject();
  const { fileManagerRef, contentService, treeService, readFile, exists, readdir, getDirectoryStat } = useFileManager();

  const fileManagerApi = useMemo(
    () => ({ readFile, exists, readdir, getDirectoryStat }),
    [readFile, exists, readdir, getDirectoryStat],
  );

  const [services, setServices] = useState<MonacoServicesContextType>(defaultContextValue);

  useEffect(() => {
    if (!monaco || !contentService || !treeService) {
      return;
    }

    const markerService = new MonacoMarkerService();
    markerService.initialize(monaco);

    setTauLanguageHostPortFactory(() => openTauLanguageHostPort(fileManagerRef));

    const workspaceFs = createMonacoWorkspaceFs(monaco);
    workspaceFs.registerFileSystemProvider(
      createWorkspaceFileSystemProvider({
        monaco,
        contentService,
        searchFiles: async (query, options) => treeService.searchFiles(query, options),
      }),
    );
    workspaceFs.registerFileSystemProvider(createExtraLibsFileSystemProvider(monaco));

    const modelService = new MonacoModelService();
    modelService.initialize({
      monaco,
      workspaceFs,
      contentService,
      markerService,
    });
    workspaceFs.bindModelService({
      async refreshContent(uri) {
        await modelService.refreshContent(uri);
      },
    });
    const workspaceContentDispatch = subscribeWorkspaceContentDispatch(contentService, (event) => {
      modelService.applyContentChange(event);
    });

    // R17: family-global TS file-rename participant. Listens on the same
    // `onDidContentChange` channel as `MonacoModelService` and applies
    // tsserver's `getEditsForFileRename` cascade so renaming `a.ts → lib/a.ts`
    // updates every `import './a'` consumer in one undo step.
    const tsRenameParticipant = registerTsFileRenameParticipant({
      monaco,
      workspaceFs,
      contentService,
    });

    // Surface deferred activation failures via toast (deduped per language id
    // for the lifetime of this activation cycle) so silent failures stop looking
    // identical to "no LSP available".
    const reportedFailures = new Set<string>();
    registry.setActivationErrorHandler((languageId, error) => {
      if (reportedFailures.has(languageId)) {
        return;
      }
      reportedFailures.add(languageId);
      toast.error(`Failed to load language services for ${languageId}`, {
        description: error.message,
      });
    });

    registry.activate({
      monaco,
      modelService,
      markerService,
      workspaceFs,
      fileManager: fileManagerApi,
      fileManagerRef,
      treeService,
      filePoolBuffer: fileManagerRef.getSnapshot().context.filePoolBuffer,
      openLanguageHostPort: () => openTauLanguageHostPort(fileManagerRef),
    });

    const openerDisposable = registerMonacoNavigation({
      monaco,
      editorRef,
      workspaceFs,
    });

    setServices({ modelService, markerService });

    return () => {
      clearTauLanguageHostPortFactory();
      openerDisposable.dispose();
      tsRenameParticipant.dispose();
      workspaceContentDispatch.dispose();
      registry.setActivationErrorHandler(undefined);
      registry.dispose();
      modelService.dispose();
      workspaceFs.dispose();
      markerService.dispose();

      editorRef.send({ type: 'registerMaterialiseModel', materialiseModel: undefined });

      setServices(defaultContextValue);
    };
  }, [monaco, contentService, treeService, fileManagerApi, fileManagerRef, editorRef]);

  useEffect(() => {
    const ms = services.modelService;
    if (!ms) {
      return;
    }

    const materialiseModel = async (path: string): Promise<void> => {
      await ms.getOrEnsureModel(path);
    };

    editorRef.send({ type: 'registerMaterialiseModel', materialiseModel });

    return () => {
      editorRef.send({ type: 'registerMaterialiseModel', materialiseModel: undefined });
    };
  }, [services.modelService, editorRef]);

  // Forward project session changes to services
  useEffect(() => {
    services.modelService?.setProjectSession();
    registry.onProjectSessionChange(projectId);
  }, [projectId, services.modelService]);

  // Prefetch language contributions for each geometry unit's active kernel
  // so first-keystroke latency in the dominant code path is hidden behind the
  // cad worker's own boot.
  useGeometryUnitKernelPrefetch(geometryUnits, services.modelService !== undefined);

  return <MonacoServicesContext.Provider value={services}>{children}</MonacoServicesContext.Provider>;
}

/**
 * Subscribe to each mounted geometry unit's `cadMachine.activeKernelId` and
 * mirror every emission into a `registry.prefetch(...)` call so the Monaco
 * language contributions for that kernel's source extensions warm up while
 * the kernel worker boots. Idempotency lives inside the registry — this hook
 * only forwards the kernel id.
 *
 * Exported so the wiring is testable without standing up the full Monaco
 * provider tree (see `use-monaco-model-service.test.tsx`).
 */
export function useGeometryUnitKernelPrefetch(
  geometryUnits: Map<string, ActorRefFrom<typeof cadMachine>>,
  enabled: boolean,
): void {
  const subscriptionsRef = useRef(new Map<string, () => void>());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const subscriptions = subscriptionsRef.current;

    // Tear down subscriptions for units that disappeared.
    for (const [path, unsubscribe] of subscriptions) {
      if (!geometryUnits.has(path)) {
        unsubscribe();
        subscriptions.delete(path);
      }
    }

    // Add new subscriptions for newly mounted units. Each cadMachine actor
    // emits its own `activeKernelChanged` event when the runtime client
    // settles on a kernel — we mirror that into a registry prefetch.
    for (const [path, actor] of geometryUnits) {
      if (subscriptions.has(path)) {
        continue;
      }

      const subscription = actor.subscribe((snapshot) => {
        const kernelId = snapshot.context.activeKernelId;
        if (!kernelId) {
          return;
        }
        const monacoIds = getMonacoLanguageIdsForKernel(kernelId);
        if (monacoIds.length > 0) {
          registry.prefetch(monacoIds);
        }
      });

      subscriptions.set(path, () => {
        subscription.unsubscribe();
      });
    }

    return () => {
      // Component unmount path: dispose every outstanding subscription.
      for (const unsubscribe of subscriptions.values()) {
        unsubscribe();
      }
      subscriptions.clear();
    };
  }, [geometryUnits, enabled]);
}

/**
 * Hook to access the Monaco model and marker services.
 */
export function useMonacoServices(): MonacoServicesContextType {
  return useContext(MonacoServicesContext);
}
