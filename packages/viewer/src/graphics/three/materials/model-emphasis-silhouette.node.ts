/* oxlint-disable new-cap -- three/tsl `Fn` is a shader graph factory */
/* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- three/tsl fluent nodes are typed as `any` in @types/three; the graph is pinned by the stripped snapshot test. */
import { AlwaysDepth, Color, DepthTexture, Vector2, Vector4 } from 'three';
import type { Texture } from 'three';
import { MeshBasicNodeMaterial, NodeMaterial } from 'three/webgpu';
import {
  float,
  Fn,
  If,
  max,
  min,
  mix,
  positionGeometry,
  screenUV,
  step,
  texture,
  uniform,
  vec2,
  vec4,
} from 'three/tsl';
import type { SilhouetteMaskSize } from '#graphics/three/materials/model-emphasis-silhouette.js';
import {
  silhouetteColor,
  silhouetteHiddenAlphaScale,
  silhouetteHoverAlpha,
  silhouetteMaskThreshold,
  silhouetteSelectedAlpha,
  silhouetteTapDistance,
  silhouetteTapOffsets,
} from '#graphics/three/materials/model-emphasis-silhouette.js';

export type SilhouetteNodeMaterial = MeshBasicNodeMaterial & {
  readonly silhouetteTexelSize: { value: Vector2 };
  /** Zero uses independent RGBA states; otherwise RG carries coverage/visibility at this alpha. */
  readonly silhouettePackedAlpha: { value: number };
  /** Top-left crop offset and extent in full-frame UV. */
  readonly silhouetteRegion: { value: Vector4 };
};

/**
 * WebGPU composite of the emphasis silhouette, mirroring `model-emphasis-silhouette.material.ts`:
 * a fullscreen quad (`vertexNode` bypasses the camera) that outputs the outline colour where
 * mask coverage spans a range across the pixel and its axis neighbours, scaled down where that boundary is hidden.
 * Constants and tap layout are shared with the WebGL implementation so both backends differ only
 * at the node/GLSL seam.
 *
 * @param maskTexture - The emphasised meshes' coverage in RG (hovered, selected) and their
 *   visibility in BA.
 */
export function createWebGpuSilhouetteMaterial(maskTexture: Texture): SilhouetteNodeMaterial {
  const texelSize = uniform(new Vector2(1, 1));
  const edgeColor = uniform(new Color(silhouetteColor));
  const stateAlpha = uniform(new Vector2(silhouetteHoverAlpha, silhouetteSelectedAlpha));
  const hiddenAlphaScale = uniform(silhouetteHiddenAlphaScale);
  const packedAlpha = uniform(0);
  const region = uniform(new Vector4(0, 0, 1, 1));

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  material.lights = false;

  material.vertexNode = Fn(() => vec4(positionGeometry.xy, float(0), float(1)))();

  material.colorNode = Fn(() => {
    const maskUv = screenUV.sub(region.xy).div(region.zw);
    const center = texture(maskTexture, maskUv);
    const taps = silhouetteTapOffsets.map(([x, y]) => texture(maskTexture, maskUv.add(texelSize.mul(vec2(x, y)))));
    let high = center.rg;
    let low = center.rg;
    let visible = center.ba;
    for (const tap of taps) {
      high = max(high, tap.rg);
      low = min(low, tap.rg);
      visible = max(visible, tap.ba);
    }
    const edge = high.sub(low);
    // Per channel rather than vectorised: TSL types `step` on floats only.
    const hoverStrength = mix(hiddenAlphaScale, float(1), step(silhouetteMaskThreshold, visible.r));
    const selectedStrength = mix(hiddenAlphaScale, float(1), step(silhouetteMaskThreshold, visible.g));
    const alpha = max(
      edge.r.mul(stateAlpha.x).mul(hoverStrength),
      edge.g.mul(stateAlpha.y).mul(selectedStrength),
    ).toVar();
    // Single-state RG8: the same resolved coverage in R and visibility in G. Keep the
    // existing taps, threshold and sample count; only the payload's channel placement changes.
    If(packedAlpha.greaterThan(0), () => {
      alpha.assign(edge.r.mul(packedAlpha).mul(mix(hiddenAlphaScale, float(1), step(silhouetteMaskThreshold, high.g))));
    });
    return vec4(edgeColor, alpha);
  })();

  return Object.assign(material, {
    silhouetteTexelSize: texelSize,
    silhouettePackedAlpha: packedAlpha,
    silhouetteRegion: region,
  }) as SilhouetteNodeMaterial;
}

/** Point the composite at a mask of `width × height` device pixels. */
export function setWebGpuSilhouetteMaskSize(
  material: SilhouetteNodeMaterial,
  { width, height, pixelRatio }: SilhouetteMaskSize,
): void {
  const tap = silhouetteTapDistance(pixelRatio);
  material.silhouetteTexelSize.value.set(tap / width, tap / height);
}

/**
 * Stamp retained frame depth into the mask, optionally sampling a native-resolution crop.
 *
 * @param source - Borrowed authoritative depth, including later cap writes.
 * @returns Owned material and placeholder, plus the borrowed depth texture binding.
 */
export function createWebGpuEmphasisDepthMaterial(source: DepthTexture): {
  material: NodeMaterial;
  frameDepth: ReturnType<typeof texture>;
  emptyDepth: DepthTexture;
  frameRegion: { value: Vector4 };
} {
  // Logical placeholder releases the borrowed frame reference while inactive; never rendered.
  const emptyDepth = new DepthTexture(1, 1);
  const frameRegion = uniform(new Vector4(0, 0, 1, 1));
  const frameDepth = texture(source, screenUV.mul(frameRegion.zw).add(frameRegion.xy));
  const material = new NodeMaterial();
  material.colorWrite = false;
  material.depthWrite = true;
  // The owning renderer selects depthTest: GL needs it enabled; native reversed-Z
  // uses disabled testing for compare-always.
  material.depthTest = true;
  material.depthFunc = AlwaysDepth;
  material.toneMapped = false;
  material.name = 'tau-emphasis-depth';
  material.depthNode = frameDepth;
  return { material, frameDepth, emptyDepth, frameRegion };
}
