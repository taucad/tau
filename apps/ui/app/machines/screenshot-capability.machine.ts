import { setup, sendTo, fromCallback, assertEvent, enqueueActions, assign } from 'xstate';
import type { AnyActorRef } from 'xstate';
import * as THREE from 'three';
import type { ScreenshotOptions, ScreenshotOverlay, CameraAngle, CompositeScreenshotOptions } from '@taucad/types';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { drawScreenshotOverlay } from '#machines/screenshot-overlay.utils.js';
import {
  applyMatcapToClonedScene,
  disposeCloneOwnedMaterials,
} from '#components/geometry/graphics/three/materials/gltf-matcap.js';
import { applyEdgeMaterialsToClonedScene } from '#components/geometry/graphics/three/materials/gltf-edges.js';
import { ensureMatcapTextureLoaded } from '#components/geometry/graphics/three/materials/matcap-material.js';
import type { RendererInstance } from '#components/geometry/graphics/three/renderer.js';
import { createRenderer } from '#components/geometry/graphics/three/renderer.js';
import type { ViewportCadGl } from '#components/geometry/graphics/three/viewport-cad-renderer.js';
import { isViewportWebGpu } from '#components/geometry/graphics/three/viewport-cad-renderer.js';
import { calculateFovDistanceCompensation } from '#components/geometry/graphics/three/utils/math.utils.js';
import { computeViewFittingZoom } from '#components/geometry/graphics/three/utils/camera.utils.js';
import { defaultStageOptions } from '#components/geometry/graphics/three/stage.js';
import { sceneTag, hasSceneTag, findBySceneTag } from '#components/geometry/graphics/three/utils/scene-tags.js';

// Capture mode discriminator
type CaptureMode = 'threejs' | 'svg';

// Context type
type ScreenshotCapabilityContext = {
  graphicsRef: AnyActorRef;
  gl?: ViewportCadGl;
  scene?: THREE.Scene;
  camera?: THREE.Camera;
  svgElement?: SVGSVGElement;
  captureMode?: CaptureMode;
  queuedCaptureRequests: Array<{
    options?: ScreenshotOptions;
    requestId: string;
    isComposite?: boolean;
  }>;
  isRegistered: boolean;
  registrationError?: string;
};

// Event types
type ScreenshotCapabilityEvent =
  | {
      type: 'registerCapture';
      gl: ViewportCadGl;
      scene: THREE.Scene;
      camera: THREE.Camera;
    }
  | { type: 'registerSvgCapture'; svgElement: SVGSVGElement }
  | { type: 'unregisterCapture'; captureMode?: 'threejs' | 'svg' }
  | { type: 'capture'; options?: ScreenshotOptions; requestId: string }
  | {
      type: 'captureComposite';
      options?: ScreenshotOptions;
      requestId: string;
    }
  | { type: 'screenshotCompleted'; dataUrls: string[]; requestId: string }
  | { type: 'screenshotFailed'; error: string; requestId: string }
  | { type: 'registrationTimeout' };

// Input type
type ScreenshotCapabilityInput = {
  graphicsRef: AnyActorRef;
};

// Default composite options
const defaultCompositeOptions = {
  enabled: true,
  preferredRatio: { columns: 3, rows: 2 },
  showLabels: true,
  padding: 12,
  labelHeight: 24,
  backgroundColor: 'transparent',
  dividerColor: '#666666',
  dividerWidth: 1,
} satisfies CompositeScreenshotOptions;

/**
 * Calculate optimal grid layout for given number of items.
 *
 * @param itemCount - Number of items to arrange in a grid.
 * @param preferredRatio - Target column-to-row ratio.
 * @param preferredRatio.columns - Number of preferred columns.
 * @param preferredRatio.rows - Number of preferred rows.
 * @returns The grid dimensions that best match the preferred ratio.
 */
export function calculateOptimalGrid(
  itemCount: number,
  preferredRatio: {
    columns: number;
    rows: number;
  } = defaultCompositeOptions.preferredRatio,
): { columns: number; rows: number } {
  if (itemCount <= 0) {
    return { columns: 1, rows: 1 };
  }

  if (itemCount === 1) {
    return { columns: 1, rows: 1 };
  }

  const targetRatio = preferredRatio.columns / preferredRatio.rows;

  // Find the best grid layout that can fit all items
  let bestColumns = 1;
  let bestRows = itemCount;
  let bestRatioDiff = Math.abs(bestColumns / bestRows - targetRatio);

  for (let columns = 1; columns <= itemCount; columns++) {
    const rows = Math.ceil(itemCount / columns);
    const ratio = columns / rows;
    const ratioDiff = Math.abs(ratio - targetRatio);

    if (ratioDiff < bestRatioDiff) {
      bestColumns = columns;
      bestRows = rows;
      bestRatioDiff = ratioDiff;
    }
  }

  return { columns: bestColumns, rows: bestRows };
}

/**
 * Create composite image from multiple screenshots.
 *
 * When `overlay` is supplied, the chip is stamped **once** on the assembled
 * composite (top-left of the entire grid) — not per tile. The composite
 * actor passes `suppressOverlay: true` to the per-angle `captureScreenshots`
 * call so tiles arrive un-stamped, then this function stamps the chip on
 * the final canvas. See `docs/research/screenshot-overlay-watermark-architecture.md`
 * Finding 7 for the rationale (per-tile chips would compete with the
 * existing angle labels).
 */
