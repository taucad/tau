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
import { captureFilesToDataUrls } from '#services/headless-capture.js';
import { createGeoSpecWorkerRpcClient } from '#workers/geospec-runner.client.js';
import type { GeoSpecWorkerRpcClient } from '#workers/geospec-runner.client.js';

type SectionPlane = Readonly<{ point: readonly [number, number, number]; normal: readonly [number, number, number] }>;

type DebugProbeGlobals = {
  __tauRunGeoSpec?: (args?: RunGeoSpecTestsRpcInput) => Promise<unknown>;
  __tauGeoSpecReady?: () => boolean;
  __tauCaptureImages?: (input: CaptureImagesRpcInput) => Promise<CaptureImagesRpcResult>;
  __tauCaptureSectionPlanePair?: () => Promise<{ onePlane: string; twoPlanes: string }>;
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
    probeGlobals.__tauCaptureSectionPlanePair = async () => {
      const { projectRef: liveProjectRef, headlessImageService: imageService } = depsRef.current;
      const cadUnit = liveProjectRef.getSnapshot().context.geometryUnits.get('src/main.ts');
      if (!cadUnit) {
        throw new Error('No geometry unit for src/main.ts');
      }
      const settled = await awaitFreshRender(cadUnit);
      const { geometry, entryPath } = settled.context;
      if (!geometry || !entryPath || geometry.format === 'svg' || geometry.format === 'webrtc') {
        throw new Error('Section planes need settled GLB geometry');
      }
      const render = async (planes: readonly SectionPlane[]): Promise<string> => {
        const files = await imageService.export({
          kind: 'capture',
          identity: `e2e-section-planes:${geometry.hash}:${planes.length}`,
          sourceFormat: 'glb',
          sourcePath: entryPath,
          geometryHash: geometry.hash,
          content: geometry.content,
          format: 'png',
          exportOptions: {
            mode: 'single',
            width: 512,
            height: 512,
            lineWidth: 1,
            camera: {
              framing: 'fit',
              direction: [0.6123724357, -0.6123724357, 0.5],
              up: [0, 0, 1],
              margin: 0.1,
              projection: { kind: 'perspective', verticalFieldOfView: 45 },
            },
            sections: { planes, clipSurfaces: true, clipLines: true },
          },
        });
        if (files?.length !== 1) {
          throw new Error(`Expected one section image, received ${files?.length ?? 0}`);
        }
        return captureFilesToDataUrls(files)[0]!;
      };
      const first: SectionPlane = { point: [0, 0, 0], normal: [1, 0, 0] };
      return {
        onePlane: await render([first]),
        twoPlanes: await render([first, { point: [0, 0, 0], normal: [0, 1, 0] }]),
      };
    };
    return () => {
      void geoSpecClient?.close();
      delete probeGlobals.__tauRunGeoSpec;
      delete probeGlobals.__tauGeoSpecReady;
      delete probeGlobals.__tauCaptureImages;
      delete probeGlobals.__tauCaptureSectionPlanePair;
    };
  }, []);

  return null;
}
