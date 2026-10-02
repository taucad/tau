// tscircuit packages build their schemas with the zod 3 API (`z.function().args`, ...) but
// declare `zod` as a peer (`*` / `3`) or not at all (circuit-json imports it undeclared), so under
// Tau's zod 4 workspace they resolve zod 4 and break at load. pnpm links a peer from the parent
// whether the range is met or not, and neither `overrides` nor `packageExtensions` can remove a
// peer, so the only way to nest zod 3 under them is to make it a regular dependency here.
// Owner: docs/research/tscircuit-eda-kernel-charter.md (D1). Remove when upstream is zod-4 clean.
const zod3Consumers = new Set([
  '@tscircuit/props',
  '@tscircuit/circuit-json-util',
  '@tscircuit/soup-util',
  'circuit-json',
]);

function readPackage(pkg) {
  if (zod3Consumers.has(pkg.name)) {
    if (pkg.peerDependencies?.zod !== undefined) {
      delete pkg.peerDependencies.zod;
    }
    pkg.dependencies = { ...pkg.dependencies, zod: '^3.25.76' };
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
