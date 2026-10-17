import * as THREE from 'three';
import { maxSectionPieces } from '#graphics/section-cuts.js';
import type { ModelComponentEmphasis } from '#graphics/three/materials/model-component-appearance.js';
import { gltfEdgeHoverColor, gltfEdgeSelectedColor } from '#graphics/three/overlay-colors.constants.js';
import type { SectionFace, SectionHalfSpace } from '#graphics/section-cuts.js';

/**
 * The colour of a cap outline for the emphasis of the component that was cut. The cut face belongs to the component,
 * so its outline follows the component's edges into the emphasis colour; at the theme colour it would strand a dark
 * loop inside an otherwise highlighted shape.
 */
export const resolveSectionCapOutlineColor = (emphasis: ModelComponentEmphasis, themeEdgeColor: number): number => {
  if (emphasis === 'none') {
    return themeEdgeColor;
  }
  return emphasis === 'hover' ? gltfEdgeHoverColor : gltfEdgeSelectedColor;
};

/** At most two cut faces per piece. */
export const maxSectionCapOutlineFaces = maxSectionPieces * 2;

/**
 * The faces a cap outline follows, shared by every outline material of one owner and written in place:
 * `settings.x` is the face count and `settings.y` the line width in device pixels.
 */
export type SectionCapOutlineFaces = Readonly<{
  settings: THREE.Vector2;
  /**
   * The camera: `eye.xyz` its world position and `eye.w` the world size of a pixel, per unit of view depth for a
   * perspective camera; `forward.xyz` its view direction, `forward.w` 1 when orthographic.
   */
  eye: THREE.Vector4;
  forward: THREE.Vector4;
  /** Per face, its plane as `(normal, constant)`; the removed side is where `dot(normal, p) > constant`. */
  planes: readonly THREE.Vector4[];
  /** Per face, the one bound of a cutaway face, or `(0, 0, 0, -1)`, which holds every point. */
  bounds: readonly THREE.Vector4[];
}>;

export const createSectionCapOutlineFaces = (): SectionCapOutlineFaces => ({
  settings: new THREE.Vector2(),
  eye: new THREE.Vector4(),
  forward: new THREE.Vector4(),
  planes: Array.from({ length: maxSectionCapOutlineFaces }, () => new THREE.Vector4()),
  bounds: Array.from({ length: maxSectionCapOutlineFaces }, () => new THREE.Vector4()),
});

const writeHalfSpace = (target: THREE.Vector4, { normal, constant }: SectionHalfSpace): void => {
  target.set(normal[0], normal[1], normal[2], constant);
};

const forward = new THREE.Vector3();

/** Writes the camera the outline is drawn for, and the height of its viewport in device pixels, in place. */
export const writeSectionCapOutlineCamera = (
  target: SectionCapOutlineFaces,
  camera: THREE.Camera,
  heightPixels: number,
): void => {
  camera.getWorldDirection(forward);
  const isOrthographic = (camera as Partial<THREE.OrthographicCamera>).isOrthographicCamera === true;
  target.eye.setFromMatrixPosition(camera.matrixWorld);
  // The vertical scale of either projection: 1 / tan(fov / 2), or 2 / height, each with the zoom.
  target.eye.w = 2 / (camera.projectionMatrix.elements[5] * Math.max(heightPixels, 1));
  target.forward.set(forward.x, forward.y, forward.z, isOrthographic ? 1 : 0);
};

/**
 * Writes the faces in place, in render space.
 *
 * @throws RangeError past {@link maxSectionCapOutlineFaces}, or for a face with more than one bound.
 */
export const writeSectionCapOutlineFaces = (
  target: SectionCapOutlineFaces,
  faces: readonly SectionFace[],
  widthPixels: number,
): void => {
  if (faces.length > maxSectionCapOutlineFaces) {
    throw new RangeError(`A cap outline follows at most ${maxSectionCapOutlineFaces} faces; received ${faces.length}.`);
  }
  target.settings.set(faces.length, widthPixels);
  for (const [index, face] of faces.entries()) {
    if (face.bounds.length > 1) {
      throw new RangeError('A cap outline face takes at most one bound.');
    }
    writeHalfSpace(target.planes[index]!, face.plane);
    const [bound] = face.bounds;
    if (bound) {
      writeHalfSpace(target.bounds[index]!, bound);
    } else {
      target.bounds[index]!.set(0, 0, 0, -1);
    }
  }
};

