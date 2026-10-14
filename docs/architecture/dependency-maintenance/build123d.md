# Build123d Python dependency maintenance

The Python dependency owner is `packages/plugins/build123d/python/`: direct pins live in `requirements.in`, and `requirements.lock` is the universal, hash-pinned resolution. `apps/desktop/resources/python/manifest.json` pins the interpreter archives. `apps/desktop/scripts/prepare-build123d-python.mts` verifies those archives and installs the lock with `uv pip install --require-hashes --no-deps`. Ordinary runtime execution must use the prepared resource, not discover or install system Python packages.

## Update a dependency

Coordinate with ongoing dependency PRs and serialize lock regeneration. Use the interpreter version in the resource manifest and preserve unrelated pins. For a direct dependency, edit its exact version in `requirements.in`; for a transitive security update, select that package explicitly. The October 2026 urllib3 update used this command from the Tau root:

```sh
uv pip compile packages/plugins/build123d/python/requirements.in --universal --generate-hashes --python-version 3.13 --upgrade-package urllib3==2.8.0 --output-file packages/plugins/build123d/python/requirements.lock
```

Review versions, environment markers and every changed artifact hash against the official PyPI release metadata. Do not hand-author hashes or treat a universal lock as proof that every target has usable wheels. An intentionally broader update needs its own compatibility review.

## Validate the lock and packaged runtime

First install into a disposable environment using the matching Python release. These commands take an existing matching interpreter in `PYTHON` and create only temporary environment state:

```sh
python_check_root=$(mktemp -d)
uv venv --python "$PYTHON" "$python_check_root/venv"
uv pip install --python "$python_check_root/venv/bin/python" --require-hashes --only-binary=:all: --no-deps -r packages/plugins/build123d/python/requirements.lock
uv pip check --python "$python_check_root/venv/bin/python"
```

Check imports and a geometry operation through the plugin's Python modules. Run the declared packaged-resource gates on each supported target, using the Nx project configuration as the command owner:

```sh
pnpm nx run desktop:prepare-build123d-python
pnpm nx run build123d:test-python --parallel=1
pnpm nx test build123d --watch=false --parallel=1
```

The Python target uses the bundled interpreter, branch coverage and a 100% threshold. The isolated installation check is supplemental; it does not replace this gate. Also run the relevant lint, typecheck, build and package checks for changes to the public plugin or its packaging. Keep any build lane serialized with other tasks writing shared dependency outputs.

When a test fails, retain the exact candidate result and run an otherwise identical baseline control before assigning cause. Do not rewrite frozen benchmark fixtures or expected geometry bytes merely to clear a dependency upgrade. Scan every universal registry pin, including packages inapplicable to the current host; report unavailable scanners separately from successful no-match results.

## Recorded qualification and limits

The 2026-10-13 urllib3 2.7.0 → 2.8.0 update changed only that package and its two published artifact hashes among 49 universal pins. A wheel-only, hash-enforced Python 3.13.15 installation resolved 47 applicable packages; dependency checks, imports and geometry/HTTP smoke checks passed. The existing Python suite passed 36 of 37 tests: the serialized-geometry SHA assertion failed identically with both urllib3 versions. The complete Nx packaged-resource gate was not established by that isolated run.

Exact results are retained under the private security assessment's October 13 artifact run, in `evidence/advisories/python-remediation-result.json`. That snapshot is historical evidence, not a permanent exception to the test gate. Release planning and publication remain governed by the existing [npm](../../policy/npm-policy.md) and [release](../../policy/release-policy.md) policies; these maintenance commands do not publish or deploy.
