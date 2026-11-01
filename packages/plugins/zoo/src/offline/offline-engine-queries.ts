/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/* oxlint-disable eslint/max-params -- libcascade helpers take the instance followed by their operands */
/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire JSON field names */
/**
 * Face, edge and mass queries for {@link OfflineEngine}: command handlers that take the engine as their first argument.
 */
import type { Frame } from '#offline/offline-math.js';
import { add, scale, sub, vec3 } from '#offline/offline-math.js';
import { boundingBox, compound, areaOf, volumeOf, planarFaceFrame, subShapes } from '#offline/offline-occt.js';
import { adjacentEdge, requireFace } from '#offline/offline-topology.js';
import type { ModelingCommand } from '#offline/offline-engine.types.js';
import type { OfflineEngine } from '#offline/offline-engine.js';
import { unitScale } from '#offline/offline-engine-support.js';

/**
 * Reports whether a face or plane is planar, with its frame.
 *
 * @param engine - offline engine
 * @param id - command id
 * @param faceId - face or plane id
 * @returns the response
 */
export function faceIsPlanar(engine: OfflineEngine, id: string, faceId: string): Record<string, unknown> {
  const plane = engine.scene.find(faceId);
  let frame: Frame;
  if (plane?.kind === 'plane') {
    frame = plane.frame;
  } else {
    const { solid, face } = engine.faceById(faceId);
    if (!planarFaceFrame(engine.oc, face)) {
      return {};
    }

    frame = engine.faceFrame(solid, faceId, face);
  }

  // Kcl-lib's `planeOf` then sketches on the command id as a plane.
  engine.scene.entities.set(id, { kind: 'plane', id, frame, hidden: true });
  return { origin: frame.origin, x_axis: frame.x, y_axis: frame.y, z_axis: frame.z };
}

/**
 * Finds the edge next to or before an edge around a face.
 *
 * @param engine - offline engine
 * @param cmd - command payload
 * @param which - which neighbour
 * @returns the response
 */
export function adjacent(
  engine: OfflineEngine,
  cmd: ModelingCommand,
  which: 'next' | 'previous',
): Record<string, unknown> {
  const solid = engine.solidFor(cmd['object_id'] as string, cmd['edge_id'] as string);
  const edge = engine.edgeById(solid, cmd['edge_id'] as string);
  const face = requireFace(engine.oc, solid, cmd['face_id'] as string);
  const found = adjacentEdge(engine.oc, face, edge, which);
  return { edge: found ? engine.edgeId(solid, found) : null };
}

/**
 * Measures the entities' axis-aligned bounding box in the requested unit.
 *
 * @param engine - offline engine
 * @param cmd - command payload
 * @returns the response
 */
export function measureBoundingBox(engine: OfflineEngine, cmd: ModelingCommand): Record<string, unknown> {
  const shapes = engine.shapesOf(cmd['entity_ids'] as string[]);
  const box = shapes.length > 0 ? boundingBox(engine.oc, compound(engine.oc, shapes)) : undefined;
  const factor = unitScale(cmd['output_unit'] as string, 1);
  if (!box) {
    return { center: vec3(0, 0, 0), dimensions: vec3(0, 0, 0), output_unit: cmd['output_unit'] };
  }

  return {
    center: scale(scale(add(box.min, box.max), 0.5), factor),
    dimensions: scale(sub(box.max, box.min), factor),
    output_unit: cmd['output_unit'],
  };
}

/**
 * Sums the volume or surface area of the given entities, or of the visible solids.
 *
 * @param engine - offline engine
 * @param cmd - command payload
 * @param key - quantity to sum
 * @returns the total in millimetre units
 */
export function sumMass(engine: OfflineEngine, cmd: ModelingCommand, key: 'volume' | 'area'): number {
  return engine
    .shapesOf(cmd['entity_ids'] as string[])
    .reduce((total, shape) => total + (key === 'volume' ? volumeOf(engine.oc, shape) : areaOf(engine.oc, shape)), 0);
}

/**
 * The Zoo entity type of an id.
 *
 * @param engine - offline engine
 * @param id - command id
 * @returns the type name
 */
export function entityType(engine: OfflineEngine, id: string): string {
  const entity = engine.scene.find(id);
  if (entity) {
    return { path: 'path', region: 'solid2d', solid: 'solid3d', plane: 'plane', curve: 'curve' }[entity.kind];
  }

  const owner = engine.scene.ownerOf(id);
  if (owner?.faces.has(id)) {
    return 'face';
  }

  return owner ? 'edge' : 'entity';
}

/**
 * Whether a body is a solid or a surface, as `Solid3dGetBodyType` answers it: a body with a closed volume is a solid,
 * one made only of faces (a `bodyType = SURFACE` sweep, an open shell) is a surface.
 *
 * @param engine - offline engine
 * @param cmd - command payload
 * @returns the response
 */
export function bodyType(engine: OfflineEngine, cmd: ModelingCommand): Record<string, unknown> {
  const solid = engine.scene.getSolid(cmd['object_id'] as string);
  return { body_type: subShapes(engine.oc, solid.shape, 'TopAbs_SOLID').length > 0 ? 'solid' : 'surface' };
}
