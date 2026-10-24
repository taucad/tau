import { useCallback, useEffect, useRef, useState } from 'react';
import type { Artifact, RuntimeDocument } from '@taucad/runtime';
import { mimeTypes } from '@taucad/types/constants';
import { startWebXrAr } from '#components/cad/ar-webxr-session.js';
import type { WebXrArPresentation } from '#components/cad/ar-webxr-session.js';

/**
 * How this device opens the model in the room. Both paths keep the geometry on the device: Quick Look opens a
 * same-origin `blob:` USDZ, and WebXR renders the in-memory GLB inside the page. Scene Viewer is deliberately not a
 * path, because it needs a URL the Google app can fetch, which would publish private geometry (charter EQ4).
 */
export type ArMode = 'quick-look' | 'webxr';

/** Why a launch did not open, each with its own words and recovery. */
export type ArFailureKind = 'denied' | 'unsupported' | 'export' | 'launch';

/** A failed launch, named for the person and kept until they retry or dismiss it. */
export type ArFailure = Readonly<{
  kind: ArFailureKind;
  title: string;
  detail: string;
}>;

type ArCapability = {
  /** The launch path this device supports, once detected on the client; `undefined` when AR is unsupported. */
  readonly mode: ArMode | undefined;
  /** True only when the device supports a path and the current model can be handed to it. */
  readonly canActivateAr: boolean;
  /** True while the model is exported or the AR session is starting. */
  readonly isPreparing: boolean;
  /** True while an in-page WebXR session shows the model. */
  readonly isPresenting: boolean;
  readonly failure: ArFailure | undefined;
  readonly activateAr: () => Promise<void>;
  readonly dismissFailure: () => void;
};

const quickLookBrowsers = /CriOS\/|EdgiOS\/|FxiOS\/|GSA\/|DuckDuckGo\//;

/**
 * Detect AR Quick Look, mirroring model-viewer's `IS_AR_QUICKLOOK_CANDIDATE`. iPadOS Safari reports a Mac user
 * agent, so a `MacIntel` platform with more than one touch point counts as iOS. Safari is asked through
 * `relList.supports('ar')`; WKWebView browsers (Chrome, Edge, Firefox, Google, DuckDuckGo) are known by user agent.
 * @returns Whether a `rel="ar"` link opens Quick Look on this device.
 */
export function isQuickLookCandidate(): boolean {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  const { userAgent } = navigator;
  const isIos =
    (/iPad|iPhone|iPod/.test(userAgent) && !('MSStream' in globalThis)) ||
    // oxlint-disable-next-line @typescript-eslint/no-deprecated -- Required for iPad detection; no standard replacement exists
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIos) {
    return false;
  }

  const { webkit } = globalThis as { webkit?: { messageHandlers?: unknown } };
  if (!webkit?.messageHandlers) {
    const anchor = document.createElement('a');
    return typeof anchor.relList.supports === 'function' && anchor.relList.supports('ar');
  }

  return quickLookBrowsers.test(userAgent);
}

/**
 * Detect an in-page WebXR AR session, mirroring model-viewer's WebXR check: `immersive-ar` sessions with hit
 * testing, which supported Android Chrome offers.
 * @returns Whether `navigator.xr` reports `immersive-ar` support.
 */
export async function isWebXrArSupported(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.xr) {
    return false;
  }

  if (typeof XRSession === 'undefined' || typeof XRSession.prototype.requestHitTestSource !== 'function') {
    return false;
  }

  try {
    return await navigator.xr.isSessionSupported('immersive-ar');
  } catch {
    return false;
  }
}

/**
 * Pick this device's AR path: Quick Look on iPhone and iPad, then in-page WebXR, otherwise none.
 * @returns The launch path, or `undefined` when AR is unsupported.
 */
export async function detectArMode(): Promise<ArMode | undefined> {
  if (isQuickLookCandidate()) {
    return 'quick-look';
  }

  return (await isWebXrArSupported()) ? 'webxr' : undefined;
}

class ArExportError extends Error {}

