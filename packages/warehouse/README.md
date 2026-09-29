# @taucad/warehouse

Editable parametric mechanical parts for Tau. Each directory immediately beneath `parts/` is a complete Tau project: open that folder, or select `packages/warehouse/parts` as a workspace. The Parts page previews and remixes the same source assets.

## Use

```typescript
import { warehouseParts, findWarehousePart } from '@taucad/warehouse/builtin';

const matches = warehouseParts.filter(({ manifest }) => manifest.tags.includes('Fasteners'));
const part = findWarehousePart(matches[0]?.locator ?? '');
const files = part && (await Promise.all(part.assets.map(async ({ path, load }) => ({ path, bytes: await load() }))));
```

Catalog imports initialize no CAD kernel. Browser and Node bundlers can load source assets independently; browser thumbnail URLs are resolved as package assets. This initial API is experimental.

## Edit and qualify

Each acquired project is independent: modify its local `main.ts`, `model.ts`, helper files, or parameters in Tau. Dimensions are millimetres; declared domains and supported discrete values live in `parameters.ts`. Read the project's README for intentional fidelity limitations. Generic geometry is not supplier-certified stock, and symbolic thread callouts do not model helical threads.

Repository maintainers edit `definitions/<family>/model.ts` and `catalog.ts`, then run `pnpm nx generate warehouse`. Regeneration replaces the materialized projects; edits to a separately remixed project are unaffected. Shared authored family sources are copied inside every project so no import escapes its folder.

```bash
pnpm nx generate warehouse
pnpm nx check-generated warehouse
pnpm nx test warehouse --watch=false
pnpm nx typecheck warehouse
pnpm nx lint warehouse
pnpm nx build warehouse
pnpm nx geospec warehouse
pnpm nx generate-thumbnails warehouse
pnpm nx generate warehouse
pnpm nx check-thumbnails warehouse
```

GeoSpec supports `--file <slug>/main.geospec.ts` for a focused part. Each named case verifies exact STEP geometry and the rendered GLB; case domains enumerate discrete supported values and continuous extrema. Finite cases do not prove the full continuous interval. Invalid dimensions are rejected before native modeling. Future kernels must preserve the same parameter meanings, datum, units and neutral geometry expectations.

Runtime tools require Node 24+, repository dependencies and the existing GeoSpec native assets. No registry service or external stock database is required. Apache-2.0.
