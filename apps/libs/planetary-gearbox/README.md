# @taucad/planetary-gearbox

The authored 34-part planetary gearbox showcase, shared by the marketing site story (`apps/www`) and the Tau app's sign-in design story. It owns:

- `assets/`: the frozen tessellation of `libs/tau-examples/src/kernels/replicad/planetary-gear-system/main.ts` (`planetary.{json,bin.gz}`), its `faceWidth` 18 per-vertex axial offsets (`planetary-face18.{json,bin.gz}`) and a recorded GeoSpec run (`geospec-run.json`). Regenerate them with `apps/www/scripts/export-story-assets.ts` and `export-variant-assets.ts`; the manifest records the source SHA-256 and a test fails when the source changes.
- `loadAssembly` / `createPartGeometries`: fetch, validate and build one Three.js geometry per part. Hosts serve the asset files themselves (`@taucad/planetary-gearbox/assets/*`).
- `partPose`: prescribed rigid kinematics (fixed ring, sun θ, carrier θ/4, planets −θ/2).
- `assemblyStep` / `explodeLift` / `agentLane` / `printedPart`: the engineer's assembly order and the illustrative story metadata.
