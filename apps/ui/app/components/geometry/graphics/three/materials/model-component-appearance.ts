import { Color } from 'three';
import type { Material } from 'three';
import type { ModelInteractionUnitState } from '#machines/model-interaction.machine.js';

export const modelHighlightAppearance = {
  color: 0x9b_e7_ff,
  emissiveIntensity: 0.16,
  colorMix: 0.12,
  capTintMix: 0.4,
} as const;

export const modelHoverAppearance = {
  color: modelHighlightAppearance.color,
  emissiveIntensity: 0.045,
  colorMix: 0.035,
  capTintMix: 0.16,
} as const;

export type ModelMaterialAppearanceSnapshot = Readonly<{
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  color?: Color;
  emissive?: Color;
  emissiveIntensity?: number;
}>;

export type ModelComponentEmphasis = 'none' | 'hover' | 'selected' | 'focused';

export type ModelMaterialAppearanceState = Readonly<{
  opacity: number;
  emphasis: ModelComponentEmphasis;
}>;

type MaterialWithColor = Material & { color: Color };
type MaterialWithEmissive = Material & { emissive: Color };
type MaterialWithEmissiveIntensity = Material & { emissiveIntensity: number };

const highlightedColor = new Color(modelHighlightAppearance.color);
const materialAppearanceSnapshots = new WeakMap<Material, ModelMaterialAppearanceSnapshot>();
const hexColorSpace = 16_777_216;
const redChannelDivisor = 65_536;
const greenChannelDivisor = 256;
const channelSize = 256;
const defaultModelMaterialBaseTintHex = 0xdd_dd_dd;

function hasColor(material: Material): material is MaterialWithColor {
  return 'color' in material && material.color instanceof Color;
}

function hasEmissive(material: Material): material is MaterialWithEmissive {
  return 'emissive' in material && material.emissive instanceof Color;
}

function hasEmissiveIntensity(material: Material): material is MaterialWithEmissiveIntensity {
  return 'emissiveIntensity' in material && typeof material.emissiveIntensity === 'number';
}

function getAppearanceForEmphasis(
  emphasis: ModelComponentEmphasis,
): typeof modelHoverAppearance | typeof modelHighlightAppearance | undefined {
  if (emphasis === 'hover') {
    return modelHoverAppearance;
  }
  if (emphasis === 'selected' || emphasis === 'focused') {
    return modelHighlightAppearance;
  }
  return undefined;
}

export function captureModelMaterialAppearance(material: Material): ModelMaterialAppearanceSnapshot {
  return {
    opacity: material.opacity,
    transparent: material.transparent,
    depthWrite: material.depthWrite,
    ...(hasColor(material) ? { color: material.color.clone() } : {}),
    ...(hasEmissive(material) ? { emissive: material.emissive.clone() } : {}),
    ...(hasEmissiveIntensity(material) ? { emissiveIntensity: material.emissiveIntensity } : {}),
  };
}

export function getOrCaptureModelMaterialAppearance(material: Material): ModelMaterialAppearanceSnapshot {
  const snapshot = materialAppearanceSnapshots.get(material);
  if (snapshot) {
    return snapshot;
  }

  const nextSnapshot = captureModelMaterialAppearance(material);
  materialAppearanceSnapshots.set(material, nextSnapshot);
  return nextSnapshot;
}

export function getCapturedModelMaterialAppearance(material: Material): ModelMaterialAppearanceSnapshot | undefined {
  return materialAppearanceSnapshots.get(material);
}

export function updateCapturedModelMaterialBaseColor(
  material: Material,
  colorHex: number,
): ModelMaterialAppearanceSnapshot {
  const snapshot = materialAppearanceSnapshots.get(material) ?? captureModelMaterialAppearance(material);
  const nextSnapshot = {
    ...snapshot,
    color: new Color(colorHex),
  };
  materialAppearanceSnapshots.set(material, nextSnapshot);
  return nextSnapshot;
}

export function resolveModelMaterialBaseTintHex(
  material: Material,
  fallbackTintHex = defaultModelMaterialBaseTintHex,
): number {
  const snapshot = getCapturedModelMaterialAppearance(material);
  if (snapshot?.color) {
    return snapshot.color.getHex();
  }

  if (hasColor(material)) {
    return material.color.getHex();
  }

  return fallbackTintHex;
}

export function restoreModelMaterialAppearance(material: Material, snapshot: ModelMaterialAppearanceSnapshot): void {
  material.opacity = snapshot.opacity;
  material.transparent = snapshot.transparent;
  material.depthWrite = snapshot.depthWrite;

  if (snapshot.color && hasColor(material)) {
    material.color.copy(snapshot.color);
  }

  if (snapshot.emissive && hasEmissive(material)) {
    material.emissive.copy(snapshot.emissive);
  }

  if (snapshot.emissiveIntensity !== undefined && hasEmissiveIntensity(material)) {
    material.emissiveIntensity = snapshot.emissiveIntensity;
  }
}

export function applyModelMaterialOpacityOverride(material: Material, opacity: number): void {
  material.opacity = opacity;
  if (opacity < 1) {
    material.transparent = true;
    material.depthWrite = false;
  }
}

export function applyModelMaterialAppearance(
  material: Material,
  snapshot: ModelMaterialAppearanceSnapshot,
  state: ModelMaterialAppearanceState,
): void {
  restoreModelMaterialAppearance(material, snapshot);

  if (state.opacity < 1) {
    applyModelMaterialOpacityOverride(material, state.opacity);
  }

  const appearance = getAppearanceForEmphasis(state.emphasis);
  if (appearance) {
    if (hasEmissive(material)) {
      material.emissive.copy(highlightedColor);
      if (hasEmissiveIntensity(material)) {
        material.emissiveIntensity = appearance.emissiveIntensity;
      }
    } else if (hasColor(material)) {
      material.color.lerp(highlightedColor, appearance.colorMix);
    }
  }

  material.needsUpdate = true;
}

function mixChannel(base: number, target: number, amount: number): number {
  return Math.round(base + (target - base) * amount);
}

function normalizeHexColor(hex: number): number {
  const integerHex = Math.trunc(hex);
  return ((integerHex % hexColorSpace) + hexColorSpace) % hexColorSpace;
}

function getHexChannel(hex: number, divisor: number): number {
  return Math.floor(hex / divisor) % channelSize;
}

export function mixModelEmphasisTint(baseTintHex: number, emphasis: ModelComponentEmphasis): number {
  const appearance = getAppearanceForEmphasis(emphasis);
  if (!appearance) {
    return baseTintHex;
  }

  const base = normalizeHexColor(baseTintHex);
  const target = appearance.color;
  const amount = appearance.capTintMix;
  const red = mixChannel(getHexChannel(base, redChannelDivisor), getHexChannel(target, redChannelDivisor), amount);
  const green = mixChannel(
    getHexChannel(base, greenChannelDivisor),
    getHexChannel(target, greenChannelDivisor),
    amount,
  );
  const blue = mixChannel(getHexChannel(base, 1), getHexChannel(target, 1), amount);
  return red * redChannelDivisor + green * greenChannelDivisor + blue;
}

export function resolveModelComponentEmphasis(
  unitState: Pick<ModelInteractionUnitState, 'hoveredComponentId' | 'selectedComponentIds' | 'focusedComponentId'>,
  componentId: string,
): ModelComponentEmphasis {
  if (unitState.focusedComponentId === componentId) {
    return 'focused';
  }
  if (unitState.selectedComponentIds.includes(componentId)) {
    return 'selected';
  }
  if (unitState.hoveredComponentId === componentId) {
    return 'hover';
  }
  return 'none';
}
