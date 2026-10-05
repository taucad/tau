import type { AuthoredAssembly } from '@taucad/runtime/types';

/** Finite real Replicad source: four admitted reusable occurrences, each with 25 moving bodies. */
export const createMovingLinksFixture = (): {
  entryPath: string;
  files: Record<string, { content: Uint8Array<ArrayBuffer> }>;
  denominator: Readonly<{ definitions: number; occurrences: number; movingLinks: number; fixedBodies: number }>;
} => {
  const source = `import { makeBox } from 'replicad';

const chains = 5;
const depth = 5;
const label = (chain, body) => 'Link c' + chain + ' b' + body;
const linkId = (chain, body) => 'c' + chain + '-b' + body;

export default function main() {
  const shapes = [{ name: 'Ground', shape: makeBox([0, -12, -4], [122, -4, 0]), material: { name: 'Ground', pbrMetallicRoughness: { baseColorFactor: [0.2, 0.2, 0.2, 1], metallicFactor: 0, roughnessFactor: 0.7 } } }];
  for (let chain = 0; chain < chains; chain += 1) {
    for (let body = 0; body < depth; body += 1) {
      const x = 10 + body * 22;
      const y = chain * 40;
      // Native intrinsic placement S is baked in the shape; exact occurrence overlay must not apply it again.
      shapes.push({ name: label(chain, body), shape: makeBox([x, y, 0], [x + 16, y + 8, 6]), material: { name: 'Chain ' + chain, pbrMetallicRoughness: { baseColorFactor: [0.18 + chain * 0.12, 0.55, 0.7 - chain * 0.1, 1], metallicFactor: 0, roughnessFactor: 0.6 } } });
    }
  }
  return { shapes };
}

export function mechanism() {
  const links = { ground: { shapes: ['Ground'] } };
  const joints = {};
  const couplings = [];
  const coordinates = {};
  for (let chain = 0; chain < chains; chain += 1) {
    const driver = linkId(chain, 0);
    coordinates[driver] = chain % 2 === 0 ? 7 : -7;
    for (let body = 0; body < depth; body += 1) {
      const id = linkId(chain, body);
      links[id] = { shapes: [label(chain, body)] };
      const ratio = body === 1 ? 0.5 : body === 2 ? -0.5 : body === 3 ? 0.25 : -0.25;
      joints[id] = { name: label(chain, body), type: 'revolute', parent: body === 0 ? 'ground' : linkId(chain, body - 1), child: id, origin: [10 + body * 22, chain * 40, 0], axis: [0, 0, 1], limits: { lower: body === 0 ? -10 : -10 * Math.abs(ratio), upper: body === 0 ? 10 : 10 * Math.abs(ratio) } };
      if (body > 0) couplings.push({ driver, follower: id, ratio });
    }
  }
  return { schemaVersion: 1, units: { length: 'mm', angle: 'deg' }, root: 'ground', links, joints, couplings,
    animations: [{ id: 'branch-motion', name: 'Branch motion', duration: 4, loop: 'pingPong', keyframes: [{ time: 0, coordinates: {} }, { time: 2, coordinates }, { time: 4, coordinates: Object.fromEntries(Object.entries(coordinates).map(([id, value]) => [id, -value])) }] }] };
}
`;
  const encode = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);
  const sourcePath = 'motion/parts/chain.js';
  const occurrence = ({
    id,
    x,
    z,
    radians,
  }: {
    id: string;
    x: number;
    z: number;
    radians: number;
  }): AuthoredAssembly['occurrences'][number] => ({
    id,
    part: 'chain',
    transform: [
      Math.cos(radians),
      0,
      -Math.sin(radians),
      0,
      0,
      1,
      0,
      0,
      Math.sin(radians),
      0,
      Math.cos(radians),
      0,
      x,
      0,
      z,
      1,
    ],
  });
  const authored: AuthoredAssembly = {
    schemaVersion: 1,
    parts: { chain: { source: { path: sourcePath } } },
    // Flat paths are required by the accepted pinned STEP route. Nested source links remain genuine.
    occurrences: [
      occurrence({ id: 'a', x: 0, z: 0, radians: 0 }),
      occurrence({ id: 'b', x: 0.25, z: 0, radians: Math.PI / 12 }),
      occurrence({ id: 'c', x: 0, z: -0.25, radians: -Math.PI / 12 }),
      occurrence({ id: 'd', x: 0.25, z: -0.25, radians: Math.PI / 6 }),
    ],
  };
  const entryPath = 'motion/assembly.json';
  return {
    entryPath,
    files: { [sourcePath]: { content: encode(source) }, [entryPath]: { content: encode(JSON.stringify(authored)) } },
    denominator: { definitions: 1, occurrences: 4, movingLinks: 100, fixedBodies: 4 },
  };
};
