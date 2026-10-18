/* oxlint-disable new-cap -- three/tsl `Fn`/`If`/`Loop`/`Break` are shader graph factories */
import { Color, DoubleSide } from 'three';
import type { Vector4 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  abs,
  bool,
  Break,
  dFdx,
  dFdy,
  float,
  Fn,
  If,
  Loop,
  min,
  positionWorld,
  select,
  uniform,
  uniformArray,
} from 'three/tsl';
import { maxSectionCapOutlineFaces } from '#graphics/three/materials/section-cap-outline.material.js';
import type { SectionCapOutlineFaces } from '#graphics/three/materials/section-cap-outline.material.js';

type SectionCapOutlineNodes = Readonly<{ mask: Node<'bool'> }>;

const nodesByFaces = new WeakMap<SectionCapOutlineFaces, SectionCapOutlineNodes>();

/** One mask graph per face set, so every outline colour reads the same uniforms, written in place. */
const outlineNodes = (faces: SectionCapOutlineFaces): SectionCapOutlineNodes => {
  const existing = nodesByFaces.get(faces);
  if (existing) {
    return existing;
  }
  const settings = uniform(faces.settings);
  const eye = uniform(faces.eye);
  const forward = uniform(faces.forward);
  const planes = uniformArray<'vec4'>(faces.planes as Vector4[], 'vec4');
  const bounds = uniformArray<'vec4'>(faces.bounds as Vector4[], 'vec4');
  // Mirrors `section-cap-outline.material.ts`: the derivatives are taken once, before any branch.
  const mask = Fn(() => {
    const point = positionWorld;
    const dx = dFdx(point).toVar();
    const dy = dFdy(point).toVar();
    const pixelWorld = eye.w
      .mul(select(forward.w.greaterThan(0.5), float(1), point.sub(eye.xyz).dot(forward.xyz)))
      .toVar();
    const isOutline = bool(false).toVar();
    Loop(maxSectionCapOutlineFaces, ({ i }) => {
      If(float(i).greaterThanEqual(settings.x), () => {
        Break();
      });
      const plane = planes.element(i);
      const bound = bounds.element(i);
      const slope = abs(dx.dot(plane.xyz)).add(abs(dy.dot(plane.xyz)));
      const distance = point.dot(plane.xyz).sub(plane.w);
      If(
        slope
          .greaterThan(pixelWorld.mul(0.02))
          .and(distance.lessThanEqual(0))
          .and(distance.greaterThan(min(slope, pixelWorld).mul(settings.y).negate()))
          .and(point.dot(bound.xyz).sub(bound.w).greaterThanEqual(0)),
        () => {
          isOutline.assign(bool(true));
          Break();
        },
      );
    });
    return isOutline;
  })() as Node<'bool'>;
  const nodes = { mask };
  nodesByFaces.set(faces, nodes);
  return nodes;
};

/** The WebGPU cap outline in one colour, mirroring `section-cap-outline.material.ts`. */
export const createSectionCapOutlineNodeMaterial = (
  faces: SectionCapOutlineFaces,
  color: number,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial({
    name: 'TauSectionCapOutline',
    side: DoubleSide,
    transparent: false,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  material.lights = false;
  material.colorNode = uniform(new Color(color));
  material.maskNode = outlineNodes(faces).mask;
  return material;
};