/*
 * A fragment of a cut surface is on the outline when it lies on the kept side of a face's plane, within the line width
 * of it, and inside the face's bound. The width is the smaller of two measures: the screen gradient of the plane
 * distance, so the line is one width across on a surface at a shallow angle to the plane, and the world size of a
 * pixel at the fragment's depth, so a wall seen edge-on or at a silhouette, whose gradient is unbounded, draws one
 * width and not a smear. A surface lying in the plane (no gradient) draws no line. The section clip composes after the
 * clipping chunk and discards what the cuts remove.
 */
const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec3 vTauOutlineWorld;
void main() {
  #include <begin_vertex>
  #include <project_vertex>
  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>
  vTauOutlineWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
}`;

const fragmentShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
uniform vec3 tauOutlineColor;
uniform vec2 tauOutline;
uniform vec4 tauOutlineEye;
uniform vec4 tauOutlineForward;
uniform vec4 tauOutlinePlanes[ ${maxSectionCapOutlineFaces} ];
uniform vec4 tauOutlineBounds[ ${maxSectionCapOutlineFaces} ];
varying vec3 vTauOutlineWorld;
void main() {
  #include <clipping_planes_fragment>
  vec3 tauDx = dFdx( vTauOutlineWorld );
  vec3 tauDy = dFdy( vTauOutlineWorld );
  float tauPixelWorld = tauOutlineEye.w *
    ( tauOutlineForward.w > 0.5 ? 1.0 : dot( vTauOutlineWorld - tauOutlineEye.xyz, tauOutlineForward.xyz ) );
  bool tauIsOutline = false;
  for ( int i = 0; i < ${maxSectionCapOutlineFaces}; i ++ ) {
    if ( float( i ) >= tauOutline.x ) break;
    vec4 tauPlane = tauOutlinePlanes[ i ];
    vec4 tauBound = tauOutlineBounds[ i ];
    float tauSlope = abs( dot( tauDx, tauPlane.xyz ) ) + abs( dot( tauDy, tauPlane.xyz ) );
    float tauDistance = dot( vTauOutlineWorld, tauPlane.xyz ) - tauPlane.w;
    if ( tauSlope > tauPixelWorld * 0.02 && tauDistance <= 0.0 &&
      tauDistance > - min( tauSlope, tauPixelWorld ) * tauOutline.y &&
      dot( vTauOutlineWorld, tauBound.xyz ) - tauBound.w >= 0.0 ) {
      tauIsOutline = true;
      break;
    }
  }
  if ( ! tauIsOutline ) discard;
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4( tauOutlineColor, 1.0 );
  #include <colorspace_fragment>
}`;

export type SectionCapOutlineMaterial = THREE.ShaderMaterial & {
  uniforms: { tauOutlineColor: { value: THREE.Color } };
};

/**
 * The WebGL cap outline in one colour, drawn over the cut model's own surfaces at their geometric depth: opaque,
 * depth-tested, never writing depth.
 */
export const createSectionCapOutlineMaterial = (
  faces: SectionCapOutlineFaces,
  color: number,
): SectionCapOutlineMaterial =>
  new THREE.ShaderMaterial({
    name: 'TauSectionCapOutline',
    uniforms: {
      tauOutlineColor: { value: new THREE.Color(color) },
      tauOutline: { value: faces.settings },
      tauOutlineEye: { value: faces.eye },
      tauOutlineForward: { value: faces.forward },
      tauOutlinePlanes: { value: faces.planes },
      tauOutlineBounds: { value: faces.bounds },
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    transparent: false,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  }) as SectionCapOutlineMaterial;
