# GeoSpec OpenCascade.js Native STEP And Metrics

This directory contains the custom C++ STEP, BRep, mesh, and distance wrappers
used by GeoSpec-aware OpenCascade.js builds. It is intentionally separate from
the root `geospec` runtime so importing `geospec` never initializes WASM.

Build with the Tau OpenCascade.js Docker image:

```bash
cd packages/geospec/native/opencascade
docker run --rm -v "$(pwd):/src" -u "$(id -u):$(id -g)" ghcr.io/taucad/opencascade.js:single-threaded link geospec.single.yml
```

The generated module exposes:

- `GeoSpecStepStreamReader.readText(...)`
- `GeoSpecStepStreamReader.readFile(...)`
- `GeoSpecMeshMetrics.chamferDistanceFromTrianglePointers(...)`
- `_malloc`, `_free`
- `HEAPF64`, `FS`

GeoSpec owns STEP import through `GeoSpecStepStreamReader`. Replicad may author
and export deterministic STEP fixtures through Tau runtime, but GeoSpec does not
use Replicad's importer or any modeling-package fallback to create test evidence.

In JavaScript, STEP evidence is normally loaded through `geospec/step`:

```ts
import { loadStep } from 'geospec/step';

const subject = await loadStep({ source: stepBytes });
```

For native sampled mesh-distance checks, pass the initialized module to:

```ts
import { createOpenCascadeMeshAnalyzer } from 'geospec/mesh';
import initOpenCascade from 'geospec/native/opencascade/single';

const oc = await initOpenCascade();
const nativeAnalyzer = createOpenCascadeMeshAnalyzer(oc);
```

GeoSpec uses that analyzer for large sampled mesh-distance checks. Without it,
the JavaScript fallback is deliberately bounded and reports a diagnostic when
the requested comparison would require too many triangle-pair visits.
