import { useCallback, useState } from 'react';
import type { Artifact, RuntimeDocument } from '@taucad/runtime';
import { mimeTypes } from '@taucad/types/constants';
import { toast } from '#components/ui/sonner.js';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { selectCadDisplay } from '#machines/cad.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { getKinematicsUnitState } from '#machines/kinematics.machine.js';
import { bestRouteForActiveKernel } from '#utils/export-formats.utils.js';

type ArCapability = {
  readonly isQuickLookSupported: boolean;
  readonly canActivateAr: boolean;
  readonly isConverting: boolean;
  readonly activateAr: () => Promise<void>;
};

type UseArInput = Readonly<{
  artifact: Artifact | undefined;
  runtimeDocument?: RuntimeDocument;
  cadRef?: ActorRefFrom<typeof cadMachine>;
  graphicsRef?: ActorRefFrom<typeof graphicsMachine>;
}>;

/**
 * Detect iOS via user agent (iPhone/iPad/iPod) and iPad masquerading as Mac.
 * Mirrors model-viewer's detection logic from constants.ts.
 */
const isIos =
  (/iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in globalThis)) ||
  // oxlint-disable-next-line @typescript-eslint/no-deprecated -- Required for iPad detection; no standard replacement exists
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isWkWebView = 'webkit' in globalThis;

/**
 * Detect Quick Look support:
 * - Safari: check relList.supports('ar')
 * - WKWebView (Chrome/Edge/Firefox/Google/DuckDuckGo on iOS): check user agent
 */
const isQuickLookSupported: boolean = (() => {
  if (typeof document === 'undefined' || !isIos) {
    return false;
  }

  if (!isWkWebView) {
    const anchor = document.createElement('a');
    return anchor.relList.supports('ar');
  }

  return /CriOS\/|EdgiOS\/|FxiOS\/|GSA\/|DuckDuckGo\//.test(navigator.userAgent);
})();

function launchQuickLook(usdzBlobUrl: string): void {
  const anchor = document.createElement('a');
  anchor.setAttribute('rel', 'ar');
  anchor.setAttribute('href', usdzBlobUrl);
  anchor.setAttribute('download', 'model.usdz');

  // Required by iOS for Quick Look detection
  const img = document.createElement('img');
  anchor.append(img);

  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();

  img.remove();
  anchor.remove();
}

/**
 * Hook providing iOS Quick Look AR capability detection and launch.
 *
 * Returns `canActivateAr: true` only when the device supports Quick Look
 * and GLTF geometry is available. Call `activateAr()` from a user click handler
 * to export the model to USDZ via the runtime client and open AR Quick Look.
 */
