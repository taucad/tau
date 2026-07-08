/**
 * Minimal sub-assembly export (README handshake): the parts named in
 * `params.include`, in build order, at their absolute assembly placements.
 *
 * A GeoSpec proof references only a handful of occurrences (a void's `material`
 * set, or a relationship's subject/target); loading just those instead of the
 * full 650-part assembly serializes a fraction of the heavy-casting topology, so
 * the STEP export completes inside the model-load budget with an identical
 * verdict. Callers pass the include set through `loadModel({ parameters })`.
 */
import { buildSubAssembly } from '../lib/assembly.js';

export default function main(params: {
  include?: readonly string[];
  withProbes?: boolean;
}) {
  return buildSubAssembly(
    new Set(params.include ?? []),
    Boolean(params.withProbes),
  );
}
