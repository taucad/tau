import { useCallback, useMemo, useState } from 'react';
import { exportFromGlb } from '@taucad/converter';
import type { Geometry } from '@taucad/types';
import { toast } from '#components/ui/sonner.js';

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
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Required for iPad detection; no standard replacement exists
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isWkWebView = 'webkit' in globalThis && Boolean((globalThis as unknown as Record<string, unknown>)['webkit']);

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
 * to convert the model to USDZ and open AR Quick Look.
 */
export function useAr(geometries: readonly Geometry[]): ArCapability {
  const [isConverting, setIsConverting] = useState(false);

  const hasGltfGeometry = useMemo(() => geometries.some((g) => g.format === 'gltf'), [geometries]);

  const canActivateAr = isQuickLookSupported && hasGltfGeometry;

  const activateAr = useCallback(async () => {
    if (!canActivateAr) {
      return;
    }

    const glbGeometry = geometries.find((g) => g.format === 'gltf');
    if (!glbGeometry) {
      return;
    }

    setIsConverting(true);
    let blobUrl: string | undefined;

    try {
      const exportedFiles = await exportFromGlb(glbGeometry.content, 'usdz');
      const usdzFile = exportedFiles[0];
      if (!usdzFile) {
        throw new Error('USDZ conversion produced no output');
      }

      blobUrl = URL.createObjectURL(new Blob([usdzFile.bytes], { type: 'model/vnd.usdz+zip' }));

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
  }, [canActivateAr, geometries]);

  return {
    isQuickLookSupported,
    canActivateAr,
    isConverting,
    activateAr,
  };
}
