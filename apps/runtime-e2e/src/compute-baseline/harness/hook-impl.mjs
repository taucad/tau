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
      `[lane-b hook] expected exactly one match in ${url} for: ${from.slice(0, 80)} (found ${parts.length - 1})`,
    );
  return parts.join(to);
};
const patches = {
  '/replicad-compute-reuse.ts': (code, url) => {
    // Off arm: the real kernel option already produced `enabled: false`; this keeps the
    // harness's own `--arm bypass` switch working without a second mechanism.
    code = replaceOnce(
      code,
      'if (!options.enabled || typeof property !== "string"',
      'if (!options.enabled || globalThis.__laneB?.semanticDisabled || typeof property !== "string"',
      url,
    );
    code = replaceOnce(
      code,
      'const restore = (bytes) => options.library.deserializeShape(text.decode(bytes));',
      'const restore = (bytes) => globalThis.__laneB.time("brep.restore", () => options.library.deserializeShape(text.decode(bytes)), bytes.byteLength);',
      url,
    );
    // W1: the byte session is gone; residency lives in the adapter, so the lookup and
    // record counters (and the poison seam) attach to the resident map instead.
    code = replaceOnce(
      code,
      'const cached = residentBytes.get(digest);',
      'const cached = globalThis.__laneB ? globalThis.__laneB.time("session.lookup", () => { const p = globalThis.__laneB; if (p.poisonBytes) { p.state.poisonedLookups += 1; p.state.lookups.hit += 1; p.state.lookups.cache += 1; return p.poisonBytes; } const v = residentBytes.get(digest); if (v) { p.state.lookups.hit += 1; p.state.lookups.cache += 1; } else { p.state.lookups.miss += 1; } return v; }, 0) : residentBytes.get(digest);',
      url,
    );
    code = replaceOnce(
      code,
      'const bytes = utf8.encode(shape.serialize());',
      'const bytes = globalThis.__laneB ? globalThis.__laneB.time("brep.serialize", () => utf8.encode(shape.serialize())) : utf8.encode(shape.serialize());',
      url,
    );
    code = replaceOnce(
      code,
      'residentBytes.set(digest, bytes);',
      'residentBytes.set(digest, bytes); if (globalThis.__laneB) { const p = globalThis.__laneB; p.note("session.record", 0, bytes.byteLength); if (p.captureRecordedBrep && !p.capturedBrep) { p.state.capturedBrep = bytes; } p.state.records.staged += 1; p.state.records.bytes += bytes.byteLength; }',
      url,
    );
    code = replaceOnce(
      code,
      'async run(scope, operation) {',
      'async run(scope, operation) { globalThis.__laneB?.note("session.open", 0);',
      url,
    );
    return code;
  },
  '/replicad.kernel.ts': (code, url) => {
    // The off arm now routes through the real kernel option (W0 collision C2).
    code = replaceOnce(
      code,
      'const computeReuseEnabled = computeReuseOption ?? assetsIdentified;',
      'const computeReuseEnabled = globalThis.__laneB?.semanticDisabled ? false : (computeReuseOption ?? assetsIdentified);',
      url,
    );
    code = replaceOnce(
      code,
      'library: computeReuse?.library ?? replicadLibrary,',
      'library: globalThis.__laneB.wrapLibrary(computeReuse?.library ?? replicadLibrary),',
      url,
    );
    code = replaceOnce(
      code,
      'const shapes = context.computeReuse ? context.computeReuse.unwrap(traced) : traced;',
      'const shapes = globalThis.__laneB.unwrapResult(context.computeReuse ? context.computeReuse.unwrap(traced) : traced);',
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