function describeFailure(error: unknown): ArFailure {
  if (error instanceof ArExportError) {
    return { kind: 'export', title: 'Couldn’t prepare the model for AR', detail: error.message };
  }

  // A `DOMException` from the session request; not every engine makes it an `Error`.
  const { name, message } =
    typeof error === 'object' && error !== null ? (error as { name?: unknown; message?: unknown }) : {};
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      kind: 'denied',
      title: 'Camera access is off',
      detail: 'Allow camera access for this site in your browser settings, then try again.',
    };
  }

  if (name === 'NotSupportedError') {
    return {
      kind: 'unsupported',
      title: 'AR isn’t available right now',
      detail: 'This device couldn’t start AR. Check that Google Play Services for AR is installed and up to date.',
    };
  }

  return {
    kind: 'launch',
    title: 'Couldn’t open AR',
    detail: typeof message === 'string' && message ? message : 'The AR viewer did not start.',
  };
}

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

async function exportUsdzBlobUrl(runtimeDocument: RuntimeDocument): Promise<string> {
  const result = await runtimeDocument.export('usdz');
  if (!result.success) {
    throw new ArExportError(result.issues[0]?.message ?? 'USDZ export failed');
  }

  if (
    result.files.length !== 1 ||
    !result.files[0].name.endsWith('.usdz') ||
    result.files[0].mimeType !== mimeTypes.usdz
  ) {
    throw new ArExportError(
      `USDZ export expected exactly one .usdz artifact (${mimeTypes.usdz}), received ${result.files.length}: ${result.files.map((file) => `${file.name} (${file.mimeType})`).join(', ')}`,
    );
  }

  const file = result.files[0];
  return URL.createObjectURL(new Blob([file.bytes], { type: file.mimeType }));
}

/**
 * Hook providing AR capability detection, launch and failure recovery.
 *
 * Detection runs on the client after mount, so the server render and hydration never show AR. `canActivateAr` is
 * true only when the device has a launch path and the current model fits it: Quick Look needs the runtime document
 * to export USDZ, and WebXR needs the GLB bytes. Call `activateAr()` from a click handler, because both paths need
 * the person's gesture. A failure stays in `failure` until `dismissFailure()` or the next `activateAr()`.
 */
export function useAr(artifact: Artifact | undefined, runtimeDocument?: RuntimeDocument): ArCapability {
  const [mode, setMode] = useState<ArMode | undefined>(undefined);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isPresenting, setIsPresenting] = useState(false);
  const [failure, setFailure] = useState<ArFailure | undefined>(undefined);
  const presentationRef = useRef<WebXrArPresentation | undefined>(undefined);
  const isUnmountedRef = useRef(false);

  useEffect(() => {
    let isCurrent = true;
    const detect = async (): Promise<void> => {
      const detected = await detectArMode();
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cleanup clears isCurrent before detection resumes
      if (isCurrent) {
        setMode(detected);
      }
    };
    void detect();
    return () => {
      isCurrent = false;
    };
  }, []);

  // End a running session with the viewer that started it.
  // A session still starting is ended when it resolves (see `activateAr`).
  useEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
      void presentationRef.current?.end();
    };
  }, []);

  const glb =
    artifact?.mimeType === 'model/gltf-binary' && typeof artifact.content !== 'string' ? artifact.content : undefined;
  const canActivateAr =
    mode === 'quick-look' ? Boolean(glb) && Boolean(runtimeDocument) : mode === 'webxr' && Boolean(glb);

  const activateAr = useCallback(async () => {
    if (!canActivateAr || isPreparing || isPresenting) {
      return;
    }

    setFailure(undefined);
    setIsPreparing(true);

    if (mode === 'webxr' && glb) {
      try {
        const presentation = await startWebXrAr({
          glb,
          onEnd() {
            presentationRef.current = undefined;
            setIsPresenting(false);
          },
        });
        if (isUnmountedRef.current) {
          // The viewer closed while the session started: nobody is left to show or end it.
          await presentation.end();
          return;
        }

        presentationRef.current = presentation.isActive() ? presentation : undefined;
        setIsPresenting(presentation.isActive());
      } catch (error) {
        setFailure(describeFailure(error));
      } finally {
        setIsPreparing(false);
      }

      return;
    }

    if (!runtimeDocument) {
      setIsPreparing(false);
      return;
    }

    let blobUrl: string | undefined;
    try {
      blobUrl = await exportUsdzBlobUrl(runtimeDocument);
      launchQuickLook(blobUrl);
    } catch (error) {
      setFailure(describeFailure(error));
    } finally {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }

      setIsPreparing(false);
    }
  }, [canActivateAr, glb, isPreparing, isPresenting, mode, runtimeDocument]);

  const dismissFailure = useCallback(() => {
    setFailure(undefined);
  }, []);

  return {
    mode,
    canActivateAr,
    isPreparing,
    isPresenting,
    failure,
    activateAr,
    dismissFailure,
  };
}
