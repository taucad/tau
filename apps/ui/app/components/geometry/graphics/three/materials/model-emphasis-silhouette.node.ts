/* oxlint-disable new-cap -- three/tsl `Fn` is a shader graph factory */
/* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- three/tsl fluent nodes are typed as `any` in @types/three; the graph is pinned by the stripped snapshot test. */
import { Color, Vector2 } from 'three';
import type { Texture } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { float, Fn, max, min, mix, positionGeometry, screenUV, step, texture, uniform, vec2, vec4 } from 'three/tsl';
import type { SilhouetteMaskSize } from '#components/geometry/graphics/three/materials/model-emphasis-silhouette.js';
import {
  silhouetteColor,
  silhouetteHiddenAlphaScale,
  silhouetteHoverAlpha,
  silhouetteMaskThreshold,
  silhouetteSelectedAlpha,
  silhouetteTapDistance,
  silhouetteTapOffsets,
} from '#components/geometry/graphics/three/materials/model-emphasis-silhouette.js';

export type SilhouetteNodeMaterial = MeshBasicNodeMaterial & {
  readonly silhouetteTexelSize: { value: Vector2 };
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

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  material.lights = false;

  material.vertexNode = Fn(() => vec4(positionGeometry.xy, float(0), float(1)))();

  material.colorNode = Fn(() => {
    const center = texture(maskTexture, screenUV);
    const taps = silhouetteTapOffsets.map(([x, y]) => texture(maskTexture, screenUV.add(texelSize.mul(vec2(x, y)))));
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
    return vec4(
      edgeColor,
      max(edge.r.mul(stateAlpha.x).mul(hoverStrength), edge.g.mul(stateAlpha.y).mul(selectedStrength)),
    );
  })();

  return Object.assign(material, { silhouetteTexelSize: texelSize }) as SilhouetteNodeMaterial;
}

/** Point the composite at a mask of `width × height` device pixels. */
export function setWebGpuSilhouetteMaskSize(
  material: SilhouetteNodeMaterial,
  { width, height, pixelRatio }: SilhouetteMaskSize,
): void {
  const tap = silhouetteTapDistance(pixelRatio);
  material.silhouetteTexelSize.value.set(tap / width, tap / height);
}
