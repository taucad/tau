/**
 * Which parts of a GLB are reproducible? Splits every dumped GLB into
 *   mesh   = the bufferViews referenced by accessors, hashed in accessor order (positions/normals/indices/edges)
 *   topo   = the `TAU_cad_topology` extension payload (`topologyBufferView`), whose `faceId`s are OCCT hash codes
 *   struct = the JSON chunk minus `asset`/`extras`/`generator` and minus the topology view's byte offsets
 * and reports, per (model, arm, step) group, whether each part repeats across renders.
 * Usage: node --import @oxc-node/core/register spikes/compute-reuse/lane-b/glb-determinism.mts <dir-of-glbs> [...]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename } from 'node:path';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex').slice(0, 8);
const split = (path: string) => {
  const bytes = readFileSync(path);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const binOffset = 20 + jsonLength;
  const bin = bytes.subarray(binOffset + 8, binOffset + 8 + view.getUint32(binOffset, true));
  const slice = (index: number) => {
    const v = json.bufferViews[index];
    return bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
  };
  const meshHash = createHash('sha256');
  for (const accessor of json.accessors ?? []) meshHash.update(slice(accessor.bufferView));
  const topologyView = json.extensions?.['TAU_cad_topology']?.topologyBufferView;
  const strip = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(strip)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .filter(
                ([k]) =>
                  k !== 'extras' && k !== 'asset' && k !== 'generator' && k !== 'byteLength' && k !== 'byteOffset',
              )
              .map(([k, v]) => [k, strip(v)]),
          )
        : value;
  const triangles = (json.meshes ?? [])
    .flatMap((m: any) => m.primitives ?? [])
    .filter((p: any) => (p.mode ?? 4) === 4)
    .reduce((total: number, p: any) => total + (p.indices === undefined ? 0 : json.accessors[p.indices].count / 3), 0);
  return {
    mesh: meshHash.digest('hex').slice(0, 8),
    topo: topologyView === undefined ? '—' : sha(slice(topologyView)),
    topoBytes: topologyView === undefined ? 0 : json.bufferViews[topologyView].byteLength,
    struct: sha(new TextEncoder().encode(JSON.stringify(strip(json)))),
    whole: sha(bin),
    triangles,
    binBytes: bin.byteLength,
  };
};

const groups: Record<string, { file: string; parts: ReturnType<typeof split> }[]> = {};
for (const directory of process.argv.slice(2)) {
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.glb'))) {
    // <model>-<arm>-<step>-<n>.glb
    const key = basename(file, '.glb').replace(/-\d+$/, '');
    (groups[key] ??= []).push({ file, parts: split(join(directory, file)) });
  }
}
console.log(
  '\n| model-arm-step | renders | mesh digests | topology digests | topology bytes | structure digests | whole-BIN digests | triangles |',
);
console.log('|---|---:|---|---|---|---|---|---|');
const uniq = (values: string[]) => {
  const set = [...new Set(values)];
  return `${set.length === 1 ? 'stable' : `${set.length} distinct`} (${set.slice(0, 3).join(' ')}${set.length > 3 ? ' …' : ''})`;
};
for (const [key, rows] of Object.entries(groups).sort()) {
  console.log(
    `| ${key} | ${rows.length} | ${uniq(rows.map((r) => r.parts.mesh))} | ${uniq(rows.map((r) => r.parts.topo))} | ${[...new Set(rows.map((r) => r.parts.topoBytes))].join('/')} | ${uniq(rows.map((r) => r.parts.struct))} | ${uniq(rows.map((r) => r.parts.whole))} | ${[...new Set(rows.map((r) => r.parts.triangles))].join('/')} |`,
  );
}