async function createCompositeImage(
  screenshots: Array<{ label: string; dataUrl: string }>,
  options: CompositeScreenshotOptions = defaultCompositeOptions,
  overlay?: ScreenshotOverlay,
): Promise<string> {
  const mergedOptions = {
    ...defaultCompositeOptions,
    ...options,
  };

  const { padding, labelHeight, showLabels, backgroundColor, dividerColor, dividerWidth, preferredRatio } =
    mergedOptions;

  // Create a canvas for the composite image
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not get canvas context');
  }

  // Load all images first
  const images = await Promise.all(
    screenshots.map(async (screenshot) => {
      return new Promise<{ label: string; image: HTMLImageElement }>((resolve, reject) => {
        const img = new globalThis.Image();
        img.addEventListener('load', () => {
          resolve({ label: screenshot.label, image: img });
        });
        img.addEventListener('error', reject);
        img.src = screenshot.dataUrl;
      });
    }),
  );

  if (images.length === 0) {
    throw new Error('No images to create composite image from');
  }

  // Get original dimensions
  const originalWidth = images[0]!.image.width;
  const originalHeight = images[0]!.image.height;

  // Scale down images if they're too large (optimize for composite view)
  const maxImageSize = 600;
  const scale = Math.min(1, maxImageSize / Math.max(originalWidth, originalHeight));
  const imageWidth = Math.round(originalWidth * scale);
  const imageHeight = Math.round(originalHeight * scale);

  // Calculate optimal grid layout
  const { columns, rows } = calculateOptimalGrid(images.length, preferredRatio);

  // Calculate layout dimensions
  const effectiveLabelHeight = showLabels ? labelHeight : 0;
  const effectivePadding = Math.max(padding, Math.round(imageWidth * 0.02));

  canvas.width = columns * imageWidth + (columns + 1) * effectivePadding;
  canvas.height = rows * (imageHeight + effectiveLabelHeight) + (rows + 1) * effectivePadding;

  // Image-smoothing is intentionally function-scoped (no save/restore) — it
  // applies to every `drawImage` in this composite, including the 16 px icon
  // stamped by `drawScreenshotOverlay` further down, which benefits from the
  // same smoothing. Every other state mutation below is wrapped in
  // `save`/`restore` so blocks don't leak into each other.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'low';

  const isTransparent = backgroundColor === 'transparent';
  if (!isTransparent) {
    context.save();
    try {
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
    } finally {
      context.restore();
    }
  }

  // Pass 1 — images. `drawImage` is stateless w.r.t. fill/stroke/text
  // properties, so no save/restore wrapper needed.
  for (const [index, item] of images.entries()) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = effectivePadding + col * (imageWidth + effectivePadding);
    const y = effectivePadding + row * (imageHeight + effectiveLabelHeight + effectivePadding);
    context.drawImage(item.image, x, y, imageWidth, imageHeight);
  }

  // Pass 2 — tile labels. State is scoped via save/restore so the divider
  // stroke and overlay chip below see a clean context (chip needs
  // textAlign='left' to render icon-then-text correctly).
  if (showLabels) {
    context.save();
    try {
      const fontSize = Math.max(12, Math.round(imageHeight * 0.06));
      context.fillStyle = '#000000';
      context.font = `bold ${fontSize}px Arial`;
      context.textAlign = 'center';
      context.textBaseline = 'alphabetic';
      for (const [index, item] of images.entries()) {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = effectivePadding + col * (imageWidth + effectivePadding);
        const y = effectivePadding + row * (imageHeight + effectiveLabelHeight + effectivePadding);
        const labelX = x + imageWidth / 2;
        const labelY = y + imageHeight + effectiveLabelHeight - 5;
        context.fillText(item.label.toUpperCase(), labelX, labelY);
      }
    } finally {
      context.restore();
    }
  }

  if (dividerColor !== 'transparent') {
    context.save();
    try {
      context.strokeStyle = dividerColor;
      context.lineWidth = dividerWidth;
      context.beginPath();
      for (let col = 1; col < columns; col++) {
        const dividerX = effectivePadding + col * (imageWidth + effectivePadding) - effectivePadding / 2;
        context.moveTo(dividerX, effectivePadding);
        context.lineTo(dividerX, canvas.height - effectivePadding);
      }
      for (let row = 1; row < rows; row++) {
        const dividerY =
          effectivePadding + row * (imageHeight + effectiveLabelHeight + effectivePadding) - effectivePadding / 2;
        context.moveTo(effectivePadding, dividerY);
        context.lineTo(canvas.width - effectivePadding, dividerY);
      }
      context.stroke();
    } finally {
      context.restore();
    }
  }

  if (overlay) {
    // Composite canvas is drawn in device pixels (no DPR scale on `context`),
    // so the overlay's internal `scale(pixelRatio)` is paired with `pixelRatio = 1`
    // to keep the chip pinned to a 12 px CSS-equivalent margin in the
    // composite's native coordinate space.
    await drawScreenshotOverlay(context, {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      pixelRatio: 1,
      overlay,
    });
  }

  // Convert canvas to blob with optimized settings for speed
  const outputFormat = 'image/webp';
  const outputQuality = 0.75;

  const blob = await new Promise<Blob | undefined>((resolve) => {
    canvas.toBlob(
      (result) => {
        resolve(result ?? undefined);
      },
      outputFormat,
      outputQuality,
    );
  });

  if (!blob) {
    throw new Error('Failed to create blob from composite canvas');
  }

  // Convert blob to data URL
  const compositeDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(reader.result as string);
    });
    reader.addEventListener('error', reject);
    reader.readAsDataURL(blob);
  });

  return compositeDataUrl;
}

