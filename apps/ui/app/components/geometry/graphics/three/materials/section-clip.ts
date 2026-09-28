/* oxlint-disable new-cap -- three/tsl `Fn`/`If`/`Loop`/`Break` are shader graph factories */
import { Vector2, Vector4 } from 'three';
import type { Material, Object3D, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import type { Node } from 'three/webgpu';
import {
  bool,
  Break,
  cameraWorldMatrix,
  float,
  Fn,
  If,
  Loop,
  positionView,
  uniform,
  uniformArray,
  vec4,
} from 'three/tsl';
import { maxSectionPieces } from '#components/geometry/graphics/section-cuts.js';
import type { SectionPiece } from '#components/geometry/graphics/section-cuts.js';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';

/**
 * The section clip: one viewer's removed volume, compiled into every model material once and changed only through
 * uniforms, so adding, moving or removing a cut never relinks a program or rebuilds a pipeline.
 *
 * A point is removed when some piece below the count holds it in both of its half-spaces by more than epsilon, which
 * is `isSectionRemoved` over render-space pieces. WebGL materials take a composed `onBeforeCompile`; WebGPU materials
 * take a TSL `maskNode`. Both read the same objects, written in place.
 */
type SectionClipStorage = Readonly<{
  /** `x` is the number of pieces in use; `y` the epsilon, in render units. */
  settings: Vector2;
  /** Per piece, its first half-space as `(normal, constant)`. */
  first: readonly Vector4[];
  /** Per piece, its second half-space. A piece of one half-space repeats its first. */
  second: readonly Vector4[];
}>;

type SectionClipUniforms = Readonly<
  Record<'tauSectionClip' | 'tauSectionFirst' | 'tauSectionSecond', { value: unknown }>
>;

export type WebGlSectionClip = SectionClipStorage & Readonly<{ backend: 'webgl'; uniforms: SectionClipUniforms }>;
export type WebGpuSectionClip = SectionClipStorage & Readonly<{ backend: 'webgpu'; mask: Node<'bool'> }>;
export type SectionClip = WebGlSectionClip | WebGpuSectionClip;

const shaderCacheKey = 'tau-section-clip-v1';

const vertexDeclaration = /* glsl */ `
varying vec3 vTauSectionWorld;`;

/* After `project_vertex`: `transformed` holds morphs and skinning; batching and instancing follow as there. */
const meshWorldPosition = /* glsl */ `
vec4 tauSectionWorld = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  tauSectionWorld = batchingMatrix * tauSectionWorld;
#endif
#ifdef USE_INSTANCING
  tauSectionWorld = instanceMatrix * tauSectionWorld;
#endif
vTauSectionWorld = ( modelMatrix * tauSectionWorld ).xyz;`;

/* `LineMaterial` has no `transformed`: its vertex is a segment end, trimmed to the near plane, in view space. */
const lineWorldPosition = /* glsl */ `
vTauSectionWorld = ( inverse( viewMatrix ) * mvPosition ).xyz;`;

const fragmentDeclarations = /* glsl */ `
varying vec3 vTauSectionWorld;
uniform vec2 tauSectionClip;
uniform vec4 tauSectionFirst[ ${maxSectionPieces} ];
uniform vec4 tauSectionSecond[ ${maxSectionPieces} ];
bool tauSectionRemoved( vec3 point ) {
  for ( int i = 0; i < ${maxSectionPieces}; i ++ ) {
    if ( float( i ) >= tauSectionClip.x ) break;
    if ( dot( point, tauSectionFirst[ i ].xyz ) - tauSectionFirst[ i ].w > tauSectionClip.y &&
      dot( point, tauSectionSecond[ i ].xyz ) - tauSectionSecond[ i ].w > tauSectionClip.y ) return true;
  }
  return false;
}`;

const fragmentClip = /* glsl */ `
if ( tauSectionRemoved( vTauSectionWorld ) ) discard;`;

/** Appends `addition` after the one `anchor` chunk; a missing or repeated chunk means three changed under us. */
const appendAfterChunk = (source: string, anchor: string, addition: string): string => {
  const first = source.indexOf(anchor);
  if (first === -1 || first !== source.lastIndexOf(anchor)) {
    throw new Error(`Section clip requires exactly one ${anchor} chunk`);
  }
  const end = first + anchor.length;
  return `${source.slice(0, end)}${addition}${source.slice(end)}`;
};

/*
 * The world position comes from the view position, not `positionWorld`: three rebuilds `positionView` from clip space
 * for a material with its own `vertexNode` (Line2), whose `positionLocal` is the unit quad every segment shares.
 */
const createSectionClipMask = ({ settings, first, second }: SectionClipStorage): Node<'bool'> => {
  const clip = uniform(settings);
  // The arrays are read by reference each frame, so writing their vectors in place is the whole update.
  const firstHalfSpaces = uniformArray<'vec4'>(first as Vector4[], 'vec4');
  const secondHalfSpaces = uniformArray<'vec4'>(second as Vector4[], 'vec4');
  return Fn(() => {
    const point = cameraWorldMatrix.mul(vec4(positionView, 1)).xyz;
    const isKept = bool(true).toVar();
    Loop(maxSectionPieces, ({ i }) => {
      If(float(i).greaterThanEqual(clip.x), () => {
        Break();
      });
      const a = firstHalfSpaces.element(i);
      const b = secondHalfSpaces.element(i);
      If(point.dot(a.xyz).sub(a.w).greaterThan(clip.y).and(point.dot(b.xyz).sub(b.w).greaterThan(clip.y)), () => {
        isKept.assign(bool(false));
        Break();
      });
    });
    return isKept;
  })() as Node<'bool'>;
};

/** A new clip with no pieces, for one viewer. Never share it between viewers or renderers. */
export function createSectionClip(backend: 'webgl'): WebGlSectionClip;
export function createSectionClip(backend: 'webgpu'): WebGpuSectionClip;
export function createSectionClip(backend: ResolvedGraphicsBackend): SectionClip;
export function createSectionClip(backend: ResolvedGraphicsBackend): SectionClip {
  const storage: SectionClipStorage = {
    settings: new Vector2(),
    first: Array.from({ length: maxSectionPieces }, () => new Vector4()),
    second: Array.from({ length: maxSectionPieces }, () => new Vector4()),
  };
  return backend === 'webgpu'
    ? { ...storage, backend, mask: createSectionClipMask(storage) }
    : {
        ...storage,
        backend,
        uniforms: {
          tauSectionClip: { value: storage.settings },
          tauSectionFirst: { value: storage.first },
          tauSectionSecond: { value: storage.second },
        },
      };
}

const clips = new WeakMap<Object3D, SectionClip>();

/** The clip of the viewer whose root scene is `scene`. */
export const getSectionClip = (scene: Object3D, backend: ResolvedGraphicsBackend): SectionClip => {
  let clip = clips.get(scene);
  if (clip?.backend !== backend) {
    clip = createSectionClip(backend);
    clips.set(scene, clip);
  }
  return clip;
};

/**
 * Writes the pieces, in the render frame, into the clip's arrays in place: no uniform, array or program is created.
 *
 * @throws RangeError past {@link maxSectionPieces}: a piece is never dropped silently.
 */
export const writeSectionClip = (clip: SectionClip, pieces: readonly SectionPiece[], epsilon = 0): void => {
  if (pieces.length > maxSectionPieces) {
    throw new RangeError(`The section clip holds at most ${maxSectionPieces} pieces; received ${pieces.length}.`);
  }
  clip.settings.set(pieces.length, epsilon);
  for (const [index, { halfSpaces }] of pieces.entries()) {
    const [first, second = first] = halfSpaces;
    if (!first || !second) {
      throw new RangeError('A section piece needs one or two half-spaces.');
    }
    clip.first[index]!.set(first.normal[0], first.normal[1], first.normal[2], first.constant);
    clip.second[index]!.set(second.normal[0], second.normal[1], second.normal[2], second.constant);
  }
};

type ClippableMaterial = Material & {
  maskNode?: Node;
  isNodeMaterial?: boolean;
  isLineMaterial?: boolean;
};

const installedClips = new WeakMap<Material, SectionClip>();

const installWebGlClip = (material: ClippableMaterial, uniforms: SectionClipUniforms): void => {
  const previousHook = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  const worldPosition = material.isLineMaterial ? lineWorldPosition : meshWorldPosition;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer): void => {
    previousHook.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = appendAfterChunk(
      appendAfterChunk(shader.vertexShader, '#include <clipping_planes_pars_vertex>', vertexDeclaration),
      '#include <clipping_planes_vertex>',
      worldPosition,
    );
    shader.fragmentShader = appendAfterChunk(
      appendAfterChunk(shader.fragmentShader, '#include <clipping_planes_pars_fragment>', fragmentDeclarations),
      '#include <clipping_planes_fragment>',
      fragmentClip,
    );
  };
  material.customProgramCacheKey = (): string => `${previousKey.call(material)}|${shaderCacheKey}`;
};

/**
 * Compiles the clip into `material`, once: it stays in for good, so Section on or off and any cut count reuse one
 * program. Chains any existing hook or mask. Idempotent for the same clip.
 *
 * @throws Error when the material already carries another viewer's clip (materials are per viewer).
 */
export const installSectionClip = (material: Material, clip: SectionClip): void => {
  const installed = installedClips.get(material);
  if (installed === clip) {
    return;
  }
  if (installed) {
    throw new Error('A material takes the section clip of one viewer only.');
  }
  installedClips.set(material, clip);
  const target = material as ClippableMaterial;
  if (clip.backend === 'webgpu') {
    // A node material's own mask defaults to null.
    const own = target.maskNode;
    target.maskNode = own ? (own as Node<'bool'>).and(clip.mask) : clip.mask;
  } else {
    installWebGlClip(target, clip.uniforms);
  }
  material.needsUpdate = true;
};

/** Gives a replacement material the clip its predecessor carried, if any. */
export const transferSectionClip = (from: Material, to: Material): void => {
  const clip = installedClips.get(from);
  if (clip) {
    installSectionClip(to, clip);
  }
};
