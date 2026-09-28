/**
 * TAU_DEBUG-only browser probes for the ui-e2e specs that drive the real
 * page-side GeoSpec runner and headless capture services directly, without
 * an agent turn in front of them. Consumed by `geospec-runner.spec.ts` and
 * `headless-chat-image-rpc.spec.ts`; paired with the `/__e2e/geospec-runner`
 * and `/__e2e/headless-chat-image-capture` seed routes.
 *
 * Mounted once per focused chat by `ChatInterfaceSessionGate`, and only when
 * `ENV.TAU_DEBUG` is set, so production bundles never install the globals.
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { CaptureImagesRpcInput, CaptureImagesRpcResult, RunGeoSpecTestsRpcInput } from '@taucad/chat';
import { rpcName } from '@taucad/chat/constants';
import { ENV } from '#environment.config.js';
import { useActiveChatSession } from '#hooks/active-chat-provider.js';
import { createRpcHandlers } from '#hooks/rpc-handlers.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import { awaitFreshRender } from '#machines/await-fresh-render.js';
import { useHeadlessImageService } from '#providers/headless-image-provider.js';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import { captureFilesToDataUrls, captureSettledCadImages } from '#services/headless-capture.js';
import type { SectionCutValues } from '#components/geometry/graphics/section-cuts.js';
import { createGeoSpecWorkerRpcClient } from '#workers/geospec-runner.client.js';
import type { GeoSpecWorkerRpcClient } from '#workers/geospec-runner.client.js';
import { armChatTurnHold, releaseChatTurnHold } from '#chat-clients/_internal/chat-host-binding.js';
import type { ChatTurnHold } from '#chat-clients/_internal/chat-host-binding.js';

type DebugProbeGlobals = {
  __tauRunGeoSpec?: (args?: RunGeoSpecTestsRpcInput) => Promise<unknown>;
  __tauGeoSpecReady?: () => boolean;
  __tauCaptureImages?: (input: CaptureImagesRpcInput) => Promise<CaptureImagesRpcResult>;
  /** The agent's isometric capture of `src/main.ts` once per cut list, as data URLs, through the packaged worker. */
  __tauCaptureSectionCuts?: (cutLists: ReadonlyArray<readonly SectionCutValues[]>) => Promise<string[]>;
  /**
   * Park the chat's next admission, so a row can make a gesture, a reload or a
   * stop land inside `run.queued.admitting`.
   * @see armChatTurnHold
   */
  __tauHoldChatTurn?: (hold: ChatTurnHold) => void;
  /** Let a parked admission carry on. @see releaseChatTurnHold */
  __tauReleaseChatTurn?: (hold: ChatTurnHold) => void;
};

const probeGlobals = globalThis as DebugProbeGlobals;

/** Installs the e2e probe globals for the focused chat; renders nothing. */
export function DebugProbes(): ReactNode {
  const { activeChatId } = useActiveChatSession();
  const { projectRef, editorRef } = useProject();
  const fileManager = useFileManager();
  const headlessImageService = useHeadlessImageService();
  /* The probes read live dependencies at call time. Keying the install effect
   * on them instead would close the GeoSpec worker mid-run whenever a file
   * manager or chat render replaced a context value. */
  const depsRef = useRef({ activeChatId, projectRef, editorRef, fileManager, headlessImageService });
  useEffect(() => {
    depsRef.current = { activeChatId, projectRef, editorRef, fileManager, headlessImageService };
  });

  useEffect(() => {
    let geoSpecClient: GeoSpecWorkerRpcClient | undefined;
    const openRootBridge = () => {
      const { openFileSystemBridge, rootDirectory } = depsRef.current.fileManager.fileManagerRef.getSnapshot().context;
      if (!openFileSystemBridge) {
        throw new Error('File manager filesystem bridge not available for GeoSpec tests.');
      }
      /* The GeoSpec worker is runtime composition over the working copy, like the kernel's. */
      return openFileSystemBridge(rootDirectory, 'working-copy');
    };
    // Runs the real browser GeoSpec path with phase timings, so a slow or hung
    // run can be measured without the API's RPC budget truncating it.
    probeGlobals.__tauRunGeoSpec = async (args = {}) => {
      const startedAt = performance.now();
      geoSpecClient ??= createGeoSpecWorkerRpcClient({
        openFileSystemBridge: openRootBridge,
        runtimeConfig: createUiRuntimeConfig(ENV),
      });
      const readyAt = performance.now();
      const result = await geoSpecClient.runTests(args);
      return {
        /** Milliseconds. */
        clientReady: Math.round(readyAt - startedAt),
        /** Milliseconds. */
        total: Math.round(performance.now() - startedAt),
        result,
      };
    };
    probeGlobals.__tauGeoSpecReady = () =>
      depsRef.current.fileManager.fileManagerRef.getSnapshot().context.openFileSystemBridge !== undefined;
    probeGlobals.__tauCaptureImages = async (input) => {
      const { activeChatId: chatId, ...deps } = depsRef.current;
      return createRpcHandlers({ chatId, ...deps }).executeRpcCall({
        rpcName: rpcName.captureImages,
        args: input,
        toolCallId: 'e2e-capture-images',
      });
    };
    probeGlobals.__tauCaptureSectionCuts = async (cutLists) => {
      const { projectRef: liveProjectRef, headlessImageService: imageService } = depsRef.current;
      const cadUnit = liveProjectRef.getSnapshot().context.geometryUnits.get('src/main.ts');
      if (!cadUnit) {
        throw new Error('No geometry unit for src/main.ts');
      }
      const cadSnapshot = await awaitFreshRender(cadUnit);
      const dataUrls: string[] = [];
      for (const cuts of cutLists) {
        // oxlint-disable-next-line no-await-in-loop -- the image service runs one capture at a time, in order.
        const files = await captureSettledCadImages({
          cadSnapshot,
          imageService,
          recipe: { purpose: 'agent', mode: 'isometric', includeEdges: true },
          presentation: {
            upDirection: 'z',
            enableSurfaces: true,
            enableLines: true,
            hiddenComponentIds: [],
            isolatedComponentIds: [],
            sectionCuts: cuts.map((cut, index) => ({ ...cut, id: `e2e-cut-${index}` })),
          },
        });
        dataUrls.push(...captureFilesToDataUrls(files));
      }
      return dataUrls;
    };
    probeGlobals.__tauHoldChatTurn = armChatTurnHold;
    probeGlobals.__tauReleaseChatTurn = releaseChatTurnHold;
    return () => {
      void geoSpecClient?.close();
      delete probeGlobals.__tauRunGeoSpec;
      delete probeGlobals.__tauGeoSpecReady;
      delete probeGlobals.__tauCaptureImages;
      delete probeGlobals.__tauCaptureSectionCuts;
      /* Nothing else can release these: a hold left armed by a chat switch or
       * a route unmount would park the next turn with no probe left to let it
       * go. A row that wants one across a reload arms it again on the new
       * document, where this module's state starts empty anyway. */
      releaseChatTurnHold('admission');
      delete probeGlobals.__tauHoldChatTurn;
      delete probeGlobals.__tauReleaseChatTurn;
    };
  }, []);

  return null;
}
