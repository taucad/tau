# KCL fixtures for the offline engine

The offline engine's regression suite. Each directory holds a `main.kcl` and whatever it imports:

| Directory     | Source (KittyCAD/modeling-app)                                     | Oracle                                |
| ------------- | ------------------------------------------------------------------ | ------------------------------------- |
| `samples/`    | `public/kcl-samples`                                               | Zoo's physical properties             |
| `simulation/` | `rust/kcl-lib/tests`, every test that executes on Zoo's engine     | Zoo's physical properties, where kept |
| `examples/`   | `rust/kcl-lib/std/*.kcl`, every KCL doc example (`norun` included) | none                                  |
| `tau/`        | Tau's own: std coverage and parts an agent would be asked to model | hand calculation in `use-case.md`     |

Together they call every function in the KCL standard library; the examples suite fails if one goes uncalled.
`manifest.json` records, per fixture, the functions it calls, Zoo's volume and surface area, and the offline
baseline: the solids, volume and area the offline engine built, or the gap it hit. `excluded` lists the Zoo
fixtures the suite cannot run, and why.

The suite (`src/offline/offline-kcl-*.integration.test.ts`) holds every fixture to its baseline, so a change that
alters any model fails. A fixture that agreed with Zoo within 1% must keep agreeing. A fixture with a gap must keep
hitting that gap, so a fix fails the suite until its baseline is re-recorded.

Each agent-authored `tau/` fixture has a `use-case.md`, written before its `main.kcl`: who asks, the prompt they
would type, the dimensions, what a right model looks like, the expected volume (hand-calculated for the simple
parts) and the offline result. To add one, write both files, measure it, and add its manifest entry (`path`,
`functions` as the stage step computes them) before recording its baseline: `baseline` only updates entries that
already exist.

The Zoo fixtures are MIT-licensed by the Zoo Authors (`LICENSE.modeling-app`). Simulation tests are renamed from
`input.kcl` to `main.kcl`, pinned to the KCL version Zoo ran them with, and have small imported inputs copied
into `inputs/`, with the files they name (a glTF's buffers, an OBJ's materials).

`2-5-long-m8-chc-screw.stl` in `import_async`, `import_stl` and `import_transform` is not Zoo's 5.5 MB screw: staging
replaces any STL over 100 kB with a 12-triangle box over the original's bounding box, in the same encoding and under
the same name, so the fixture keeps its import path (format, units, placement) without the size. Their KCL is
verbatim apart from the localized import path. Imported meshes count neither volume nor area, as in Zoo's mass
properties, so the stand-in changes only the mesh's shape, not what the fixture measures.

## Re-recording the baselines

From `packages/plugins/zoo`, after an intended change to what the engine builds:

```sh
paths=$(python3 -c "import json; print(' '.join(f['path'] for f in json.load(open('src/offline/fixtures/kcl/manifest.json'))['fixtures']))")
rm -f /tmp/kcl-fixtures.jsonl
echo $paths | xargs -n 30 -P 4 npx tsx --require ../../../tools/cjs-wasm-compat.cjs \
  scripts/offline/measure-kcl-fixtures.mts /tmp/kcl-fixtures.jsonl src/offline/fixtures/kcl
python3 scripts/offline/vendor-kcl-fixtures.py baseline src/offline/fixtures/kcl /tmp/kcl-fixtures.jsonl
```

Review the manifest diff: every changed baseline should be a model the change meant to change.

## Updating the Zoo fixtures

```sh
scripts/offline/fetch-samples.sh /tmp/zoo <commit>
python3 scripts/offline/vendor-kcl-fixtures.py stage /tmp/zoo/modeling-app src/offline/fixtures/kcl
```

Staging keeps the baselines of fixtures it already had; record baselines for the rest as above.
