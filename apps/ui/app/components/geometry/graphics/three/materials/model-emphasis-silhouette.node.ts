/* oxlint-disable new-cap -- three/tsl `Fn` is a shader graph factory */
/* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- three/tsl fluent nodes are typed as `any` in @types/three; the graph is pinned by the stripped snapshot test. */
import { Color, Vector2 } from 'three';
import type { Texture } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { abs, float, Fn, max, positionGeometry, screenUV, texture, uniform, vec2, vec4 } from 'three/tsl';
import type { SilhouetteMaskSize } from '#components/geometry/graphics/three/materials/model-emphasis-silhouette.js';
import {
  silhouetteColor,
  silhouetteHoverAlpha,
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
 * mask coverage changes toward any axis neighbour. Constants and tap layout are shared with the
 * WebGL implementation so both backends differ only at the node/GLSL seam.
 */
export function createWebGpuSilhouetteMaterial(maskTexture: Texture): SilhouetteNodeMaterial {
  const texelSize = uniform(new Vector2(1, 1));
  const edgeColor = uniform(new Color(silhouetteColor));
  const hoverAlpha = uniform(silhouetteHoverAlpha);
  const selectedAlpha = uniform(silhouetteSelectedAlpha);

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  material.lights = false;

  material.vertexNode = Fn(() => vec4(positionGeometry.xy, float(0), float(1)))();

  material.colorNode = Fn(() => {
    const center = texture(maskTexture, screenUV).rg;
    const taps = silhouetteTapOffsets.map(([x, y]) =>
      abs(center.sub(texture(maskTexture, screenUV.add(texelSize.mul(vec2(x, y)))).rg)),
    );
    let edge = taps[0]!;
    for (const tap of taps.slice(1)) {
      edge = max(edge, tap);
    }
    const alpha = max(edge.r.mul(hoverAlpha), edge.g.mul(selectedAlpha));
    return vec4(edgeColor, alpha);
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
