import * as THREE from 'three';
import { createFilamentNodeMaterial } from '#components/printer/printer-filament-material.node.js';
import { printerBody, printerToolpath } from '#components/printer/printer-colors.constants.js';

export const filamentModes = ['filament', 'role', 'width', 'speed', 'flow'] as const;
export type FilamentMode = (typeof filamentModes)[number];
export type FilamentUniforms = {
  mode: { value: number };
  fraction: { value: number };
  layer: { value: number };
  emphasis: { value: number };
  maximum: { value: number };
  palette: { value: THREE.DataTexture };
  low: { value: THREE.Color };
  high: { value: THREE.Color };
};

/** Shared parameters for lit, opaque beads; palette entries are linear sRGB. */
export const createFilamentUniforms = (palette: THREE.DataTexture): FilamentUniforms => ({
  mode: { value: 0 },
  fraction: { value: 1 },
  layer: { value: -1 },
  emphasis: { value: 0 },
  maximum: { value: 1 },
  palette: { value: palette },
  low: { value: new THREE.Color(printerToolpath.support) },
  high: { value: new THREE.Color(printerBody.nozzleGlow) },
});

const declarations = /* GLSL */ `
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec4 aDimensions;
attribute vec4 aJoins;
attribute vec2 aMetrics;
attribute float aRole;
attribute vec4 aProfile;
uniform float uFraction;
uniform float uMode;
uniform float uMaximum;
uniform float uLayer;
uniform float uEmphasis;
uniform sampler2D uPalette;
uniform vec3 uLow;
uniform vec3 uHigh;
varying vec3 vFilamentColor;
`;

/** WebGL standard lighting with compact instance expansion; paired TSL uses the same fields. */
export const createFilamentMaterial = (uniforms: FilamentUniforms): THREE.MeshStandardMaterial => {
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.68,
    metalness: 0,
    depthWrite: true,
    depthTest: true,
    transparent: false,
  });
  material.customProgramCacheKey = () => 'tau-filament-stadium-1';
  material.onBeforeCompile = (shader): void => {
    for (const chunk of ['#include <begin_vertex>', '#include <beginnormal_vertex>']) {
      if (shader.vertexShader.split(chunk).length !== 2) {
        throw new Error(`Filament shader expects one ${chunk}`);
      }
    }
    Object.assign(shader.uniforms, {
      uFraction: uniforms.fraction,
      uMode: uniforms.mode,
      uMaximum: uniforms.maximum,
      uPalette: uniforms.palette,
      uLayer: uniforms.layer,
      uEmphasis: uniforms.emphasis,
      uLow: uniforms.low,
      uHigh: uniforms.high,
    });
    shader.vertexShader = declarations + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      /* GLSL */ `
      vec2 axis = normalize(aEnd.xy - aStart.xy);
      vec2 lateral = vec2(-axis.y, axis.x);
      float normalScale = aDimensions.y / min(aDimensions.x, aDimensions.y);
      vec3 objectNormal = vec3(lateral * normal.x * normalScale + axis * normal.z, normal.y);
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3(tangent.xyz);
      #endif
    `,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* GLSL */ `
      float along = aProfile.x * uFraction;
      float radius = aDimensions.y * 0.5;
      float across = aProfile.w * max(0.0, aDimensions.x - aDimensions.y) * 0.5 + aProfile.y * min(aDimensions.x, aDimensions.y) * 0.5;
      vec2 finishJoin = uFraction < 1.0 ? lateral : aJoins.zw;
      vec2 joinSide = mix(aJoins.xy, finishJoin, aProfile.x);
      vec3 transformed = mix(aStart, aEnd, along) + vec3(joinSide * across, (aProfile.z - 1.0) * radius);
      float row = uMode < 0.5 ? 0.0 : aRole + 1.0;
      vFilamentColor = texture2D(uPalette, vec2((aDimensions.w + 0.5) / 64.0, (row + 0.5) / 16.0)).rgb;
      if (uMode > 1.5) {
        float value = uMode < 2.5 ? aDimensions.x : uMode < 3.5 ? aMetrics.x : aMetrics.y;
        vFilamentColor = mix(uLow, uHigh, clamp(value / max(uMaximum, 0.000001), 0.0, 1.0));
      }
      if (abs(aDimensions.z - uLayer) < 0.5) { vFilamentColor = mix(vFilamentColor, vec3(1.0), uEmphasis); }
    `,
    );
    shader.fragmentShader = 'varying vec3 vFilamentColor;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.rgb *= vFilamentColor;',
    );
  };
  return material;
};

export const createFilamentMaterialForBackend = (
  backend: 'webgl' | 'webgpu',
  uniforms: FilamentUniforms,
): THREE.Material => (backend === 'webgpu' ? createFilamentNodeMaterial(uniforms) : createFilamentMaterial(uniforms));
