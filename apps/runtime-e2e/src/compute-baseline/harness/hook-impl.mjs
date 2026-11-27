// Benchmark-only module seams (never touches production files on disk, and rewrites no source text).
//
// The Replicad kernel's own imports of two public module boundaries resolve to a generated module that re-exports the
// exact module the kernel would have loaded, with one export replaced by a delegate to the probe
// (`globalThis.__laneB`, harness/probe.mts):
// - `replicad`: `setOperationCache`, through which the live tier installs its operation cache on the kernel's
//   library facade (the kernel copies the module's exports into that facade).
// - `@taucad/runtime/kernel`: `createKernelLibraryTracer`, which receives the library user code is handed and
//   unwraps what user code returns (the identity tracer and the BRep digest observers).
// Every seam is keyed on the importing module and the imported specifier, so a kernel edit that keeps those imports
// keeps the seam; one that drops them fails the run (run-arm asserts every seam was reached).
import { appendFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

/** Repository root as a `file://` prefix (this file lives at apps/runtime-e2e/src/compute-baseline/harness). */
const repoRootUrl = `${pathToFileURL(resolvePath(import.meta.dirname, '../../../../..')).href}/`;
const seamUrl = new URL('./lane-b-seam.mjs', import.meta.url).href;

const seams = {
  '/packages/plugins/replicad/src/replicad.kernel.ts': {
    replicad: (target) => [
      `import * as real from ${JSON.stringify(target)};`,
      `export * from ${JSON.stringify(target)};`,
      `globalThis.__laneBPatched = [...(globalThis.__laneBPatched ?? []), 'replicad'];`,
      'export const setOperationCache =',
      "  typeof real.setOperationCache === 'function'",
      '    ? (cache) => (globalThis.__laneB?.setOperationCache ?? ((next) => real.setOperationCache(next)))(cache, real)',
      '    : real.setOperationCache;',
    ],
    '@taucad/runtime/kernel': (target) => [
      `import * as real from ${JSON.stringify(target)};`,
      `export * from ${JSON.stringify(target)};`,
      `globalThis.__laneBPatched = [...(globalThis.__laneBPatched ?? []), '@taucad/runtime/kernel'];`,
      'export const createKernelLibraryTracer = (options) =>',
      '  globalThis.__laneB?.createKernelLibraryTracer',
      '    ? globalThis.__laneB.createKernelLibraryTracer(options, real.createKernelLibraryTracer)',
      '    : real.createKernelLibraryTracer(options);',
    ],
  },
};

const importerSeams = (parentURL) => {
  if (!parentURL?.startsWith('file:')) return undefined;
  const path = new URL(parentURL).pathname;
  const key = Object.keys(seams).find((suffix) => path.endsWith(suffix));
  return key ? seams[key] : undefined;
};

export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context);
  const seam = importerSeams(context.parentURL)?.[specifier];
  if (!seam) return result;
  const url = new URL(seamUrl);
  url.searchParams.set('specifier', specifier);
  url.searchParams.set('importer', context.parentURL);
  url.searchParams.set('target', result.url);
  return { url: url.href, format: 'module', shortCircuit: true };
}

export async function load(url, context, nextLoad) {
  if (url.startsWith(`${seamUrl}?`)) {
    const { searchParams } = new URL(url);
    const seam = importerSeams(searchParams.get('importer'))?.[searchParams.get('specifier')];
    return { format: 'module', source: `${seam(searchParams.get('target')).join('\n')}\n`, shortCircuit: true };
  }
  const result = await nextLoad(url, context);
  const loadLog = process.env.TAU_COMPUTE_BASELINE_LOAD_LOG;
  if (
    loadLog &&
    url.startsWith(repoRootUrl) &&
    !url.includes('/node_modules/') &&
    !url.includes('/apps/runtime-e2e/src/compute-baseline/harness/') &&
    !url.includes('/packages/plugins/replicad/src/utils/replicad-to-gltf.ts')
  ) {
    const path = fileURLToPath(url.split('?')[0]);
    const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
    appendFileSync(loadLog, `${JSON.stringify({ path, sha256 })}\n`);
  }
  return result;
}