// ---------------------------------------------------------------------------
// SVG Screenshot Capture
// ---------------------------------------------------------------------------

/**
 * SVG style properties that affect rendering and must be inlined for standalone
 * serialisation (CSS classes and custom properties won't resolve in an Image).
 */
const svgStyleProperties = [
  'stroke',
  'fill',
  'opacity',
  'stroke-width',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-opacity',
  'fill-opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'color',
  'visibility',
  'display',
] as const;

/**
 * Recursively inline computed styles onto a cloned SVG tree so the serialised
 * SVG renders identically without access to the page's stylesheets.
 */
function inlineSvgStyles(clone: Element, original: Element): void {
  if (!(original instanceof SVGElement) || !(clone instanceof SVGElement)) {
    return;
  }

  const computed = globalThis.getComputedStyle(original);

  for (const property of svgStyleProperties) {
    const value = computed.getPropertyValue(property);
    if (value) {
      clone.style.setProperty(property, value);
    }
  }

  const originalChildren = [...original.children];
  const cloneChildren = [...clone.children];
  for (const [index, origChild] of originalChildren.entries()) {
    const cloneChild = cloneChildren[index];
    if (cloneChild) {
      inlineSvgStyles(cloneChild, origChild);
    }
  }
}

/**
 * Core SVG screenshot capture logic.
 * Captures the current SVG view as a flat image (camera angles are ignored).
 *
 * When `options.overlay` is set and `suppressOverlay` is false, stamps the
 * top-left chip via {@link drawScreenshotOverlay} on the existing 2D canvas
 * between the SVG raster and the encode step. SVG composites use the same
 * suppress-on-tile + stamp-on-composite contract as the Three.js path —
 * see `docs/research/screenshot-overlay-watermark-architecture.md`.
 */
async function captureSvgScreenshots(
  svgElement: SVGSVGElement,
  options?: ScreenshotOptions,
  suppressOverlay?: boolean,
): Promise<string[]> {
  if (!svgElement.isConnected) {
    throw new Error('Screenshot attempted on disconnected SVG element');
  }

  // Setup default options (camera angles irrelevant for 2D SVG)
  const defaultOptions = {
    aspectRatio: 16 / 9,
    output: {
      format: 'image/png',
      quality: 0.92,
      isPreview: true,
    },
  };

  const config = {
    ...defaultOptions,
    ...options,
    output: {
      ...defaultOptions.output,
      ...options?.output,
    },
  };

  // Calculate target dimensions based on aspect ratio and maxResolution
  const svgRect = svgElement.getBoundingClientRect();
  const targetAspect = config.aspectRatio;
  let width = Math.round(svgRect.height * targetAspect);
  let height = Math.round(svgRect.height);

  if (config.maxResolution) {
    const maxDimension = Math.max(width, height);
    if (maxDimension > config.maxResolution) {
      const rescale = config.maxResolution / maxDimension;
      width = Math.round(width * rescale);
      height = Math.round(height * rescale);
    }
  }

  width = Math.max(width, 1);
  height = Math.max(height, 1);

  // Clone the SVG and inline all computed styles so serialisation is faithful
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  inlineSvgStyles(clone, svgElement);

  // Resolve the container's background colour (the SVG element itself uses
  // Tailwind's `bg-background` which resolves to a CSS variable).
  const { parentElement } = svgElement;
  const bgColor = parentElement ? globalThis.getComputedStyle(parentElement).backgroundColor : 'white';

  // Set explicit dimensions on the serialised clone
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  // Serialise and create a Blob URL
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  const svgBlob = new Blob([svgString], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(svgBlob);

  try {
    // Load into an Image element
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new globalThis.Image();
      image.addEventListener('load', () => {
        resolve(image);
      });
      image.addEventListener('error', () => {
        reject(new Error('Failed to load serialised SVG into Image'));
      });
      image.src = url;
    });

    // Draw onto a canvas
    const canvas = document.createElement('canvas');
    const pixelRatio = globalThis.devicePixelRatio || 1;
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not get 2D canvas context for SVG screenshot');
    }

    context.scale(pixelRatio, pixelRatio);

    // Fill background colour
    if (bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
      context.fillStyle = bgColor;
      context.fillRect(0, 0, width, height);
    }

    context.drawImage(img, 0, 0, width, height);

    if (!suppressOverlay && options?.overlay) {
      // The SVG path has already applied `ctx.scale(pixelRatio, pixelRatio)`.
      // Reset the transform around the overlay so its internal `scale(pixelRatio)`
      // composes against an identity matrix, matching the Three.js path's
      // expectations (overlay reasons in CSS pixels and DPR-scales internally).
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      try {
        await drawScreenshotOverlay(context, {
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          pixelRatio,
          overlay: options.overlay,
        });
      } finally {
        context.restore();
      }
    }

    // Export as data URL via Blob → FileReader (consistent with Three.js path)
    const mimeType = config.output.format;
    const quality = mimeType === 'image/jpeg' || mimeType === 'image/webp' ? config.output.quality : undefined;

    const outputBlob = await new Promise<Blob | undefined>((resolve) => {
      canvas.toBlob(
        (result) => {
          resolve(result ?? undefined);
        },
        mimeType,
        quality,
      );
    });

    if (!outputBlob) {
      throw new Error('Failed to create blob from SVG canvas');
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        resolve(reader.result as string);
      });
      reader.addEventListener('error', reject);
      reader.readAsDataURL(outputBlob);
    });

    // Cleanup canvas memory
    canvas.width = 0;
    canvas.height = 0;

    return [dataUrl];
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------------------
// Three.js Screenshot Capture
// ---------------------------------------------------------------------------

