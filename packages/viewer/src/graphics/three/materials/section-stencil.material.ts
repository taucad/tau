/* oxlint-disable eslint/no-bitwise -- Stencil references and masks are bit fields. */
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';
import { applySectionCapDepthState } from '#graphics/three/materials/section-cap-depth-state.js';

/**
 * The stencil byte of a section-cap pass. One piece is drawn at a time, from a byte it zeroes first.
 *
 * - `count`: how many times a source's surface behind a pixel enters minus leaves the solid, modulo 16.
 * - `ownerSeen`: a source of the current owner is inside the solid at the pixel's cap point.
 * - `previousSeen`: a source of an earlier owner is.
 * - `overlap`: a source of this owner is, too.
 * - `visible`: a cap of this piece is in front at the pixel.
 */
export const sectionStencilBits = {
  count: 0x0f,
  ownerSeen: 0x10,
  previousSeen: 0x20,
  overlap: 0x40,
  visible: 0x80,
  all: 0xff,
} as const;

/**
 * The stencil passes, in the order one piece draws them:
 *
 * - `clear-all`: zeroes the byte over the piece's exit planes, where every later pass of the piece reads it.
 * - `count-back`, `count-front`: the source's surfaces under the piece's exit clip, with no depth test, add one for each
 *   back face and take one for each front face, so the count is how many solids hold the pixel's cap point.
 * - `count-parity`: instead of a source's surfaces, fans over the closed loops its per-loop slice found on the face,
 *   with no depth test, flip the count's lowest bit, so the count is odd exactly inside the loops (even-odd).
 * - `mark-overlap`: where the count is non-zero and an earlier owner's source held the point, sets `overlap`.
 * - `cap`: the source's tint where the count is non-zero and the cap wins the depth test; sets `visible` and
 *   `ownerSeen`.
 * - `clear-count`: zeroes the count over the source's exit planes.
 * - `promote-owner`: turns the finished owner's `ownerSeen` into `previousSeen`.
 * - `overlap-cap`: the overlap colour where the cap is visible and overlaps, without a depth test.
 */
export type SectionStencilPass =
  | 'count-back'
  | 'count-front'
  | 'count-parity'
  | 'mark-overlap'
  | 'cap'
  | 'clear-count'
  | 'promote-owner'
  | 'overlap-cap'
  | 'clear-all';

type StencilState = Readonly<{
  func: THREE.StencilFunc;
  ref: number;
  funcMask: number;
  writeMask: number;
  fail: THREE.StencilOp;
  zFail: THREE.StencilOp;
  zPass: THREE.StencilOp;
}>;

const keep = THREE.KeepStencilOp;
const replace = THREE.ReplaceStencilOp;
const zero = THREE.ZeroStencilOp;
const { count, ownerSeen, previousSeen, overlap, visible, all } = sectionStencilBits;

/*
 * A compare passes when `ref & funcMask` OP `stencil & funcMask`, on both backends. A replace writes `ref` under
 * `writeMask`, so one ref both tests and writes.
 */
