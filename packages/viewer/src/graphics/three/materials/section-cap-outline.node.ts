/* oxlint-disable new-cap -- three/tsl `Fn`/`If`/`Loop`/`Break` are shader graph factories */
import { squarePixelStripCoverage } from '#graphics/three/materials/line-coverage.js';
import { namedUniformArray } from '#graphics/three/materials/named-uniform-array.js';
import { Color, DoubleSide, WebGPUCoordinateSystem } from 'three';
import type { PerspectiveCamera, Vector4 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import type { Node, NodeBuilder } from 'three/webgpu';
import {
  Break,
  cameraFar,
  cameraNear,
  cameraProjectionMatrix,
  cameraViewMatrix,
  dFdx,
  dFdy,
  float,
  Fn,
  frontFacing,
  If,
  length,
  Loop,
  max,
  min,
  positionWorld,
  select,
  uniform,
  vec2,
  vec4,
  viewZToLogarithmicDepth,
  viewZToOrthographicDepth,
} from 'three/tsl';
import {
  maxSectionCapOutlineFaces,
  sectionCapOutlineBlending,
} from '#graphics/three/materials/section-cap-outline.material.js';
import type { SectionCapOutlineFaces } from '#graphics/three/materials/section-cap-outline.material.js';

type SectionCapOutlineNodes = Readonly<{ coverage: Node<'float'>; depth: Node<'float'> }>;

const nodesByFaces = new WeakMap<SectionCapOutlineFaces, SectionCapOutlineNodes>();

/** One coverage graph per face set, so every outline colour reads the same uniforms, written in place. */
const outlineNodes = (faces: SectionCapOutlineFaces): SectionCapOutlineNodes => {
  const existing = nodesByFaces.get(faces);
  if (existing) {
    return existing;
  }
  const settings = uniform(faces.settings);
  const eye = uniform(faces.eye);
  const forward = uniform(faces.forward);
  const planes = namedUniformArray(faces.planes as Vector4[], 'tauCapPlanes');
  const bounds = namedUniformArray(faces.bounds as Vector4[], 'tauCapBounds');
  // Mirrors `section-cap-outline.material.ts`: the derivatives are taken once, before any branch.
  // `x` is the coverage, `y` how far back along the view ray the nearest crossing of a face's plane lies, or 0.
  const outline = Fn(() => {
    const point = positionWorld;
    const dx = dFdx(point).toVar();
    const dy = dFdy(point).toVar();
    const isOrthographic = forward.w.greaterThan(0.5);
    const pixelWorld = eye.w.mul(select(isOrthographic, float(1), point.sub(eye.xyz).dot(forward.xyz))).toVar();
    const ray = select(isOrthographic, forward.xyz, point.sub(eye.xyz)).toVar();
    const result = vec2(0, 0).toVar();
    Loop(maxSectionCapOutlineFaces, ({ i }) => {
      If(float(i).greaterThanEqual(settings.x), () => {
        Break();
      });
      const plane = planes.element(i);
      const bound = bounds.element(i);
      const gradient = vec2(dx.dot(plane.xyz), dy.dot(plane.xyz)).toVar();
      const slope = length(gradient).toVar();
      const distance = point.dot(plane.xyz).sub(plane.w).toVar();
      If(slope.greaterThan(pixelWorld.mul(0.02)).and(point.dot(bound.xyz).sub(bound.w).greaterThanEqual(0)), () => {
        const pixels = distance.negate().div(slope).toVar();
        const support = gradient.x.abs().add(gradient.y.abs()).div(slope).mul(0.5).toVar();
        // These meshes cover whole surfaces; evaluate exact area only inside the strip's pixel footprint.
        If(pixels.greaterThan(support.negate()).and(pixels.lessThan(settings.y.add(support))), () => {
          const halfWidth = settings.y.mul(0.5);
          const faceCoverage = squarePixelStripCoverage(gradient.div(slope), pixels.sub(halfWidth), halfWidth).toVar();
          result.x.assign(max(result.x, faceCoverage));
          const along = ray.dot(plane.xyz).toVar();
          If(faceCoverage.greaterThan(0).and(frontFacing.not()).and(along.lessThan(0)), () => {
            result.y.assign(min(result.y, distance.negate().div(along)));
          });
        });
      });
    });
    return result;
  })();
  const coverage = outline.x;
  // The crossing's depth in the renderer's own convention; a fragment with no crossing keeps its own.
  const depth = Fn((builder: NodeBuilder) => {
    const ray = select(forward.w.greaterThan(0.5), forward.xyz, positionWorld.sub(eye.xyz));
    const view = cameraViewMatrix.mul(vec4(positionWorld.add(ray.mul(outline.y)), 1)).toVar();
    if (builder.renderer.logarithmicDepthBuffer) {
      return (builder as NodeBuilder & { camera?: Partial<PerspectiveCamera> }).camera?.isPerspectiveCamera === true
        ? viewZToLogarithmicDepth(view.z, cameraNear, cameraFar)
        : viewZToOrthographicDepth(view.z, cameraNear, cameraFar);
    }
    const clip = cameraProjectionMatrix.mul(view).toVar();
    const ndc = clip.z.div(clip.w);
    return builder.renderer.coordinateSystem === WebGPUCoordinateSystem ? ndc : ndc.mul(0.5).add(0.5);
  })();
  const nodes = { coverage, depth };
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
    ...sectionCapOutlineBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  material.lights = false;
  material.colorNode = uniform(new Color(color));
  const { coverage, depth } = outlineNodes(faces);
  material.opacityNode = coverage;
  material.maskNode = coverage.greaterThan(0);
  material.depthNode = depth;
  return material;
};
