// Benchmark-only source substitution (never touches production files on disk).
// Every substitution must match exactly once or the run aborts.
import { appendFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/** Repository root as a `file://` prefix (this file lives at apps/runtime-e2e/src/compute-baseline/harness). */
const repoRootUrl = `${pathToFileURL(resolve(import.meta.dirname, '../../../../..')).href}/`;
const decode = (source) => (typeof source === 'string' ? source : new TextDecoder().decode(source));
const replaceOnce = (code, from, to, url) => {
  const parts = code.split(from);
  if (parts.length !== 2)
    throw new Error(
      `[lane-b hook] expected exactly one match in ${url} for: ${from.slice(0, 80)} (found ${parts.length - 1}). ` +
        'The kernel source changed under the benchmark harness: update the substitution in ' +
        'apps/runtime-e2e/src/compute-baseline/harness/hook-impl.mjs to the new source.',
    );
  return parts.join(to);
};
const patches = {
  '/replicad.kernel.ts': (code, url) => {
    // Arm selection goes through the kernel's own `computeReuse` option (run-arm.mts), not a source patch.
    // The live tier installs its operation cache through this facade for each build; the probe instruments
    // `setOperationCache` on it (operation counts, native solves, BRep capture, the poison arm). The tier's
    // hit, miss and store counts are read from the `replicad.run-main` span, not patched in.
    code = replaceOnce(
      code,
      'const replicadLibrary = { ...replicadModule };',
      'const replicadLibrary = globalThis.__laneB.liveTierLibrary({ ...replicadModule });',
      url,
    );
    // The library user code receives, for the identity tracer and the BRep digest observers.
    code = replaceOnce(
      code,
      'createKernelLibraryTracer({\n\t\t\t\tlibrary: replicadLibrary,',
      'createKernelLibraryTracer({\n\t\t\t\tlibrary: globalThis.__laneB.wrapLibrary(replicadLibrary),',
      url,
    );
    code = replaceOnce(
      code,
      'const shapes = context.libraryTrace.unwrap(mainResult.value);',
      'const shapes = globalThis.__laneB.unwrapResult(context.libraryTrace.unwrap(mainResult.value));',
      url,
    );
    return code;
  },
  '/build123d.kernel.ts': (code, url) => {
    // Bypass arm: the worker must not receive a `compute` block at all (its adapter serializes per op regardless of the store).
    code = replaceOnce(
      code,
      'compute: {\n\t\t\t\t\t\tnamespace: computeNamespace,',
      '...globalThis.__laneB.build123dCompute({ compute: {\n\t\t\t\t\t\tnamespace: computeNamespace,',
      url,
    );
    code = replaceOnce(code, 'preload\n\t\t\t\t\t}\n\t\t\t\t},', 'preload\n\t\t\t\t\t} }),\n\t\t\t\t},', url);
    return code;
  },
};
export async function load(url, context, nextLoad) {
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
  const key = Object.keys(patches).find((suffix) => url.endsWith(suffix));
  if (!key) return result;
  const source = decode(result.source);
  const index = source.lastIndexOf('\n//# sourceMappingURL=');
  const body = index === -1 ? source : source.slice(0, index);
  const tail = index === -1 ? '' : source.slice(index);
  const patched = patches[key](body, url);
  globalThis.__laneBPatched = [...(globalThis.__laneBPatched ?? []), key];
  return { ...result, source: patched + tail };
}
