import { NoBlending, ShaderMaterial } from 'three';
import type { Object3D, Side } from 'three';

/**
 * The model pick record, shared by both backends: each fragment writes `(id, world x, world y, world z)` into a
 * float target, where `id` is the drawn object's 1-based pick ID and 0 means nothing was drawn there. A float32
 * channel holds every integer up to 2^24 exactly.
 */
const pickIdKey = 'tauPickId';

/** The pick ID an object carries for the pass that draws it. */
export const getModelPickId = (object: Object3D): number => (object.userData[pickIdKey] as number | undefined) ?? 0;

/** Gives an object its pick ID for the next pass. */
export const setModelPickId = (object: Object3D, id: number): void => {
  object.userData[pickIdKey] = id;
};

/*
 * Logarithmic depth as the WebGL viewport writes it, so near surfaces resolve as they do on screen. The section clip
 * composes after the one `clipping_planes` chunk of each stage, as on every model material.
 */
const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec3 vTauPickWorld;
void main() {
  #include <begin_vertex>
  #include <project_vertex>
  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>
  vTauPickWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
}`;

const fragmentShader = /* glsl */ `
uniform float tauPickId;
varying vec3 vTauPickWorld;
#include <common>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4( tauPickId, vTauPickWorld );
}`;

export type ModelPickMaterial = ShaderMaterial & { uniforms: { tauPickId: { value: number } } };

/**
 * The WebGL pick material for one face side. The record is data, not colour: no blending, tone mapping or colour
 * conversion touches it. The ID is a uniform the drawn object sets before its draw.
 */
export const createModelPickMaterial = (side: Side): ModelPickMaterial =>
  new ShaderMaterial({
    name: 'TauModelPick',
    uniforms: { tauPickId: { value: 0 } },
    vertexShader,
    fragmentShader,
    side,
    blending: NoBlending,
    transparent: false,
    depthTest: true,
    depthWrite: true,
    toneMapped: false,
  }) as ModelPickMaterial;

/** Uploads `object`'s pick ID before its draw: the material is shared, so the uniform changes per object. */
export const applyModelPickId = (material: ModelPickMaterial, object: Object3D): void => {
  material.uniforms.tauPickId.value = getModelPickId(object);
  material.uniformsNeedUpdate = true;
};
