# Frozen host-test inputs

`manifest.json` maps original repository-relative authority/input paths to exact
retained bytes. Original paths inside the documents remain unchanged: they identify
the historical source, not a requirement for a local Brain or build cache.

The closure contains 94 original paths. Forty-five reuse byte-identical tracked
package fixtures; 49 new loose files under `data/` total 16,072,908 bytes. Filenames
are SHA-256 digests, with no extension so formatters cannot rewrite frozen JSON or
STEP bytes. The manifest records lengths and hashes for both retained and reused
files. These are test inputs, not regenerated expected results or binary archives.

`read-fixture.mjs` resolves only explicit manifest members and verifies their bytes.
Pass the repository root when using a copied harness outside the checkout. The
default root is relative to this source module, independent of the process cwd.
No lookup falls back to a research directory or dependency cache.

Membership comes from data-only reads of the M3 corpus/profile and F1 authority
loaders, plus source-traced independent F2, model STEP/GLB, current/early mesh, and
continuous campaign input reads. The existing 334-row corpus and 18 continuous
rows (352 combined), 12 separate continuous budget runs, all original expected
statuses and metadata promotions remain unchanged. The manifest does not add
runtime test execution or claim native acceptance.

Promotion evidence: M5-CI-FIXTURE-CLOSURE-A13 at source HEAD
`21b3352c1be11d62a7b70ae703c1a1f0cba015a7`. The optional research evidence is not a
test prerequisite. Do not reformat, regenerate or refresh these authorities when
an engine result differs. Changes require review of the original expectation.