/**
 * Remove objects from a cloned scene that are unsafe to traverse after cloning.
 *
 * TransformControls (and subclasses) override `updateMatrixWorld` and
 * unconditionally access `this.camera`, which is `undefined` on cloned
 * instances because `Object3D.clone()` calls `new this.constructor()`
 * without arguments.
 */
export function removeCloneUnsafeObjects(scene: THREE.Scene): void {
  const toRemove: THREE.Object3D[] = [];
  scene.traverse((object) => {
    if ('isTransformControls' in object) {
      toRemove.push(object);
    }
  });
  for (const object of toRemove) {
    object.removeFromParent();
  }
}

/**
 * Encode a freshly-rendered 3D screenshot canvas to a dataURL, optionally
 * stamping an overlay chip first. The 3D canvas already owns a WebGL or
 * WebGPU context, so a 2D context cannot be acquired from it directly —
 * we blit into a fresh 2D canvas, draw the overlay there, and encode from
 * the 2D canvas. When `overlay` is undefined, we skip the blit entirely
 * and return the 3D canvas's `toDataURL` to preserve the original encode
 * path for non-overlay callers (zero behavioural change).
 */
async function encodeScreenshotCanvas(args: {
  screenshotCanvas: HTMLCanvasElement;
  format: string;
  quality: number;
  overlay: ScreenshotOverlay | undefined;
  pixelRatio: number;
}): Promise<string> {
  const { screenshotCanvas, format, quality, overlay, pixelRatio } = args;
  if (!overlay) {
    return screenshotCanvas.toDataURL(format, quality);
  }

  const stampedCanvas = document.createElement('canvas');
  stampedCanvas.width = screenshotCanvas.width;
  stampedCanvas.height = screenshotCanvas.height;
  try {
    const stampedContext = stampedCanvas.getContext('2d');
    if (!stampedContext) {
      // Couldn't get a 2D context — fall back to the un-stamped capture so
      // the screenshot pipeline never fails because of overlay setup.
      return screenshotCanvas.toDataURL(format, quality);
    }
    stampedContext.drawImage(screenshotCanvas, 0, 0);
    await drawScreenshotOverlay(stampedContext, {
      canvasWidth: stampedCanvas.width,
      canvasHeight: stampedCanvas.height,
      pixelRatio,
      overlay,
    });
    return stampedCanvas.toDataURL(format, quality);
  } finally {
    stampedCanvas.width = 0;
    stampedCanvas.height = 0;
  }
}

/**
 * Core screenshot capture logic.
 * Renders each camera angle into a temporary canvas and returns data URLs.
 *
 * When `options.overlay` is set and `suppressOverlay` is false (single-view
 * path), each rendered frame is blitted into a fresh 2D canvas and stamped
 * with a top-left chip via {@link drawScreenshotOverlay} before encoding.
 * The composite path passes `suppressOverlay: true` so the chip is drawn
 * once on the assembled grid instead of once per tile — see
 * `docs/research/screenshot-overlay-watermark-architecture.md` Finding 7.
 */
