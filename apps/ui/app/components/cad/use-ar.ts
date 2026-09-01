import { useCallback, useState } from 'react';
import type { Geometry } from '@taucad/types';
import { toast } from '#components/ui/sonner.js';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';

type ArCapability = {
  readonly isQuickLookSupported: boolean;
  readonly canActivateAr: boolean;
  readonly isConverting: boolean;
  readonly activateAr: () => Promise<void>;
};

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
 * and geometry is available. Call `activateAr()` from a user click handler
 * to export the model to USDZ via the runtime client and open AR Quick Look.
 */
export function useAr(geometries: readonly Geometry[], kernelClient?: AppRuntimeClient): ArCapability {
  const [isConverting, setIsConverting] = useState(false);

  const hasGltfGeometry = geometries.some((g) => g.format === 'gltf');
  const canActivateAr = isQuickLookSupported && hasGltfGeometry && Boolean(kernelClient);

  const activateAr = useCallback(async () => {
    if (!canActivateAr || !kernelClient) {
      return;
    }

    setIsConverting(true);
    let blobUrl: string | undefined;

    try {
      const result = await kernelClient.export('usdz');
      if (!result.success) {
        throw new Error(result.issues[0]?.message ?? 'USDZ export failed');
      }

      const { data } = result;
      blobUrl = URL.createObjectURL(new Blob([data.bytes], { type: data.mimeType }));

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
  }, [canActivateAr, kernelClient]);

  return {
    isQuickLookSupported,
    canActivateAr,
    isConverting,
    activateAr,
  };
}
