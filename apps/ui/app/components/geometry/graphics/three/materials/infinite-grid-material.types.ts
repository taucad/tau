import type { Color, Material } from 'three';

/** Visual-only props that callers may mutate on a long-lived infinite-grid material via {@link InfiniteGridMaterialHandle.applyVisualOverrides}. */
export type InfiniteGridVisualOverrides = {
  readonly smallSize?: number;
  readonly largeSize?: number;
  readonly color?: Color;
};

/** Long-lived infinite grid material bundle (WebGL `ShaderMaterial` or WebGPU `MeshBasicNodeMaterial`). */
export type InfiniteGridMaterialHandle = Readonly<{
  material: Material;
  applyVisualOverrides: (overrides: InfiniteGridVisualOverrides) => void;
}>;

/** Shared configuration for infinite grid shaders (legacy GLSL + WebGPU TSL). */
export type InfiniteGridMaterialProperties = {
  readonly smallSize?: number;
  readonly smallThickness?: number;
  readonly largeSize?: number;
  readonly largeThickness?: number;
  readonly color?: Color;
  readonly axes?: 'xyz' | 'xzy' | 'zyx';
  readonly lineOpacity?: number;
  readonly minGridDistance?: number;
  readonly gridDistanceMultiplier?: number;
  readonly alphaThreshold?: number;
  readonly fadeStart?: number;
  readonly fadeEnd?: number;
  readonly normalOffset?: number;
};