export function useAr({ artifact, runtimeDocument, cadRef, graphicsRef }: UseArInput): ArCapability {
  const [isConverting, setIsConverting] = useState(false);
  const kernelClient = useSelector(cadRef, (state) => state?.context.kernelClient);
  const root = useSelector(cadRef, (state) => state?.context.publishedAssemblyRoot);
  const assembly = useSelector(cadRef, (state) => state?.context.publishedAssembly);
  const outcome = useSelector(cadRef, (state) => state?.context.latestRenderingOutcome);
  const display = useSelector(cadRef, (state) => (state ? selectCadDisplay(state) : undefined));
  const assemblyDisplay = display && 'admitted' in display ? display : undefined;
  const currentHash = useSelector(cadRef, (state) =>
    state?.context.rendering?.success ? state.context.rendering.hash : undefined,
  );
  const presentedKey = useSelector(graphicsRef, (state) => state?.context.gltfPresentation.presentedKey);
  const kinematicsRef = useSelector(graphicsRef, (state) => state?.context.kinematicsRef);
  const unitId = useSelector(graphicsRef, (state) => state?.context.modelInteractionUnitId);
  const poseRevision = useSelector(kinematicsRef, (state) => state?.context.revision);
  const asBuilt = useSelector(kinematicsRef, (state) =>
    state
      ? !unitId ||
        Object.values(getKinematicsUnitState(state.context, unitId).coordinates).every((value) => value === 0)
      : false,
  );

  const selectedKey = assemblyDisplay?.root.digest ?? currentHash;
  const matchesPresentation = graphicsRef ? presentedKey === selectedKey : assemblyDisplay === undefined;

  const hasGltfGeometry = artifact?.mimeType === 'model/gltf-binary' || assemblyDisplay !== undefined;
  const canActivateAr =
    isQuickLookSupported &&
    hasGltfGeometry &&
    matchesPresentation &&
    (!graphicsRef || asBuilt) &&
    Boolean(runtimeDocument ?? assemblyDisplay?.document) &&
    (!cadRef || (outcome === 'success' && (assemblyDisplay !== undefined || currentHash !== undefined))) &&
    (!root || (assemblyDisplay?.root === root && outcome === 'success' && assembly !== undefined));

  const activateAr = useCallback(async () => {
    if (!canActivateAr || (!runtimeDocument && !assemblyDisplay)) {
      return;
    }

    setIsConverting(true);
    let blobUrl: string | undefined;

    const assertCurrentSubject = () => {
      if (
        cadRef &&
        (selectCadDisplay(cadRef.getSnapshot()) !== display ||
          cadRef.getSnapshot().context.latestRenderingOutcome !== 'success')
      ) {
        throw new Error(
          root ? 'The selected assembly changed during AR export.' : 'The selected model changed during AR export.',
        );
      }
      if (graphicsRef && graphicsRef.getSnapshot().context.gltfPresentation.presentedKey !== selectedKey) {
        throw new Error('The presented model changed during AR export.');
      }
      if (graphicsRef) {
        const graphics = graphicsRef.getSnapshot().context;
        const pose = graphics.kinematicsRef.getSnapshot().context;
        if (
          graphics.kinematicsRef !== kinematicsRef ||
          graphics.modelInteractionUnitId !== unitId ||
          pose.revision !== poseRevision ||
          (unitId && Object.values(getKinematicsUnitState(pose, unitId).coordinates).some((value) => value !== 0))
        ) {
          throw new Error('The presented pose changed during AR export; USDZ supports the as-built pose only.');
        }
      }
    };
    try {
      assertCurrentSubject();
      const route = root && assembly && kernelClient && bestRouteForActiveKernel(kernelClient, 'usdz', assembly);
      if (root && !route) {
        throw new Error('This assembly has no qualified USDZ export route.');
      }
      const result =
        route && assemblyDisplay
          ? await assemblyDisplay.document.exportPublished({
              publishedAssembly: { root: assemblyDisplay.root },
              format: 'usdz',
            })
          : runtimeDocument
            ? await runtimeDocument.export('usdz')
            : undefined;
      if (!result) {
        throw new Error('The selected CAD document is unavailable');
      }
      if (!result.success) {
        throw new Error(result.issues[0]?.message ?? 'USDZ export failed');
      }

      if (
        result.files.length !== 1 ||
        !result.files[0].name.endsWith('.usdz') ||
        result.files[0].mimeType !== mimeTypes.usdz
      ) {
        throw new Error(
          `USDZ export expected exactly one .usdz artifact (${mimeTypes.usdz}), received ${result.files.length}: ${result.files.map((file) => `${file.name} (${file.mimeType})`).join(', ')}`,
        );
      }

      assertCurrentSubject();
      const file = result.files[0];
      blobUrl = URL.createObjectURL(new Blob([file.bytes], { type: file.mimeType }));

      launchQuickLook(blobUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to launch AR viewer';
      toast.error(message);
    } finally {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }

      setIsConverting(false);
    }
  }, [
    canActivateAr,
    kernelClient,
    runtimeDocument,
    root,
    assembly,
    display,
    cadRef,
    graphicsRef,
    selectedKey,
    kinematicsRef,
    unitId,
    poseRevision,
  ]);

  return {
    isQuickLookSupported,
    canActivateAr,
    isConverting,
    activateAr,
  };
}
