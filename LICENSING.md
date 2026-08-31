# Licensing

All Tau-authored source in the current repository is licensed under Apache-2.0. This includes the applications,
internal libraries, tools, examples, published packages, the `geospec` authoring substrate, and
`@taucad/geospec-engine`.

Each workspace package carries its own `license` field in `package.json` and same-directory `LICENSE` file.
Third-party code and dependencies retain their own licences and notices.

## Repository-wide grant

| Scope                   | License      | Status                     |
| ----------------------- | ------------ | -------------------------- |
| All Tau-authored source | `Apache-2.0` | Open source (OSI approved) |

The root [`license`](license) file is the canonical Apache-2.0 text. Every workspace package carries a byte-identical
copy named `LICENSE`; the repository root retains its historical lowercase filename.
`scripts/src/validate-license-partitions.ts` enforces the SPDX field, file presence, and canonical text across every
workspace package.

Directory placement, package privacy, Nx tags, and architectural role do not change the licence. Tau-authored code can
move between the editor, API, `apps/libs`, `libs`, ordinary packages, the GeoSpec substrate, and the GeoSpec engine
without a relicensing decision.

Apache-2.0 permits commercial use, modification, distribution, sublicensing, proprietary embedding, hosted operation,
and competing offerings, subject to its licence and notice requirements. The canonical text, not this summary,
controls.

## GeoSpec and user work

Both `geospec` and `@taucad/geospec-engine` are Apache-2.0. An adopter may author, execute, embed, modify, host,
fork, and redistribute the complete first-party GeoSpec workflow without a separate Tau software licence.

Engine releases publish a provenance record described by
[`packages/geospec-engine/provenance.schema.json`](packages/geospec-engine/provenance.schema.json). It records the
release date and artifact digests for reproducibility; there is no future-licence conversion clock.

Running Tau or GeoSpec puts no licence obligation on a user's specs, models, generated UI, or verdicts. Users choose
terms for their original work and preserve Apache requirements when redistributing Tau-authored code.

## Previous releases

Relicensing the current tree does not revoke grants already supplied with earlier releases. Recipients may continue to
use an earlier release under the licence shipped with that release. The repository's current tree and future releases
use Apache-2.0 for all Tau-authored source.

## Third-party code, contributions, and trademarks

Third-party dependencies are inventoried in [`license-deps`](license-deps). Bundled code, copied material, and assets
retain their original notices and obligations; the repository-wide Apache licence does not overwrite them.

The current-tree provenance audit found no surviving non-Tau human-authored application files that require consent for
this change. A contributor agreement remains recommended before accepting material external contributions that Tau
may need to relicense later.

Apache-2.0 section 6 grants no rights in Tau's names, logos, or marks. Official services, signed evidence, and
certification may be distinguished through those separate channels without narrowing the software licence.
