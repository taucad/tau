/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire JSON field names */
/**
 * Checks the names `enrichZooGltfTopology` gives a program's bodies against the engine, offline or live.
 *
 * Offline, the glTF names each solid's node after its engine id, so every body's name is checked exactly. Zoo's glTF
 * carries no ids, so live a body named `planets[1]` must instead have the volume and centre of mass the engine reports
 * for the solid that variable holds. Those come from separate engine queries, not from the bounding boxes the names
 * were matched by. Solids in the same place with the same volume (three planets on one pin) pass either way, as their
 * names are interchangeable.
 */
import { NodeIO } from '@gltf-transform/core';
import type { Document } from '@gltf-transform/core';
import { registerTauGltfExtensions } from '@taucad/geometry-core';
import type { TauCadTopologyRoot } from '@taucad/geometry-core';
import { tauCadTopologyExtension } from '@taucad/runtime/types';
import type { KclValueView } from '@taucad/kcl-wasm-lib/bindings/KclValueView';
import { KclUtilities } from '#kcl-utils.js';
import { enrichZooGltfTopology } from '#zoo-gltf-topology.utils.js';

type Vector = { x: number; y: number; z: number };

// Tessellation loses a little volume on curved faces.
const volumeTolerance = 0.03;
// Of the body's bounding-box diagonal, plus an absolute floor for float32 positions in metres.
const centerTolerance = 0.02;
const centerFloor = 0.05;

/**
 * Volume (mm³) and centroid (mm, Z up) of a mesh's closed surface, summed over the signed tetrahedra its triangles
 * make with the origin.
 *
 * @param document - the glTF
 * @param meshIndex - the body's mesh
 * @returns the volume, centroid and box diagonal
 */
const measureMesh = (document: Document, meshIndex: number): { volume: number; center: number[]; diagonal: number } => {
  const mesh = document.getRoot().listMeshes()[meshIndex]!;
  let volume = 0;
  const moment = [0, 0, 0];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const primitive of mesh.listPrimitives()) {
    const positions = primitive.getAttribute('POSITION');
    if (!positions) {
      continue;
    }
    const indices = primitive.getIndices();
    const count = indices ? indices.getCount() : positions.getCount();
    // From glTF metres with Y up, to millimetres with Z up.
    const vertex = (index: number): number[] => {
      const [x, y, z] = positions.getElement(indices ? indices.getScalar(index) : index, []) as number[];
      return [x! * 1000, -z! * 1000, y! * 1000];
    };
    for (let index = 0; index + 2 < count; index += 3) {
      const [a, b, c] = [vertex(index), vertex(index + 1), vertex(index + 2)];
      const signed =
        (a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) -
          a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) +
          a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) /
        6;
      volume += signed;
      for (let axis = 0; axis < 3; axis += 1) {
        moment[axis]! += (signed * (a[axis]! + b[axis]! + c[axis]!)) / 4;
        min[axis] = Math.min(min[axis]!, a[axis]!, b[axis]!, c[axis]!);
        max[axis] = Math.max(max[axis]!, a[axis]!, b[axis]!, c[axis]!);
      }
    }
  }
  return {
    volume: Math.abs(volume),
    center: moment.map((value) => value / volume),
    diagonal: Math.hypot(...max.map((value, axis) => value - min[axis]!)),
  };
};

/**
 * Checks a body's mesh against the engine's volume and centre of mass for the solid its name refers to.
 *
 * @param utils - utilities that have executed the program
 * @param document - the named glTF
 * @param named - the named body and the engine id of the solid it is named after
 * @returns the departure, if any
 */
const checkBodyMass = async (
  utils: KclUtilities,
  document: Document,
  { body, id }: { body: { name: string; meshIndex?: number }; id: string },
): Promise<string[]> => {
  if (body.meshIndex === undefined) {
    return [`${body.name} has no mesh`];
  }
  const [volumeResponse, centerResponse] = await Promise.all([
    utils.sendModelingQuery<{ volume: number }>({ type: 'volume', entity_ids: [id], output_unit: 'cm3' }),
    utils.sendModelingQuery<{ center_of_mass: Vector }>({
      type: 'center_of_mass',
      entity_ids: [id],
      output_unit: 'mm',
    }),
  ]);
  const expectedVolume = volumeResponse!.volume * 1000;
  const { x, y, z } = centerResponse!.center_of_mass;
  const mesh = measureMesh(document, body.meshIndex);
  const offset = Math.hypot(mesh.center[0]! - x, mesh.center[1]! - y, mesh.center[2]! - z);
  const format = (values: readonly number[]): string => values.map((value) => value.toFixed(2)).join(', ');
  return Math.abs(mesh.volume - expectedVolume) > volumeTolerance * expectedVolume ||
    offset > centerTolerance * mesh.diagonal + centerFloor
    ? [
        `${body.name}: body has volume ${mesh.volume.toFixed(1)} at ${format(mesh.center)}; ` +
          `its solid has ${expectedVolume.toFixed(1)} at ${format([x, y, z])}`,
      ]
    : [];
};

/**
 * Names the bodies of the program `utils` last executed, the way the kernel's render does, and checks each name.
 *
 * @param utils - utilities that have executed the program
 * @param variables - the program's variables
 * @param oracle - `node-ids` when node names are engine solid ids (offline), `mass` otherwise
 * @returns one line per wrongly named or unnamed body; empty when every named solid names its own body
 */
export async function checkKclBodyNames(
  utils: KclUtilities,
  variables: Partial<Record<string, KclValueView>>,
  oracle: 'node-ids' | 'mass',
): Promise<string[]> {
  const names = KclUtilities.collectSolidNames(variables);
  if (names.size === 0) {
    return [];
  }
  const bounds = await utils.getSceneSolidBounds(new Set(names.keys()));
  // Live, every named solid could go unmeasured and the check pass with nothing to check.
  if (oracle === 'mass' && bounds.length === 0) {
    return ['the engine measured none of the named solids'];
  }
  const [file] = await utils.exportFromMemory({ type: 'gltf', storage: 'binary' });
  if (!file) {
    return ['the export has no glTF'];
  }
  const io = registerTauGltfExtensions(new NodeIO());
  const document = await io.readBinary(
    await enrichZooGltfTopology(file.contents, {
      format: 'glb',
      namedSolidBounds: bounds.map(({ id, min, max }) => ({ name: names.get(id)!, min, max })),
    }),
  );
  const payload = document.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)?.getPayload();
  const bodies = (
    (payload?.['components'] ?? []) as Array<{ kind: string; name: string; nodeIndex?: number; meshIndex?: number }>
  ).filter((component) => component.kind === 'body');
  const idByName = new Map([...names].map(([id, name]) => [name, id]));
  if (oracle === 'node-ids') {
    const measured = new Set(bounds.map(({ id }) => id));
    const nodes = document.getRoot().listNodes();
    return bodies.flatMap((body) => {
      const id = nodes[body.nodeIndex!]?.getName() ?? '';
      const expected = measured.has(id) ? names.get(id) : undefined;
      return body.name === (expected ?? body.name) && (expected !== undefined || !idByName.has(body.name))
        ? []
        : [`solid ${id} is named ${body.name}, not ${expected ?? 'Solid N'}`];
    });
  }

  const named = bodies.filter((body) => idByName.has(body.name));
  const departures = await Promise.all(
    named.map(async (body) => checkBodyMass(utils, document, { body, id: idByName.get(body.name)! })),
  );
  return [
    ...(named.length === bounds.length ? [] : [`${named.length} of ${bounds.length} named scene solids name a body`]),
    ...departures.flat(),
  ];
}
