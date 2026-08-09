# GeoSpec OpenCascade.js Native STEP And Metrics

This directory contains the custom C++ STEP, BRep, mesh, and distance wrappers
used by GeoSpec-aware OpenCascade.js builds. It is intentionally separate from
the root `geospec` runtime so importing `geospec` never initializes WASM.

The build is declared in `libcascade.config.ts` and driven by
[`@libcascade/toolchain`](https://www.npmjs.com/package/@libcascade/toolchain)
(a geospec devDependency, installed from `tarballs/libcascade-toolchain/`).
Artifacts and the generated `./init` factory land in `dist/`, which is
committed.

```bash
pnpm nx run geospec:build-wasm            # libcascade build + libcascade assemble
LIBCASCADE_IMAGE=ocjs-local:single-threaded pnpm nx run geospec:build-wasm
```

`libcascade build` fails loudly when the container's own
`build-manifest.json` reports `validation_passed: false` — a missing binding
otherwise links fine and fails at runtime with a `BindingError`.

The generated module exposes:

- `GeoSpecXdeReader.readText(text, optionsJson)` / `readFile(path, optionsJson)`
  — the single AP242/XDE read per subject (lazy-evidence blueprint R3)
- `GeoSpecXdeReadResult` — retained structure + proof calls (`extrema`,
  `classifyPoints`, `commonVolume`, `faceFacts`) plus the lazy evidence facets
  (`analysisSummaryJson`, `analysisMassPropertiesJson`, `analysisValidityJson`,
  `analysisFaceFeaturesJson`, `analysisWallThicknessJson(optionsJson)` with the
  R13 work-unit budget, `meshTriangles(optionsJson)` + heap pointer accessors,
  and `occurrenceMeshTriangles(occurrence, optionsJson)` — per-occurrence
  subject-frame tessellation reporting the achieved deflection, feeding the
  hybrid void-occupancy engine)
- `GeoSpecMeshMetrics.chamferDistanceFromTrianglePointers(...)`
- `_malloc`, `_free`
- `HEAP32`, `HEAPF64`, `FS`

GeoSpec owns STEP import through `GeoSpecXdeReader`. Replicad may author
and export deterministic STEP fixtures through Tau runtime, but GeoSpec does not
use Replicad's importer or any modeling-package fallback to create test evidence.

In JavaScript, STEP evidence is normally loaded through `geospec/step`:

```ts
import { loadStep } from 'geospec/step';

const subject = await loadStep({ source: stepBytes });
```

For native sampled mesh-distance checks, pass the initialized module to:

```ts
import { createOpenCascadeMeshBackend } from 'geospec/mesh';
import initOpenCascade from 'geospec/native/opencascade/single';

const oc = await initOpenCascade();
const backend = createOpenCascadeMeshBackend(oc);
```

GeoSpec uses that backend for sampled mesh-distance checks. Without a native
backend, distance matchers report a structured native-unavailable diagnostic;
production code does not run a JavaScript triangle-distance fallback.

Component-overlap checks are stricter: there is no JavaScript verdict fallback.
`toHaveNoComponentInterference({ tolerance, pairs })` and `analyzeMeshOverlap(...)`
use GeoSpec mesh records, optional pair selectors, cheap AABB candidate
pruning, and Manifold WASM exact intersection volume. Tangent contact and
correctly meshed gears pass because zero-volume contact is not overlap. If
components are non-manifold or cannot be certified as mesh solids, GeoSpec
reports structured diagnostics instead of falling back to OpenCascade mesh
booleans or JavaScript triangle overlap.