// oxlint-disable-next-line eslint(complexity) -- multi-angle capture composes camera fitting, cropping, DPI, cloning, matcap, and teardown in one tool entry point
async function captureScreenshots({
  gl,
  scene,
  camera,
  options,
  suppressOverlay,
}: {
  gl: ViewportCadGl;
  scene: THREE.Scene;
  camera: THREE.Camera;
  options?: ScreenshotOptions;
  suppressOverlay?: boolean;
}): Promise<string[]> {
  if (!gl.domElement.isConnected) {
    throw new Error('Screenshot attempted on disconnected canvas - canvas may have been recreated');
  }

  const defaultOptions = {
    aspectRatio: 16 / 9,
    zoomLevel: 1.25,
    cameraAngles: [{ phi: undefined, theta: undefined }] as CameraAngle[],
    output: {
      format: 'image/png',
      quality: 0.92,
      isPreview: true,
    },
  } satisfies ScreenshotOptions;

  const config = {
    ...defaultOptions,
    ...options,
    output: {
      ...defaultOptions.output,
      ...options?.output,
    },
  };

  if (config.cameraAngles.length === 0) {
    config.cameraAngles = defaultOptions.cameraAngles;
  }

  const originalHeight = gl.domElement.height;

  const targetAspect = config.aspectRatio;
  let width = Math.round(originalHeight * targetAspect);
  let height = originalHeight;

  if (config.maxResolution) {
    const maxDimension = Math.max(width, height);
    if (maxDimension > config.maxResolution) {
      const scale = config.maxResolution / maxDimension;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
  }

  const screenshotCanvas = document.createElement('canvas');
  screenshotCanvas.width = width;
  screenshotCanvas.height = height;

  let screenshotRenderer: RendererInstance | undefined;

  try {
    const screenshotBackend: ResolvedGraphicsBackend = isViewportWebGpu(gl) ? 'webgpu' : 'webgl';
    screenshotRenderer = await createRenderer('screenshot', screenshotBackend, screenshotCanvas);

    screenshotRenderer.setSize(width, height, false);

    const useHighDpi = config.cameraAngles.length === 1;
    const pixelRatio = useHighDpi ? gl.getPixelRatio() : 1;
    screenshotRenderer.setPixelRatio(pixelRatio);

    screenshotRenderer.outputColorSpace = gl.outputColorSpace;
    screenshotRenderer.toneMapping = THREE.NoToneMapping;
    screenshotRenderer.toneMappingExposure = 1;
    if (screenshotRenderer instanceof THREE.WebGLRenderer && gl instanceof THREE.WebGLRenderer) {
      screenshotRenderer.localClippingEnabled = gl.localClippingEnabled;
    }

    const dataUrls: string[] = [];

    const screenshotScene = scene.clone();
    removeCloneUnsafeObjects(screenshotScene);

    if (config.output.isPreview) {
      screenshotScene.traverse((object) => {
        if (hasSceneTag(object, sceneTag.previewOnly)) {
          object.visible = false;
        }
      });
    }

    const matcapTexture = await ensureMatcapTextureLoaded();

    // Track every clone-owned material so we can dispose only the materials we
    // allocated — never the live viewport's shared `Line2NodeMaterial` /
    // matcap instances. See `docs/research/screenshot-viewport-shared-material-state-bleed.md`.
    const cloneOwnedMaterials = new Set<THREE.Material>();
    for (const material of applyMatcapToClonedScene(screenshotScene, matcapTexture, {
      tint: 1,
      backend: screenshotBackend,
    })) {
      cloneOwnedMaterials.add(material);
    }
    const screenshotResolution = new THREE.Vector2(width, height);
    for (const material of applyEdgeMaterialsToClonedScene(screenshotScene, {
      backend: screenshotBackend,
      resolution: screenshotResolution,
    })) {
      cloneOwnedMaterials.add(material);
    }

    screenshotScene.environment = null;
    screenshotScene.environmentIntensity = 0;

    // Temporarily hide section-view helpers (cap planes, stencil groups) so they
    // don't inflate the bounding box — their large plane geometry would push the
    // camera too far away, producing blank screenshots.
    const sectionViewHelpers = findBySceneTag(screenshotScene, sceneTag.sectionViewHelper);
    for (const helper of sectionViewHelpers) {
      helper.visible = false;
    }

    const boundingBox = new THREE.Box3().setFromObject(screenshotScene);

    for (const helper of sectionViewHelpers) {
      helper.visible = true;
    }
    const geometryCenter = new THREE.Vector3();
    const boundingSphere = new THREE.Sphere();
    boundingBox.getCenter(geometryCenter);
    boundingBox.getBoundingSphere(boundingSphere);
    const geometryRadius = boundingSphere.radius > 0 ? boundingSphere.radius : 1000;

    for (const cameraAngle of config.cameraAngles) {
      const screenshotCamera = (camera as THREE.PerspectiveCamera).clone();

      const screenshotFov = 45;
      const zoomCompensation = calculateFovDistanceCompensation(screenshotFov, screenshotCamera.fov, 1);
      screenshotCamera.fov = screenshotFov;
      screenshotCamera.zoom = config.zoomLevel * zoomCompensation;
      screenshotCamera.aspect = config.aspectRatio;

      if (cameraAngle.phi !== undefined && cameraAngle.theta !== undefined) {
        const standardFov = 60;
        const adjustedOffsetRatio =
          defaultStageOptions.offsetRatio * calculateFovDistanceCompensation(standardFov, screenshotFov, 1);
        const distance = geometryRadius * adjustedOffsetRatio;

        const phiRad = (cameraAngle.phi * Math.PI) / 180;
        const thetaRad = (cameraAngle.theta * Math.PI) / 180;

        const upVector = THREE.Object3D.DEFAULT_UP.clone();

        let ox: number;
        let oy: number;
        let oz: number;

        if (upVector.z === 1) {
          ox = distance * Math.sin(phiRad) * Math.cos(thetaRad);
          oy = distance * Math.sin(phiRad) * Math.sin(thetaRad);
          oz = distance * Math.cos(phiRad);
        } else if (upVector.y === 1) {
          ox = distance * Math.sin(phiRad) * Math.cos(thetaRad);
          oz = distance * Math.sin(phiRad) * Math.sin(thetaRad);
          oy = distance * Math.cos(phiRad);
        } else {
          oy = distance * Math.sin(phiRad) * Math.cos(thetaRad);
          oz = distance * Math.sin(phiRad) * Math.sin(thetaRad);
          ox = distance * Math.cos(phiRad);
        }

        screenshotCamera.position.set(geometryCenter.x + ox, geometryCenter.y + oy, geometryCenter.z + oz);
        screenshotCamera.lookAt(geometryCenter);

        screenshotCamera.zoom = computeViewFittingZoom({
          cameraPosition: screenshotCamera.position,
          target: geometryCenter,
          boundingBox,
          fovDeg: screenshotFov,
          aspectRatio: config.aspectRatio,
        });
      }

      screenshotCamera.updateProjectionMatrix();
      screenshotCamera.updateMatrixWorld(true);

      screenshotRenderer.render(screenshotScene, screenshotCamera);

      // oxlint-disable-next-line no-await-in-loop -- sequential await intentional: the shared `screenshotCanvas` is overwritten on every render, so the overlay blit must read it before the next loop iteration starts
      const stampedDataUrl = await encodeScreenshotCanvas({
        screenshotCanvas,
        format: config.output.format,
        quality: config.output.quality,
        overlay: !suppressOverlay && options?.overlay ? options.overlay : undefined,
        pixelRatio,
      });
      dataUrls.push(stampedDataUrl);
    }

    disposeCloneOwnedMaterials(cloneOwnedMaterials);

    return dataUrls;
  } finally {
    if (screenshotRenderer !== undefined) {
      screenshotRenderer.dispose();
      if (!isViewportWebGpu(screenshotRenderer)) {
        screenshotRenderer.forceContextLoss();
      }
    }

    screenshotCanvas.width = 0;
    screenshotCanvas.height = 0;
  }
}

/**
 * Screenshot Capability Machine
 *
 * Bridges Three.js screenshot functionality with the graphics machine.
 * Handles registration of screenshot capture function and proxies requests.
 * Queues capture requests until camera is registered with a 5-second timeout.
 * Supports multiple camera angles in a single request for efficient batch operations.
 * Supports composite image creation for multi-angle screenshots.
 */
export const screenshotCapabilityMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    context: {} as ScreenshotCapabilityContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    events: {} as ScreenshotCapabilityEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    input: {} as ScreenshotCapabilityInput,
  },
  actors: {
    captureScreenshot: fromCallback<
      | { type: 'screenshotCompleted'; dataUrls: string[]; requestId: string }
      | { type: 'screenshotFailed'; error: string; requestId: string },
      {
        gl: ViewportCadGl;
        scene: THREE.Scene;
        camera: THREE.Camera;
        options?: ScreenshotOptions;
        requestId: string;
      }
    >(({ input, sendBack }) => {
      const { gl, scene, camera, options, requestId } = input;

      (async () => {
        try {
          const dataUrls = await captureScreenshots({ gl, scene, camera, options });
          sendBack({ type: 'screenshotCompleted', dataUrls, requestId });
        } catch (error) {
          sendBack({
            type: 'screenshotFailed',
            error: error instanceof Error ? error.message : 'Screenshot failed',
            requestId,
          });
        }
      })();
    }),

    captureCompositeScreenshot: fromCallback<
      | { type: 'screenshotCompleted'; dataUrls: string[]; requestId: string }
      | { type: 'screenshotFailed'; error: string; requestId: string },
      {
        gl: ViewportCadGl;
        scene: THREE.Scene;
        camera: THREE.Camera;
        options?: ScreenshotOptions;
        requestId: string;
      }
    >(({ input, sendBack }) => {
      const { gl, scene, camera, options, requestId } = input;

      (async () => {
        try {
          // Suppress per-tile overlay so the chip only appears once on the
          // assembled composite (createCompositeImage stamps it below).
          const dataUrls = await captureScreenshots({ gl, scene, camera, options, suppressOverlay: true });
          const compositeOptions = options?.composite ?? defaultCompositeOptions;

          const screenshots = dataUrls.map((dataUrl, index) => {
            const cameraAngle = options?.cameraAngles?.[index];
            const label = cameraAngle?.label ?? `φ${cameraAngle?.phi}° θ${cameraAngle?.theta}°`;
            return { label, dataUrl };
          });

          const compositeDataUrl = await createCompositeImage(screenshots, compositeOptions, options?.overlay);

          sendBack({
            type: 'screenshotCompleted',
            dataUrls: [compositeDataUrl],
            requestId,
          });
        } catch (error) {
          sendBack({
            type: 'screenshotFailed',
            error: error instanceof Error ? error.message : 'Composite screenshot failed',
            requestId,
          });
        }
      })();
    }),

    // SVG capture actors (flat-image only, camera angles ignored)
    captureSvgScreenshot: fromCallback<
      | { type: 'screenshotCompleted'; dataUrls: string[]; requestId: string }
      | { type: 'screenshotFailed'; error: string; requestId: string },
      {
        svgElement: SVGSVGElement;
        options?: ScreenshotOptions;
        requestId: string;
      }
    >(({ input, sendBack }) => {
      const { svgElement, options, requestId } = input;

      (async () => {
        try {
          const dataUrls = await captureSvgScreenshots(svgElement, options);
          sendBack({ type: 'screenshotCompleted', dataUrls, requestId });
        } catch (error) {
          sendBack({
            type: 'screenshotFailed',
            error: error instanceof Error ? error.message : 'SVG screenshot failed',
            requestId,
          });
        }
      })();
    }),

    captureSvgCompositeScreenshot: fromCallback<
      | { type: 'screenshotCompleted'; dataUrls: string[]; requestId: string }
      | { type: 'screenshotFailed'; error: string; requestId: string },
      {
        svgElement: SVGSVGElement;
        options?: ScreenshotOptions;
        requestId: string;
      }
    >(({ input, sendBack }) => {
      const { svgElement, options, requestId } = input;

      (async () => {
        try {
          const dataUrls = await captureSvgScreenshots(svgElement, options, /* suppressOverlay */ true);
          const compositeOptions = options?.composite ?? defaultCompositeOptions;

          const screenshots = dataUrls.map((dataUrl) => ({
            label: '2D View',
            dataUrl,
          }));

          const compositeDataUrl = await createCompositeImage(screenshots, compositeOptions, options?.overlay);
          sendBack({
            type: 'screenshotCompleted',
            dataUrls: [compositeDataUrl],
            requestId,
          });
        } catch (error) {
          sendBack({
            type: 'screenshotFailed',
            error: error instanceof Error ? error.message : 'SVG composite screenshot failed',
            requestId,
          });
        }
      })();
    }),
  },
  actions: {
    registerWithGraphics: enqueueActions(({ enqueue, context, event, self }) => {
      assertEvent(event, 'registerCapture');
      enqueue.assign({
        gl: event.gl,
        scene: event.scene,
        camera: event.camera,
        captureMode: 'threejs',
        isRegistered: true,
      });
      enqueue.sendTo(context.graphicsRef, {
        type: 'registerScreenshotCapability',
        actorRef: self,
      });
    }),
    registerSvgWithGraphics: enqueueActions(({ enqueue, context, event, self }) => {
      assertEvent(event, 'registerSvgCapture');
      enqueue.assign({
        svgElement: event.svgElement,
        captureMode: 'svg',
        isRegistered: true,
      });
      enqueue.sendTo(context.graphicsRef, {
        type: 'registerScreenshotCapability',
        actorRef: self,
      });
    }),
    unregisterFromGraphics: sendTo(({ context }) => context.graphicsRef, {
      type: 'unregisterScreenshotCapability',
    }),
    unregisterCapture: enqueueActions(({ enqueue, context }) => {
      enqueue.assign({
        gl: undefined,
        scene: undefined,
        camera: undefined,
        svgElement: undefined,
        captureMode: undefined,
        isRegistered: false,
      });
      enqueue.sendTo(context.graphicsRef, {
        type: 'unregisterScreenshotCapability',
      });
    }),
    forwardResult: sendTo(
      ({ context }) => context.graphicsRef,
      ({ event }) => event,
    ),
    queueCaptureRequest: assign({
      queuedCaptureRequests({ context, event }) {
        assertEvent(event, ['capture', 'captureComposite']);
        const isComposite = event.type === 'captureComposite';
        return [...context.queuedCaptureRequests, { options: event.options, requestId: event.requestId, isComposite }];
      },
    }),
    processQueuedRequests: enqueueActions(({ enqueue, context, self }) => {
      // Process all queued capture requests
      for (const request of context.queuedCaptureRequests) {
        const eventType = request.isComposite ? 'captureComposite' : 'capture';
        enqueue.sendTo(self, {
          type: eventType,
          options: request.options,
          requestId: request.requestId,
        });
      }

      // Clear the queue
      enqueue.assign({
        queuedCaptureRequests: [],
      });
    }),
    failQueuedRequests: enqueueActions(({ enqueue, context }) => {
      // Fail all queued requests due to registration timeout
      for (const request of context.queuedCaptureRequests) {
        enqueue.sendTo(context.graphicsRef, {
          type: 'screenshotFailed',
          error: 'Screenshot capability registration timeout',
          requestId: request.requestId,
        });
      }

      // Clear the queue
      enqueue.assign({
        queuedCaptureRequests: [],
        registrationError: 'Registration timeout after 5 seconds',
      });
    }),
  },
  guards: {
    isRegistered: ({ context }) => context.isRegistered,
    hasQueuedRequests: ({ context }) => context.queuedCaptureRequests.length > 0,
    isSvgMode: ({ context }) => context.captureMode === 'svg',
    /**
     * Guard for unregisterCapture: skip if the event's captureMode doesn't match
     * the current captureMode. This prevents a deferred Three.js Canvas teardown
     * (which runs in a separate React reconciler with async timing) from undoing
     * a newer SVG registration, and vice versa.
     */
    shouldUnregister({ context, event }) {
      assertEvent(event, 'unregisterCapture');
      return !event.captureMode || event.captureMode === context.captureMode;
    },
  },
  delays: {
    registrationTimeout: 5000,
  },
}).createMachine({
  id: 'screenshotCapability',
  context: ({ input }) => ({
    graphicsRef: input.graphicsRef,
    gl: undefined,
    scene: undefined,
    camera: undefined,
    svgElement: undefined,
    captureMode: undefined,
    queuedCaptureRequests: [],
    isRegistered: false,
    registrationError: undefined,
  }),
  initial: 'waitingForRegistration',
  states: {
    // Waiting for capture registration (Three.js or SVG) with timeout
    waitingForRegistration: {
      after: {
        registrationTimeout: {
          target: 'registrationFailed',
          actions: 'failQueuedRequests',
        },
      },
      on: {
        registerCapture: [
          {
            guard: 'hasQueuedRequests',
            target: 'registered',
            actions: ['registerWithGraphics', 'processQueuedRequests'],
          },
          {
            target: 'registered',
            actions: 'registerWithGraphics',
          },
        ],
        registerSvgCapture: [
          {
            guard: 'hasQueuedRequests',
            target: 'registered',
            actions: ['registerSvgWithGraphics', 'processQueuedRequests'],
          },
          {
            target: 'registered',
            actions: 'registerSvgWithGraphics',
          },
        ],
        capture: {
          actions: 'queueCaptureRequest',
        },
        captureComposite: {
          actions: 'queueCaptureRequest',
        },
      },
    },
    registered: {
      on: {
        capture: [{ guard: 'isSvgMode', target: 'capturingSvg' }, { target: 'capturing' }],
        captureComposite: [{ guard: 'isSvgMode', target: 'capturingCompositeSvg' }, { target: 'capturingComposite' }],
        // Allow re-registration when canvas is recreated
        registerCapture: {
          actions: 'registerWithGraphics',
        },
        registerSvgCapture: {
          actions: 'registerSvgWithGraphics',
        },
        unregisterCapture: [
          {
            guard: { type: 'shouldUnregister' },
            target: 'waitingForRegistration',
            actions: 'unregisterCapture',
          },
        ],
      },
    },
    capturing: {
      invoke: {
        id: 'captureScreenshot',
        src: 'captureScreenshot',
        input({ context, event }) {
          assertEvent(event, 'capture');
          return {
            gl: context.gl!,
            scene: context.scene!,
            camera: context.camera!,
            options: event.options,
            requestId: event.requestId,
          };
        },
      },
      on: {
        screenshotCompleted: {
          target: 'registered',
          actions: 'forwardResult',
        },
        screenshotFailed: {
          target: 'registered',
          actions: 'forwardResult',
        },
        capture: {
          actions: 'queueCaptureRequest',
        },
        captureComposite: {
          actions: 'queueCaptureRequest',
        },
        unregisterCapture: [
          {
            guard: { type: 'shouldUnregister' },
            target: 'waitingForRegistration',
            actions: 'unregisterCapture',
          },
        ],
      },
    },
    capturingComposite: {
      invoke: {
        id: 'captureCompositeScreenshot',
        src: 'captureCompositeScreenshot',
        input({ context, event }) {
          assertEvent(event, 'captureComposite');
          return {
            gl: context.gl!,
            scene: context.scene!,
            camera: context.camera!,
            options: event.options,
            requestId: event.requestId,
          };
        },
      },
      on: {
        screenshotCompleted: {
          target: 'registered',
          actions: 'forwardResult',
        },
        screenshotFailed: {
          target: 'registered',
          actions: 'forwardResult',
        },
        capture: {
          actions: 'queueCaptureRequest',
        },
        captureComposite: {
          actions: 'queueCaptureRequest',
        },
        unregisterCapture: [
          {
            guard: { type: 'shouldUnregister' },
            target: 'waitingForRegistration',
            actions: 'unregisterCapture',
          },
        ],
      },
    },
    // SVG capture states (flat-image only, no camera angle support)
    capturingSvg: {
      invoke: {
        id: 'captureSvgScreenshot',
        src: 'captureSvgScreenshot',
        input({ context, event }) {
          assertEvent(event, 'capture');
          return {
            svgElement: context.svgElement!,
            options: event.options,
            requestId: event.requestId,
          };
        },
      },
      on: {
        screenshotCompleted: {
          target: 'registered',
          actions: 'forwardResult',
        },
        screenshotFailed: {
          target: 'registered',
          actions: 'forwardResult',
        },
        capture: {
          actions: 'queueCaptureRequest',
        },
        captureComposite: {
          actions: 'queueCaptureRequest',
        },
        unregisterCapture: [
          {
            guard: { type: 'shouldUnregister' },
            target: 'waitingForRegistration',
            actions: 'unregisterCapture',
          },
        ],
      },
    },
    capturingCompositeSvg: {
      invoke: {
        id: 'captureSvgCompositeScreenshot',
        src: 'captureSvgCompositeScreenshot',
        input({ context, event }) {
          assertEvent(event, 'captureComposite');
          return {
            svgElement: context.svgElement!,
            options: event.options,
            requestId: event.requestId,
          };
        },
      },
      on: {
        screenshotCompleted: {
          target: 'registered',
          actions: 'forwardResult',
        },
        screenshotFailed: {
          target: 'registered',
          actions: 'forwardResult',
        },
        capture: {
          actions: 'queueCaptureRequest',
        },
        captureComposite: {
          actions: 'queueCaptureRequest',
        },
        unregisterCapture: [
          {
            guard: { type: 'shouldUnregister' },
            target: 'waitingForRegistration',
            actions: 'unregisterCapture',
          },
        ],
      },
    },
    registrationFailed: {
      on: {
        registerCapture: {
          target: 'registered',
          actions: 'registerWithGraphics',
        },
        registerSvgCapture: {
          target: 'registered',
          actions: 'registerSvgWithGraphics',
        },
        capture: {
          actions: enqueueActions(({ enqueue, context, event }) => {
            assertEvent(event, 'capture');
            // Immediately fail new capture requests when registration has failed
            enqueue.sendTo(context.graphicsRef, {
              type: 'screenshotFailed',
              error: context.registrationError ?? 'Screenshot capability not available',
              requestId: event.requestId,
            });
          }),
        },
        captureComposite: {
          actions: enqueueActions(({ enqueue, context, event }) => {
            assertEvent(event, 'captureComposite');
            // Immediately fail new capture requests when registration has failed
            enqueue.sendTo(context.graphicsRef, {
              type: 'screenshotFailed',
              error: context.registrationError ?? 'Screenshot capability not available',
              requestId: event.requestId,
            });
          }),
        },
      },
    },
  },
});
