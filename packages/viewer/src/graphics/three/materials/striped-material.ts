import * as THREE from 'three';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';
import {
  createVertexColoredStripedNodeMaterial,
  setVertexColoredStripedNodeMaterialStripes,
} from '#graphics/three/materials/striped-material.node.js';
import { resolveStripedAppearance } from '#graphics/three/materials/striped-material-resolve-appearance.js';
import type { StripedMaterialProperties } from '#graphics/three/materials/striped-material.types.js';

/* oxlint-disable-next-line no-barrel-files/no-barrel-files -- façade consumers resolve the type here */
export type { StripedMaterialProperties } from '#graphics/three/materials/striped-material.types.js';

/** The stripe spacing and width of a cap material, in plane-local render units. */
export type StripedCapStripes = Readonly<{ stripeFrequency: number; stripeWidth: number }>;

/*
 * The cap is drawn at the plane positions it is given. The clipping chunks are the anchors the section clip composes
 * after, as on every model material, so a cap can be trimmed to what other cuts leave.
 */
const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
attribute vec2 aPlaneUv;
attribute vec3 aCapBaseColor;
attribute vec3 aCapStripeColor;
attribute vec2 aCapStripeAxis;
varying vec2 vSurfacePos;
varying vec3 vCapBaseColor;
varying vec3 vCapStripeColor;
varying vec2 vCapStripeAxis;
void main() {
  vSurfacePos = aPlaneUv;
  vCapBaseColor = aCapBaseColor;
  vCapStripeColor = aCapStripeColor;
  vCapStripeAxis = aCapStripeAxis;
  #include <begin_vertex>
  #include <project_vertex>
  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>
}`;

const fragmentShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
uniform float uStripeFrequency;
uniform float uStripeWidth;
varying vec2 vSurfacePos;
varying vec3 vCapBaseColor;
varying vec3 vCapStripeColor;
varying vec2 vCapStripeAxis;
void main() {
  #include <clipping_planes_fragment>
  #include <logdepthbuf_fragment>
  float pattern = mod(dot(vSurfacePos, vCapStripeAxis), uStripeFrequency);
  float aa = fwidth(pattern) * 1.5;
  float stripeMask = smoothstep(uStripeWidth - aa, uStripeWidth + aa, pattern);
  gl_FragColor = vec4(mix(vCapStripeColor, vCapBaseColor, stripeMask), 1.0);
  #include <colorspace_fragment>
}`;

type StripedCapShaderMaterial = THREE.ShaderMaterial & {
  uniforms: { uStripeFrequency: { value: number }; uStripeWidth: { value: number } };
};

/**
 * Section-cap material driven by per-vertex appearance attributes: `aPlaneUv` (plane coordinates in render units),
 * `aCapBaseColor`, `aCapStripeColor` and `aCapStripeAxis`. Depth, stencil and clipping are the owner's to set.
 */
export function createVertexColoredStripedMaterial(properties?: StripedMaterialProperties): THREE.ShaderMaterial {
  const { stripeFrequency, stripeWidth } = resolveStripedAppearance(properties);
  return new THREE.ShaderMaterial({
    name: 'TauSectionCap',
    side: THREE.DoubleSide,
    uniforms: {
      uStripeFrequency: { value: stripeFrequency },
      uStripeWidth: { value: stripeWidth },
    },
    vertexShader,
    fragmentShader,
  });
}

export function createVertexColoredStripedMaterialForBackend(
  backend: ResolvedGraphicsBackend,
  properties?: StripedMaterialProperties,
): THREE.Material {
  return backend === 'webgpu'
    ? createVertexColoredStripedNodeMaterial(properties)
    : createVertexColoredStripedMaterial(properties);
}

/** Writes new stripes into a cap material's uniforms; the program or pipeline stays as it is. */
export function setVertexColoredStripedMaterialStripes(material: THREE.Material, stripes: StripedCapStripes): void {
  if (material instanceof THREE.ShaderMaterial) {
    const { uniforms } = material as StripedCapShaderMaterial;
    uniforms.uStripeFrequency.value = stripes.stripeFrequency;
    uniforms.uStripeWidth.value = stripes.stripeWidth;
    return;
  }
  setVertexColoredStripedNodeMaterialStripes(material, stripes);
}