const stencilStates: Readonly<Record<SectionStencilPass, StencilState>> = {
  'count-back': {
    func: THREE.AlwaysStencilFunc,
    ref: 0,
    funcMask: all,
    writeMask: count,
    fail: THREE.IncrementWrapStencilOp,
    zFail: THREE.IncrementWrapStencilOp,
    zPass: THREE.IncrementWrapStencilOp,
  },
  'count-front': {
    func: THREE.AlwaysStencilFunc,
    ref: 0,
    funcMask: all,
    writeMask: count,
    fail: THREE.DecrementWrapStencilOp,
    zFail: THREE.DecrementWrapStencilOp,
    zPass: THREE.DecrementWrapStencilOp,
  },
  'count-parity': {
    func: THREE.AlwaysStencilFunc,
    ref: 0,
    funcMask: all,
    writeMask: 0x01,
    fail: THREE.InvertStencilOp,
    zFail: THREE.InvertStencilOp,
    zPass: THREE.InvertStencilOp,
  },
  // `previousSeen` < the masked byte: `previousSeen` is set and the count is non-zero.
  'mark-overlap': {
    func: THREE.LessStencilFunc,
    ref: previousSeen | overlap,
    funcMask: previousSeen | count,
    writeMask: overlap,
    fail: keep,
    zFail: replace,
    zPass: replace,
  },
  // 0 ≠ the count.
  cap: {
    func: THREE.NotEqualStencilFunc,
    ref: visible | ownerSeen,
    funcMask: count,
    writeMask: visible | ownerSeen,
    fail: keep,
    zFail: keep,
    zPass: replace,
  },
  'clear-count': {
    func: THREE.AlwaysStencilFunc,
    ref: 0,
    funcMask: all,
    writeMask: count,
    fail: zero,
    zFail: zero,
    zPass: zero,
  },
  // 0 ≠ `ownerSeen`; writes `previousSeen` and clears `ownerSeen`.
  'promote-owner': {
    func: THREE.NotEqualStencilFunc,
    ref: previousSeen,
    funcMask: ownerSeen,
    writeMask: previousSeen | ownerSeen,
    fail: keep,
    zFail: replace,
    zPass: replace,
  },
  'overlap-cap': {
    func: THREE.EqualStencilFunc,
    ref: visible | overlap,
    funcMask: visible | overlap,
    writeMask: 0,
    fail: keep,
    zFail: keep,
    zPass: keep,
  },
  'clear-all': {
    func: THREE.AlwaysStencilFunc,
    ref: 0,
    funcMask: all,
    writeMask: all,
    fail: zero,
    zFail: zero,
    zPass: zero,
  },
};

const applyStencilState = (material: THREE.Material, pass: SectionStencilPass): void => {
  const state = stencilStates[pass];
  material.stencilWrite = true;
  material.stencilFunc = state.func;
  material.stencilRef = state.ref;
  material.stencilFuncMask = state.funcMask;
  material.stencilWriteMask = state.writeMask;
  material.stencilFail = state.fail;
  material.stencilZFail = state.zFail;
  material.stencilZPass = state.zPass;
};

/**
 * A pass that writes only the stencil: a count over a source's own surfaces or its per-loop fans, or a mark, promotion
 * or clear over cap polygons. It never tests or writes depth or colour.
 */
export const createSectionStencilMaterial = (
  backend: ResolvedGraphicsBackend,
  pass: Exclude<SectionStencilPass, 'cap' | 'overlap-cap'>,
): THREE.Material => {
  const parameters = {
    name: `TauSectionStencil:${pass}`,
    side: pass === 'count-back' ? THREE.BackSide : pass === 'count-front' ? THREE.FrontSide : THREE.DoubleSide,
    colorWrite: false,
    depthTest: false,
    depthWrite: false,
    transparent: false,
    toneMapped: false,
    fog: false,
  } satisfies THREE.MeshBasicMaterialParameters;
  const material =
    backend === 'webgpu' ? new MeshBasicNodeMaterial(parameters) : new THREE.MeshBasicMaterial(parameters);
  applyStencilState(material, pass);
  return material;
};

/**
 * Turns a section-cap colour material into the `cap` pass, an opaque depth writer with the shared surface bias, or
 * the `overlap-cap` pass, which draws only where a cap of the piece is visible and so needs no depth test.
 */
export const applySectionCapStencilPass = (
  material: THREE.Material,
  backend: ResolvedGraphicsBackend,
  pass: Extract<SectionStencilPass, 'cap' | 'overlap-cap'>,
): void => {
  material.toneMapped = false;
  if (pass === 'cap') {
    applySectionCapDepthState(material, backend);
  } else {
    material.transparent = false;
    material.depthTest = false;
    material.depthWrite = false;
  }
  applyStencilState(material, pass);
  material.needsUpdate = true;
};
