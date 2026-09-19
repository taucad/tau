/**
 * Overhead floor of op-level interception, independent of storage and of OCCT: the production canonicalization + hashing
 * path per action (what `KernelComputeSession.lookup/record` pay per supported op), byte copies, and SHA-256 over
 * BRep-sized payloads. Usage: node --import @oxc-node/core/register spikes/compute-reuse/lane-b/overhead-floor.mts [--out file.json]
 */
import { writeFileSync } from 'node:fs';
import { loadavg, cpus } from 'node:os';
import { parseArgs } from 'node:util';
import {
  canonicalizeComputeAction,
  digestAction,
  digestContent,
  actionDigest,
  canonicalizeCacheValue,
} from '../../../packages/core/cache/src/index.ts';
import type { ComputeAction } from '../../../packages/core/cache/src/index.ts';
import { sha256StringSync, sha256BytesSync } from '../../../libs/utils/src/hash.utils.ts';

const { values } = parseArgs({ options: { out: { type: 'string' }, reps: { type: 'string', default: '5' } } });
const digestOf = (seed: string) => `sha256:${sha256StringSync(seed)}` as ComputeAction['inputs'][number]['digest'];
const producer = {
  id: '@taucad/replicad',
  version: 'replicad@0.23.4-beta.2|replicad-opencascadejs@0.23.0-beta.0|adapter@1',
  implementationAssets: [digestOf('wasm'), digestOf('bindings')].map((d) => d as any),
};
const environment = { wasmVariant: 'multi', lengthUnit: 'millimeter' };
const codec = { id: 'replicad-brep-text', version: '1' };
const action = (operation: string, inputs: number, args: Record<string, unknown>): ComputeAction => ({
  schemaVersion: 1,
  namespace: 'replicad.compute',
  producer: producer as any,
  operation,
  inputs: Array.from({ length: inputs }, (_, index) => ({
    kind: 'action' as const,
    role: index === 0 ? 'receiver' : `operand:${index - 1}`,
    digest: digestOf(`${operation}-${index}`),
  })),
  arguments: args as any,
  environment,
  codec,
});
const actions: Record<string, ComputeAction> = {
  'makeCylinder (primitive, 0 inputs)': action('makeCylinder', 0, {
    radius: 2.75,
    height: 1.6,
    location: [0, 0, -1.6],
    direction: [0, 0, 1],
  }),
  'translate (1 input)': action('translate', 1, { vector: [12.5, -7.25, 3] }),
  'fuse (2 inputs)': action('fuse', 2, { optimisation: 'none' }),
  'cutAll (1 + 8 operands)': action('cutAll', 9, { optimisation: 'none' }),
  'cutAll (1 + 64 operands)': action('cutAll', 65, { optimisation: 'none' }),
};

const timeSync = (fn: () => unknown, iterations: number): number => {
  const t0 = performance.now();
  for (let i = 0; i < iterations; i += 1) fn();
  return ((performance.now() - t0) * 1000) / iterations; // µs/op
};
const timeAsync = async (fn: () => Promise<unknown>, iterations: number): Promise<number> => {
  const t0 = performance.now();
  for (let i = 0; i < iterations; i += 1) await fn();
  return ((performance.now() - t0) * 1000) / iterations;
};
const reps = Number(values.reps);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
const repeatSync = (fn: () => unknown, iterations: number) =>
  median(Array.from({ length: reps }, () => timeSync(fn, iterations)));
const repeatAsync = async (fn: () => Promise<unknown>, iterations: number) =>
  median(await Promise.all(Array.from({ length: reps }, () => timeAsync(fn, iterations))));

const out: Record<string, unknown> = {
  at: new Date().toISOString(),
  node: process.version,
  cpu: cpus()[0]?.model,
  load: loadavg(),
  reps,
};
const perAction: Record<string, Record<string, number>> = {};
for (const [name, value] of Object.entries(actions)) {
  const canonical = canonicalizeComputeAction(value);
  const prepared = new Map<string, number>();
  for (let i = 0; i < 4096; i += 1)
    prepared.set(canonicalizeComputeAction(action('fuse', 2, { optimisation: 'none', salt: i })), i);
  prepared.set(canonical, -1);
  perAction[name] = {
    canonicalBytes: canonical.length,
    'canonicalize µs (lookup path)': repeatSync(() => canonicalizeComputeAction(value), 5000),
    'map.get(canonical) µs, 4096 entries': repeatSync(() => prepared.get(canonical), 100000),
    'sha256StringSync(canonical) µs': repeatSync(() => sha256StringSync(canonical), 5000),
    'actionDigest brand/parse µs': repeatSync(() => actionDigest({ value: `sha256:${'a'.repeat(64)}` }), 20000),
    'record path total µs (canonicalize + sha256 + brand)': repeatSync(
      () => actionDigest({ value: `sha256:${sha256StringSync(canonicalizeComputeAction(value))}` }),
      5000,
    ),
    'digestAction async µs (flush path, subtle.crypto)': await repeatAsync(() => digestAction({ action: value }), 500),
  };
}
out.perAction = perAction;
const payloads: Record<string, number> = {
  '2 KB (cylinder BRep text)': 2_048,
  '60 KB (drone plate)': 61_440,
  '600 KB (stress-test final)': 614_400,
  '6 MB (heavy compound)': 6_291_456,
};
const perPayload: Record<string, Record<string, number>> = {};
for (const [name, size] of Object.entries(payloads)) {
  const text = 'DBRep_DrawableShape\n'.repeat(Math.ceil(size / 20)).slice(0, size);
  const bytes = new TextEncoder().encode(text);
  const iterations = size > 1_000_000 ? 20 : 200;
  perPayload[name] = {
    bytes: bytes.byteLength,
    'TextEncoder.encode µs (publish)': repeatSync(() => new TextEncoder().encode(text), iterations),
    'TextDecoder.decode µs (restore)': repeatSync(() => new TextDecoder().decode(bytes), iterations),
    'new Uint8Array(copy) µs (session lookup/record copy)': repeatSync(() => new Uint8Array(bytes), iterations),
    'sha256BytesSync µs': repeatSync(() => sha256BytesSync(bytes), iterations),
    'digestContent async µs (flush path)': await repeatAsync(
      () => digestContent({ bytes: bytes as Uint8Array<ArrayBuffer> }),
      Math.max(10, iterations / 4),
    ),
    'canonicalizeCacheValue({text}) µs': repeatSync(
      () => canonicalizeCacheValue({ value: { text } as any }),
      Math.max(5, iterations / 10),
    ),
  };
}
out.perPayload = perPayload;
out.loadAfter = loadavg();
const text = JSON.stringify(out, null, 2);
if (values.out) writeFileSync(values.out, text);
console.log(text);
