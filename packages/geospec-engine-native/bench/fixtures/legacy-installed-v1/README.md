# Immutable installed legacy comparator

These 19 retained package archives (14,001,732 bytes) are regression-test inputs.
They preserve the accepted original engine, SDK and first-party dependency bytes.
They are not rebuilt from the current checkout and are not for publication.
`manifest.json` records their sources, hashes, historical license declarations,
102 registry dependency edges, three npm aliases and 182 installed file identities.
The registry source capture and accepted installation have different package.json
hashes for libassimp and nanoraster; `installedRegistryMetadataDifferences` records
both identities. All 102 edges in the portable installation match the accepted
installed comparator. The retained source metadata is not an installed-byte gate.

Use Node **26.7.0** and pnpm **11.7.0**. From the workspace root:

```sh
node packages/geospec-engine-native/scripts/prepare-legacy-reference.mts verify-fixture
node packages/geospec-engine-native/scripts/prepare-legacy-reference.mts stage
```

The second command prints a fresh `stagedRoot` and `consumerRoot` under
`out/artifacts/geospec-native-engine/legacy-reference/attempt-*`. Set
`LEGACY_STAGE` to that printed `stagedRoot`, then run:

```sh
pnpm --version # must be 11.7.0, with Node 26.7.0 on PATH
pnpm --dir "$LEGACY_STAGE/consumer" install --frozen-lockfile --ignore-scripts
node packages/geospec-engine-native/scripts/prepare-legacy-reference.mts verify-installed "$LEGACY_STAGE"
```

Preparation never invokes the package manager or imports product code. Installation
uses the frozen registry integrity pins and disables lifecycle scripts. It requires
registry access or a populated pnpm store (`--offline` may be added in that case).
Verification compares the complete 179-file engine/SDK distribution and three
critical registry WASM files, including exact file sets for both distributions.
The three registry paths deliberately retain the accepted pnpm 11 installation
layout and frozen peer graph. A different layout is not silently accepted.

The staged consumer copies only metadata and links its sibling `tarballs` directory
to these immutable archives. Keep the checkout available for that link. Each stage
gets a new directory; failed attempts remain available for inspection. The helper
does not overwrite an existing consumer or run the original's positive smoke test.

The consumer metadata differs from the accepted installation only by replacing its
absolute `file:` archive prefix with `file:../tarballs/`; `consumer/LICENSE` carries
the unchanged historical Apache license. Nothing at runtime depends on Brain or a
particular user's home directory. The installed engine entry is
`consumer/node_modules/@taucad/geospec-engine/dist/index.mjs`; its expected SHA-256 is
`0536889be402f9ff74b915ff720eb46acc9ec6350f84f865bb734cab9136a69b`.

All archives preserve their original licenses and notices. `LICENSE` is the exact
historical Apache-2.0 text; `THIRD_PARTY_LICENSES.md` is the exact historical
`license-deps` notice, not a new legal clearance. Archive package license fields do
not replace the terms for embedded OCCT, occt-import-js, esbuild or Rhino binaries.
Registry-fetched Manifold and Replicad packages retain their own license files.
Historical source/build provenance does not establish byte-reproducible builds or
new source-availability URLs. The fixture is outside the native package's published
file selection; Nx/CI integration is owned by the workspace coordinator.
