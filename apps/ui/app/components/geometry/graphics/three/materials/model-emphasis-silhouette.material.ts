import { Color, ShaderMaterial, Vector2 } from 'three';
import type { Texture } from 'three';
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

const tapLines = silhouetteTapOffsets
  .map(
    ([x, y]) => `
  tap = texture2D(maskTexture, vUv + texelSize * vec2(${x.toFixed(1)}, ${y.toFixed(1)}));
  high = max(high, tap.rg);
  low = min(low, tap.rg);
  visible = max(visible, tap.ba);`,
  )
  .join('');

/**
 * WebGL composite of the emphasis silhouette: a fullscreen quad that draws the yellow outline
 * where mask coverage changes, at full strength where the part is visible there and at
 * `hiddenAlphaScale` where it is behind something. Paired with
 * `model-emphasis-silhouette.node.ts` for WebGPU.
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
  hiddenAlphaScale: { value: number };
};

/**
 * @param maskTexture - The emphasised meshes' coverage in RG (hovered, selected) and their
 *   visibility in BA.
 */
export function createWebGlSilhouetteMaterial(maskTexture: Texture): ShaderMaterial & {
  uniforms: SilhouetteMaterialUniforms;
} {
  const uniforms: SilhouetteMaterialUniforms = {
    maskTexture: { value: maskTexture },
    texelSize: { value: new Vector2(1, 1) },
    edgeColor: { value: new Color(silhouetteColor) },
    hoverAlpha: { value: silhouetteHoverAlpha },
    selectedAlpha: { value: silhouetteSelectedAlpha },
    hiddenAlphaScale: { value: silhouetteHiddenAlphaScale },
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
      uniform float hiddenAlphaScale;
      varying vec2 vUv;
      void main() {
        vec4 center = texture2D(maskTexture, vUv);
        vec2 high = center.rg;
        vec2 low = center.rg;
        vec2 visible = center.ba;
        vec4 tap;${tapLines}
        vec2 edge = high - low;
        vec2 strength = mix(vec2(hiddenAlphaScale), vec2(1.0), step(${silhouetteMaskThreshold.toFixed(1)}, visible));
        vec2 stateAlpha = vec2(hoverAlpha, selectedAlpha) * strength * edge;
        float alpha = max(stateAlpha.r, stateAlpha.g);
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
