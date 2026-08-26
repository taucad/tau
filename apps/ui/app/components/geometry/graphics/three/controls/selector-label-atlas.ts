import {
  CanvasTexture,
  Float32BufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import type { MeshBasicMaterial, Object3D } from 'three';
import { createViewportControlSelectorLabelMaterial } from '#components/geometry/graphics/three/materials/viewport-control-material.js';

export const selectorLabelAtlasLabels = [
  'Top',
  'Bottom',
  'Front',
  'Back',
  'Left',
  'Right',
  'XY',
  'YX',
  'XZ',
  'ZX',
  'YZ',
  'ZY',
] as const;

export type SelectorLabelAtlasLabel = (typeof selectorLabelAtlasLabels)[number];

const labelSet = new Set<string>(selectorLabelAtlasLabels);
const columns = 4;
const rows = 4;
const cellWidth = 512;
const cellHeight = 256;
const atlasWidth = columns * cellWidth;
const atlasHeight = rows * cellHeight;
const labelPlaneWidth = 0.82;
const labelPlaneHeight = 0.52;
const labelFontFamily = 'Geist Mono, monospace';
const labelMaxFontSize = 154;
const labelMinFontSize = 96;
const labelHorizontalPadding = 36;
const labelVerticalPadding = 28;
const labelFontLoadShorthand = `700 ${labelMaxFontSize}px 'Geist Mono'`;

let cachedTexture: CanvasTexture | undefined;
let cachedMaterial: MeshBasicMaterial | undefined;
let fontLoadPromise: Promise<void> | undefined;

function keepSharedResourceAlive(resource: { dispose(): void }): void {
  resource.dispose = () => {
    // The selector atlas is a module-owned singleton shared across transient
    // selector mounts; R3F must not dispose it when one selector subtree unmounts.
  };
}

function createAtlasCanvas(): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new TypeError('SelectorLabelAtlas: document is required to create the label atlas texture.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = atlasWidth;
  canvas.height = atlasHeight;

  return canvas;
}

function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | undefined {
  try {
    return canvas.getContext('2d') ?? undefined;
  } catch {
    return undefined;
  }
}

function getLargestReadableFontSize(context: CanvasRenderingContext2D, label: string): number {
  const maxWidth = cellWidth - labelHorizontalPadding * 2;
  const maxHeight = cellHeight - labelVerticalPadding * 2;

  for (let fontSize = labelMaxFontSize; fontSize >= labelMinFontSize; fontSize -= 2) {
    context.font = `700 ${fontSize}px ${labelFontFamily}`;
    const metrics = context.measureText(label);
    const textHeight =
      Math.abs(metrics.actualBoundingBoxAscent) + Math.abs(metrics.actualBoundingBoxDescent) || fontSize;

    if (metrics.width <= maxWidth && textHeight <= maxHeight) {
      return fontSize;
    }
  }

  return labelMinFontSize;
}

function drawSelectorLabelAtlas(canvas: HTMLCanvasElement): void {
  const context = getContext(canvas);

  if (!context || typeof context.fillText !== 'function') {
    return;
  }

  context.clearRect(0, 0, atlasWidth, atlasHeight);
  context.fillStyle = '#000000';
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  for (const [index, label] of selectorLabelAtlasLabels.entries()) {
    const column = index % columns;
    const row = Math.trunc(index / columns);
    const fontSize = getLargestReadableFontSize(context, label);
    context.font = `700 ${fontSize}px ${labelFontFamily}`;
    context.fillText(label, column * cellWidth + cellWidth / 2, row * cellHeight + cellHeight / 2);
  }
}

async function loadSelectorLabelFont(): Promise<void> {
  // oxlint-disable-next-line typescript-eslint/no-unnecessary-condition -- defensive runtime guard: SSR and jsdom can lack FontFaceSet despite DOM typings
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;

  if (!fonts || typeof fonts.load !== 'function') {
    return;
  }

  try {
    await fonts.load(labelFontLoadShorthand);
  } catch {
    // Falling back to the system monospace is acceptable; stale fallback text is
    // worse than a failed font preload, so callers still redraw the atlas.
  }
}

export function isSelectorLabelAtlasLabel(label: string): label is SelectorLabelAtlasLabel {
  return labelSet.has(label);
}

export function getSelectorLabelAtlasTexture(): CanvasTexture {
  if (cachedTexture) {
    return cachedTexture;
  }

  const canvas = createAtlasCanvas();
  drawSelectorLabelAtlas(canvas);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  keepSharedResourceAlive(texture);
  cachedTexture = texture;

  return texture;
}

async function redrawSelectorLabelAtlasAfterFontLoad(): Promise<void> {
  await loadSelectorLabelFont();
  const texture = getSelectorLabelAtlasTexture();
  drawSelectorLabelAtlas(texture.image);
  texture.needsUpdate = true;
}

export async function ensureSelectorLabelAtlasReady(): Promise<void> {
  fontLoadPromise ??= redrawSelectorLabelAtlasAfterFontLoad();

  await fontLoadPromise;
}

export function getSelectorLabelAtlasMaterial(): MeshBasicMaterial {
  if (!cachedMaterial) {
    cachedMaterial = createViewportControlSelectorLabelMaterial({ map: getSelectorLabelAtlasTexture() });
    keepSharedResourceAlive(cachedMaterial);
  }

  return cachedMaterial;
}

export function createSelectorLabelGeometry(label: SelectorLabelAtlasLabel): PlaneGeometry {
  const index = selectorLabelAtlasLabels.indexOf(label);
  const column = index % columns;
  const row = Math.trunc(index / columns);
  const u0 = (column * cellWidth) / atlasWidth;
  const u1 = ((column + 1) * cellWidth) / atlasWidth;
  const vTop = 1 - (row * cellHeight) / atlasHeight;
  const vBottom = 1 - ((row + 1) * cellHeight) / atlasHeight;
  const geometry = new PlaneGeometry(labelPlaneWidth, labelPlaneHeight);

  geometry.setAttribute('uv', new Float32BufferAttribute([u0, vTop, u1, vTop, u0, vBottom, u1, vBottom], 2));
  geometry.userData = { ...geometry.userData, selectorLabel: label };

  return geometry;
}

export const disabledSelectorLabelRaycast: Object3D['raycast'] = () => {
  // Labels are visual ink on the selector body; the tile remains the hit target.
};

export function __resetSelectorLabelAtlasForTests(): void {
  cachedTexture = undefined;
  cachedMaterial = undefined;
  fontLoadPromise = undefined;
}
