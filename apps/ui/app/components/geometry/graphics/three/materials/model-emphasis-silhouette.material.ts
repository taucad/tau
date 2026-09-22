import { Color, ShaderMaterial, Vector2 } from 'three';
import type { Texture } from 'three';
import type { SilhouetteMaskSize } from '#components/geometry/graphics/three/materials/model-emphasis-silhouette.js';
import {
  silhouetteColor,
  silhouetteHoverAlpha,
  silhouetteSelectedAlpha,
  silhouetteTapDistance,
  silhouetteTapOffsets,
} from '#components/geometry/graphics/three/materials/model-emphasis-silhouette.js';

const tapLines = silhouetteTapOffsets
  .map(
    ([x, y]) =>
      `edge = max(edge, abs(center - texture2D(maskTexture, vUv + texelSize * vec2(${x.toFixed(1)}, ${y.toFixed(1)})).rg));`,
  )
  .join('\n  ');

/**
 * WebGL composite of the emphasis silhouette: a fullscreen quad that draws the yellow outline
 * where mask coverage changes. Paired with `model-emphasis-silhouette.node.ts` for WebGPU.
 *
 * Compositing fullscreen contract (WebGPU shader policy rule 7): not depth-tested, no depth write,
 * blended over the finished frame.
 */
export type SilhouetteMaterialUniforms = {
  maskTexture: { value: Texture };
  texelSize: { value: Vector2 };
  edgeColor: { value: Color };
  hoverAlpha: { value: number };
  selectedAlpha: { value: number };
};

export function createWebGlSilhouetteMaterial(maskTexture: Texture): ShaderMaterial & {
  uniforms: SilhouetteMaterialUniforms;
} {
  const uniforms: SilhouetteMaterialUniforms = {
    maskTexture: { value: maskTexture },
    texelSize: { value: new Vector2(1, 1) },
    edgeColor: { value: new Color(silhouetteColor) },
    hoverAlpha: { value: silhouetteHoverAlpha },
    selectedAlpha: { value: silhouetteSelectedAlpha },
  };
  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D maskTexture;
      uniform vec2 texelSize;
      uniform vec3 edgeColor;
      uniform float hoverAlpha;
      uniform float selectedAlpha;
      varying vec2 vUv;
      void main() {
        vec2 center = texture2D(maskTexture, vUv).rg;
        vec2 edge = vec2(0.0);
        ${tapLines}
        float alpha = max(edge.r * hoverAlpha, edge.g * selectedAlpha);
        if (alpha <= 0.0) discard;
        gl_FragColor = vec4(edgeColor, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  return material as ShaderMaterial & { uniforms: SilhouetteMaterialUniforms };
}

/** Point the composite at a mask of the given device-pixel size. */
export function setWebGlSilhouetteMaskSize(
  material: ShaderMaterial & { uniforms: SilhouetteMaterialUniforms },
  { width, height, pixelRatio }: SilhouetteMaskSize,
): void {
  const tap = silhouetteTapDistance(pixelRatio);
  material.uniforms.texelSize.value.set(tap / width, tap / height);
}
