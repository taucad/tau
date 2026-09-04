---
title: 'NAPI Architecture Policy'
description: 'Rules for configuring, building, packaging, testing, and publishing first-party Node-API addons with NAPI-RS.'
status: active
created: '2026-08-22'
updated: '2026-09-04'
related:
  - docs/policy/npm-policy.md
  - docs/policy/release-policy.md
  - docs/policy/testing-policy.md
  - docs/policy/compatibility-policy.md
  - docs/research/libassimp-native-node-addon-overhaul-blueprint.md
  - docs/research/nanoraster-native-architecture-publishing-blueprint.md
---

# NAPI Architecture Policy

Internal reference for first-party repositories that distribute Node-API addons through NAPI-RS. The native producer may be Rust or another language, such as C++, when the repository uses NAPI-RS's packaging APIs. This policy covers target authority, generated loaders and packages, cross-platform evidence, and multi-package publication. The general package and CI rules in `docs/policy/npm-policy.md` and `docs/policy/release-policy.md` still apply.

## Rationale

A native Node package is a coordinated release of one JavaScript root package and many immutable platform packages. NAPI-RS already generates the target manifests, optional dependencies, native loader, and platform publication order. Reimplementing those features creates parallel authorities that drift; delegating them to the pinned toolchain leaves first-party code responsible only for application-specific behavior and evidence.

## Scope

This policy applies when a Tau-managed repository publishes one or more Node-API `.node` addons and uses `@napi-rs/cli` to generate their loader and platform-package release set. Rust `cdylib` and externally compiled addons share the packaging, evidence, and publication rules below. Language-specific compiler, linker, sanitizer, and lint rules apply only to producers that use that language.

It does not turn other artifact classes into N-API targets. Browser Wasm, WASI components, iOS frameworks, Electron universal applications, and standalone CLI binaries have different loaders or deployment contracts and require separate release paths.

## Rules

### 1. Make `package.json.napi` the target authority

Declare the binary name, platform-package naming scheme, and complete native target list once under the root package's `napi` configuration. Pin `@napi-rs/cli` to an exact reviewed version.

Derive generated package directories, platform manifests, root `optionalDependencies`, inventory expectations, and documentation fixtures from that target set. Do not keep a second handwritten architecture list when generation can provide it.

CORRECT:

```json
{
  "devDependencies": {
    "@napi-rs/cli": "3.8.6"
  },
  "napi": {
    "binaryName": "example",
    "packageName": "example",
    "targets": ["aarch64-apple-darwin", "x86_64-unknown-linux-gnu", "x86_64-pc-windows-msvc"]
  }
}
```

INCORRECT:

```json
{
  "devDependencies": {
    "@napi-rs/cli": "^3.8.6"
  },
  "optionalDependencies": {
    "example-darwin-arm64": "0.4.0"
  }
}
```

The incorrect example combines a floating release tool with a source-maintained fragment of generated dependency state.

### 2. Use the NAPI-RS-generated native loader

Generate the ESM loader and declarations at a stable build path. Rust producers may configure `napi build` directly:

```sh
pnpm napi build --esm --platform \
  --js index.js \
  --dts index.d.ts \
  --output-dir ./src/native
```

`--js` and `--dts` resolve relative to `--output-dir`. Generate into a source-adjacent ignored directory and copy the loader into the build output after any `clean` step; ship the loader, not the declarations (they are a build input). The loader is a generic template covering every NAPI-RS platform — it is not filtered by `napi.targets`, it bakes the root version in at build time, and its runtime version check is opt-in through `NAPI_RS_ENFORCE_VERSION_CHECK`. Treat it as build output. Do not hand-edit it or reproduce its OS, CPU, libc, colocated-addon, optional-package, or native-load-error logic in application source.

A non-Rust producer must call the pinned CLI package's public `writeJsBinding` API with the same binary name, package name, version, and identifiers. It must not invoke a dummy Rust build or copy the generated template into source.

The loader imports Node builtins and has no browser-safe mode. A package that also serves browsers must keep the loader out of browser resolution: give the Node path its own entry behind the `node` export condition and keep the default entry free of Node builtins and of any reference to the loader. Advise server-side bundler users to externalize the package.

When every candidate fails, the loader throws one `Error` whose `cause` is the chain of every load error. Preserve that chain when wrapping (`new PublicError(message, { cause })`); never flatten it into a string.

The application wrapper may still own behavior NAPI-RS cannot know, such as:

- choosing between a browser Wasm implementation and the Node addon;
- translating loader failures into the package's public error type;
- enforcing a target precondition that npm selectors cannot encode, such as rejecting big-endian `ppc64` when only `powerpc64le` is built.

CORRECT:

```ts
if (process.arch === 'ppc64' && endianness() !== 'LE') {
  throw new UnsupportedPlatformError('The ppc64 package requires little-endian Linux');
}

try {
  binding = await import('./native/index.js');
} catch (error) {
  throw new UnsupportedPlatformError('native addon unavailable', { cause: error });
}
```

INCORRECT:

```ts
const packages = {
  'linux-x64-gnu': 'example-linux-x64-gnu',
  'linux-x64-musl': 'example-linux-x64-musl',
};
```

### 3. Generate platform packages; do not maintain them

Run NAPI-RS package generation and artifact collection during release assembly:

```sh
pnpm napi create-npm-dirs --package-json-path package.json --npm-dir npm
pnpm napi artifacts --output-dir artifacts --npm-dir npm
```

Ignore generated platform directories in git. Do not make them independent workspace projects, version them separately, or hand-edit their manifests. The root package is the versioned source project; `napi pre-publish` copies its version into generated platform packages and materializes exact root `optionalDependencies`.

Copy any repository file NAPI-RS does not generate, such as the physical license, in the single assembly job and validate its presence immediately.

### 4. Give every target an explicit build recipe

Every target must have one reviewed matrix row that records its target triple, toolchain, runner, and evidence tier. Prefer maintained NAPI-RS recipes for Rust producers.

| Target family                 | Build approach                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Host-native macOS and Windows | Plain target-explicit `napi build`                                                                                                         |
| Linux glibc cross-target      | `--use-napi-cross` where supported                                                                                                         |
| Linux musl cross-target       | `-x` with pinned Zig/cargo-zigbuild                                                                                                        |
| Android                       | Pinned Android NDK from the hosted runner                                                                                                  |
| FreeBSD                       | Pinned maintained VM action and FreeBSD version                                                                                            |
| Windows ia32 MSVC             | Host cross-link plus NAPI-RS's documented `CARGO_PROFILE_RELEASE_LTO=false` and `CARGO_PROFILE_RELEASE_CODEGEN_UNITS=32` for that row only |
| Exceptional target            | Documented one-off recipe with a blocking check                                                                                            |

For a non-Rust producer, replace `napi build` and `cargo tree` evidence with its target-explicit native build and linker/dependency evidence; do not add a Rust build solely to satisfy this table. Pin third-party actions and auxiliary toolchains according to repository workflow policy. Do not restore deprecated NAPI-RS build images or pay for larger runners when standard public-repository runners and maintained cross-build paths suffice. Copy another project's row-specific environment (for example a `CFLAGS` linker override) only when the dependency graph actually compiles C for that target; record the dependency evidence either way.

Successful compilation proves only that a target can build. It does not prove the addon loads, finds a graphics or system backend, or produces correct results.

### 5. Assemble once, validate, and freeze

Use this release dataflow:

1. Build each native target and upload only the suffixed `.node` artifact.
2. Generate every platform directory in one assembly job.
3. Collect artifacts, preserve the generated loader/declarations, and copy required repository files.
4. Run `napi pre-publish --skip-optional-publish -t npm --no-gh-release` to reconcile package metadata without registry writes.
5. Validate completeness and pack disposable test tarballs.
6. Freeze the prepared release tree.
7. Make runtime and publication jobs consume that exact tree without rebuilding.

Every job that receives the frozen tree, its test tarballs, or any other artifact must prove the payload arrived before using it. Artifact downloads can report success and write nothing, and the failure then surfaces in whatever consumer opens a missing file next — a different step, with a message naming the wrong thing. Route downloads through one wrapper that asserts the named files landed, retries once, and re-verifies before failing; forbid the raw download action in the workflow with a policy test, and cover the wrapper with the same action-pinning assertion as the workflow itself.

Run every package-manager script the assembly job needs — checks, size gates, auxiliary builds — before step 4. `napi pre-publish` rewrites the checkout's `package.json`, and the package manager's pre-run dependency check then refuses every script against the now-stale lockfile. Enforce that ordering with a workflow test rather than convention.

The completeness gate must reject:

- a missing, duplicate, or unknown target package;
- a wrong package name, version, `os`, `cpu`, or `libc` selector (generation writes `libc` only for a literal `gnu` or `musl` ABI, so an `eabihf` row legitimately carries none);
- a missing or mis-suffixed native binary;
- a missing license, entry point, declared file, or engine range;
- root optional dependencies that differ from the generated target set;
- a missing generated loader;
- a binary whose format, architecture, word size, endianness, float ABI, dynamic dependencies, glibc floor, minimum OS, or Android API level does not match its target, or whose content duplicates another target's.

`napi artifacts` matches binaries by filename suffix only and does not inspect them, so inspect every binary with `llvm-readobj`/`llvm-objdump` from the pinned toolchain in one shared script with per-target expectations. Derive each expectation from the same pin the build uses instead of a literal, and encode toolchain clamps rather than fighting them: an Apple Silicon Mach-O slice records `minos 11.0` whatever `MACOSX_DEPLOYMENT_TARGET` says, while the x64 slice records the pinned floor. `napi artifacts` and `napi pre-publish` fail on missing, unconfigured, or duplicate artifact identities; the gate exists for inspection and manifest correctness, and it must run before any job receives `id-token: write`. Freeze the prepared tree as a tar archive with a digest: archives preserve paths and modes that bare workflow artifacts do not.

### 6. Publish platforms explicitly before root

Give only the publication job `id-token: write`. Use npm Trusted Publishing and provenance; do not provide `NPM_TOKEN` or another registry secret.

From the frozen prepared tree, run two explicit ordered operations:

```sh
pnpm napi pre-publish \
  --no-gh-release \
  -t npm \
  --package-json-path package.json \
  --npm-dir npm

npm publish ./ --access public --provenance
```

The first command publishes platform packages serially and updates the prepared root manifest. NAPI-RS does not publish the root. The second command publishes root only after every platform attempt completes. `pre-publish` spawns a bare `npm publish` per platform (no `--provenance`, `--access`, or `--tag`), so set `NPM_CONFIG_PROVENANCE=true` in the job, rely on trusted publishing's automatic attestations, and keep prerelease versions out of the routine path (or set `NPM_CONFIG_TAG`) so `latest` is never assigned by accident. Its default tag style is `lerna`; pass `-t npm`.

Keep `prepublishOnly` side-effect-free, limited to validation, and free of build-target dependencies: it must invoke the validation script directly, not a task runner target that depends on `build`, or the publish job will rebuild the frozen tree. Do not hide platform publication in a developer-invokable npm lifecycle. Use `--no-gh-release`; create GitHub release assets only after registry verification.

Set up the publish job in this order: checkout the release commit and install the source lockfile, then extract the prepared tree into a separate directory and run the two commands against it. Never overlay the prepared manifest onto the source checkout before installing: its optional dependencies do not yet exist on the registry.

Manual workflow runs are evidence-only. A `workflow_dispatch` event may run any build, inspection, or slow runtime lane from any ref so a matrix can be proven before merge; it must never publish. Derive publication from a push to the protected default branch plus the release commit's own subject — never from the event alone, and never gate a dispatch on the default branch, which only removes the pre-merge evidence run.

A small root exact-version guard is permitted for retry safety. It must only decide whether root already exists, treat npm's "cannot publish over the previously published versions" as success, and must not enumerate platforms, build tarballs, or become a second publisher.

### 7. Treat multi-package publication as non-transactional

npm versions are immutable, and a platform-first release can stop after publishing only part of the set. Retain the frozen release archive long enough to retry the same version (intermediate build artifacts may expire in a day; the compact archive should outlive the operator's recovery window, e.g., 30 days on release runs). Recovery is re-running the publish job from the same run; NAPI-RS skips already-published platforms.

npm scans packages at publish time, so a version may be invisible to `npm view` and uninstallable for minutes after a successful publish, and `npm deprecate`/`unpublish` do not work until it is visible. Bound registry polling with backoff rather than assuming immediate availability.

Never rebuild or mutate a partially published version. If root is published while a required platform is missing or invalid, wait for availability, deprecate the incomplete root version, and issue a new patch containing a complete matching package set.

Do not add a second custom platform-publishing loop to simulate a transaction npm does not provide.

### 8. Bootstrap new package names minimally

npm cannot configure a trusted publisher for a package name that does not exist. Reserve each new platform name once with a reviewed, manifest-only `0.0.0` tarball under a non-default `bootstrap` tag.

The bootstrap manifest should contain only identity and ownership metadata:

```json
{
  "name": "example-linux-x64-gnu",
  "version": "0.0.0",
  "description": "Package-name reservation for an example native target",
  "license": "MIT",
  "repository": "owner/repository",
  "author": "Project Authors"
}
```

Do not include a binary, entry point, selectors, engine range, files list, or optional dependencies. The placeholder is deliberately not an installable release. Do not point `latest` at it.

After the authenticated operator publishes the reviewed placeholders, configure and audit the exact trusted workflow:

```sh
npm trust github example-linux-x64-gnu \
  --repository owner/repository \
  --file ci.yml \
  --allow-publish \
  --yes
```

`npm trust` requires npm ≥ 11.15.0, account-level 2FA, an existing package, and `--allow-publish`; granular tokens with 2FA bypass are rejected; the registry holds one trusted-publisher configuration per package (replace with `npm trust list` → `npm trust revoke --id`). Decide explicitly whether a GitHub environment is part of the claim; if it is, the workflow job must declare that environment. The "Require two-factor authentication and disallow tokens" publishing-access setting is configured on npmjs.com, not by `npm trust`; set it after bootstrap, since OIDC publishers keep working under it.

Perform bootstrap publication and trust mutations serially with npm's recommended 2-second spacing inside the 5-minute 2FA-skip window, over literal reviewed package lists, and stop-and-resume on name contention, session expiry, throttling, or spam rejection. Do not commit placeholders or create permanent bootstrap automation for a one-time operation.

### 9. Separate publication from support claims

Assign each target one evidence tier:

| Tier       | Required evidence                                                | Allowed claim               |
| ---------- | ---------------------------------------------------------------- | --------------------------- |
| Build-only | Successful link plus package/architecture inspection             | Experimental/build-verified |
| Load       | Clean install and addon load on the target runtime               | Loads on target             |
| Partial    | Every runtime stage up to the one a named upstream defect blocks | Partial, naming the defect  |
| Runtime    | Public-API operation exercising the relevant native backend      | Supported                   |

Run runtime evidence from tarballs packed from the frozen tree, not from workspace imports. For GPU-backed addons, a successful render on the target backend is the minimum supported-target evidence. Faithful emulation or a VM is acceptable when it executes the target binary and real public API; static inspection is not runtime evidence.

Declare a partial row explicitly; never let a target reach it by omission. A runtime row may excuse one stage only when a named upstream defect blocks it: record the reason on the matrix row, pass it to the smoke as an environment variable, and keep every other stage mandatory — an excused render still has to install, load, and enumerate its backend. The excused stage is an expected failure, so an unexpected success must fail the row with an instruction to lift the declaration and promote the target; a defect that stops reproducing must never pass silently as an excused one. Mirror the mark in the compatibility document and bind the two with a test in both directions. Partial is not build-only: do not downgrade a target that installs, loads, and finds its backend.

Emulated lanes may need environment a real host does not, and the recipe comment must say which lines are emulation artefacts rather than consumer requirements — a `qemu-user` guest whose 32-bit loader cannot read the host kernel's directory entries needs an explicit driver-manifest path that no real host asks of a consumer. A container recipe that unpacks an official Node tarball into a bare base image also installs `libatomic1`: current Node lines link `libatomic.so.1`, the published `node` images carry it, and a bare distribution image does not.

Do not mark hardware-only targets supported until required device jobs exist. Keep expensive parity suites on representative backends and use one focused public-API smoke on each additional target.

### 10. Verify registry state before downstream release effects

After publication:

1. Read the published root manifest and derive the expected platform names and version.
2. Poll with bounded backoff until the registry serves every package's `dist.integrity` and attestation; assert the set equals the generated target set at the root version.
3. Compare each `dist.integrity` with the integrity `npm pack --json` recorded for the frozen test tarballs; agreement proves the registry serves the tested bytes at no extra cost.
4. Force-install root and every platform package from npm in clean directories.
5. Run `npm audit signatures --include-attestations`; it verifies digests and Sigstore bundles only, so additionally verify provenance repository, workflow, ref, commit, run, and builder identity from the predicate.
6. Run at least one normal install (`npm install <root>@<version>` without naming a platform package) per representative host and assert exactly one matching platform package was selected; enable the loader's version check for that smoke.
7. Only then create the GitHub Release, promote distribution tags, or publish consumer-facing support claims.

A job that verifies the registry installs nothing on purpose: it must prove what the registry serves, not what this tree builds. Every script such a job runs must therefore have an import graph that reaches no package — a single transitive development-dependency import makes the verifier unloadable exactly when it is needed, after publication, when the packages are already immutable. Do not fix that by installing dependencies in the job (that puts the verifier's own supply chain inside the verification) or by deriving the expected package set from the frozen manifest being checked (self-comparison: a target absent from both manifest and registry would pass). Re-derive the contract from the target authority with builtin-only code, pin the derivation against the toolchain's own parser in a job that does have dependencies, and assert the invariant structurally: read out of the workflow which jobs install nothing, collect the scripts they run, and walk each import graph in a test.

Registry integrity, provenance, and runtime checks verify final state. Do not repeat the full runtime matrix from the registry; frozen-tree evidence plus integrity agreement and attestations already cover the remaining targets.

### 11. Keep non-N-API artifacts separate

Do not add a NAPI target merely because a deployment label appears related:

- Electron universal applications combine independently working macOS x64 and arm64 application slices; they do not require a universal platform npm package.
- Native iOS applications require an XCFramework or Swift package rather than a Node-API addon.
- WASI uses a different ABI and host capability model; browser Wasm/WebGPU does not become WASI by repackaging.
- Standalone Rust CLI binaries belong in their own archive or installer release path when needed.

Add one of these artifact classes only when a real consumer and runtime test justify its separate release contract.

### 12. Raise the musl default thread stack before a bundled driver starts threads

When an addon targets `*-linux-musl*` and loads a system or bundled driver that creates its own threads (graphics, JIT, codec), raise the process default thread stack once — before the first driver initialization — to a glibc-comparable size, and never shrink an already-larger default.

**Why**: musl's default thread stack is 128 KiB where glibc inherits `RLIMIT_STACK` (8 MiB), so a driver thread created with default attributes can overflow and `SIGSEGV` on musl only, after the device has been found and with no error the addon can catch. musl's default is grow-only and clamps at 8 MiB (`DEFAULT_STACK_MAX`), so 8 MiB is the glibc-matching target and the ceiling; the call must land in the libc the driver's threads use, which a `crt-static` addon would not.

CORRECT:

```rust
#[cfg(all(target_os = "linux", target_env = "musl"))]
fn raise_default_thread_stack() {
    // once, before the first driver initialization; grow only
}
```

INCORRECT:

```rust
// Downgrade the musl row to build-only, or pin an older base image,
// because the render segfaults on musl.
```

Prefer fixing the driver's own thread sizing upstream, and record the crash evidence (image, driver version, backtrace) with the workaround.

## Anti-Patterns

| Avoid                                           | Use instead                                |
| ----------------------------------------------- | ------------------------------------------ |
| Committed `npm/<target>` packages               | `napi create-npm-dirs` in assembly         |
| Handwritten OS/CPU/libc package map             | NAPI-RS-generated loader                   |
| Handwritten Linux libc probe                    | Generated loader behavior                  |
| Source-maintained native `optionalDependencies` | `napi pre-publish` materialization         |
| Platform publication in `prepublishOnly`        | Explicit trusted CI command                |
| Custom platform tarball publish loop            | NAPI-RS `pre-publish`                      |
| Rebuild during publish or retry                 | Frozen prepared release tree               |
| Real binaries in `0.0.0` reservations           | Minimal manifest-only bootstrap            |
| Build success presented as support              | Target runtime evidence                    |
| Early GitHub Release creation                   | Registry and provenance verification first |

## Known Limitations

- npm provides no atomic transaction across platform and root packages, and publish-time scanning delays availability by minutes.
- npm `cpu: ppc64` does not distinguish little- from big-endian hosts; Yarn classic ignores `libc` and installs both Linux libc packages.
- `napi artifacts` also copies every binary into the package root; the root `files` contract must exclude `.node` files.
- NAPI-RS-generated platform packages may need repository-specific files such as a physical license copied during assembly.
- Some targets can be built on free hosted infrastructure but require separately provided hardware before they can be called supported.
- NAPI-RS tool behavior can change and its documentation can lag its code (artifact skipping and optional-dependency merging were both stale at 3.8.6); pin exactly, read the pinned source, and review upgrades deliberately.

## Summary Checklist

- [ ] Exact NAPI-RS CLI version pinned
- [ ] `package.json.napi.targets` is the only target authority
- [ ] Generated ESM loader used without a parallel package map; browser entry never resolves it; `cause` chain preserved
- [ ] Generated platform directories and root optional dependencies absent from source control
- [ ] Every target has an explicit build recipe and evidence tier
- [ ] Any excused runtime stage names its upstream defect, fails on an unexpected success, and is mirrored as a partial support mark
- [ ] Prepared tree passes completeness and binary-inspection checks and is frozen as a digested archive before publication
- [ ] Every artifact handoff between jobs is verified at the download, not at the first consumer that misses a file
- [ ] Scripts run by jobs that install no dependencies import no package, asserted by walking their import graphs
- [ ] Package-manager scripts all run before `napi pre-publish` rewrites the manifest
- [ ] musl targets size the default thread stack before a bundled driver starts threads
- [ ] Platform publication is explicit, OIDC-only, root-last, with provenance forced and prereleases excluded; manual runs never publish
- [ ] `prepublishOnly` is a direct, build-free validation
- [ ] Bootstrap placeholders are manifest-only, stay off `latest`, and trust bindings plus publishing-access settings are audited
- [ ] Registry packages, attestations, integrity agreement, forced and normal installs verify with backoff before downstream release effects

## References

- [NAPI-RS build](https://napi.rs/docs/cli/build)
- [NAPI-RS create npm directories](https://napi.rs/docs/cli/create-npm-dirs)
- [NAPI-RS artifact collection](https://napi.rs/docs/cli/artifacts)
- [NAPI-RS pre-publish and recovery](https://napi.rs/docs/cli/pre-publish)
- [NAPI-RS cross-build recipes](https://napi.rs/docs/cross-build)
- [NAPI-RS support and target compatibility](https://napi.rs/docs/more/support-compatibility)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm trust CLI](https://docs.npmjs.com/cli/v11/commands/npm-trust/)
- [npm provenance statements](https://docs.npmjs.com/generating-provenance-statements/)
- [Oxlint's NAPI-RS migration](https://github.com/oxc-project/oxc/commit/9788a966395ceff8e16d95537bf52a61644bac35)
- [Oxlint release workflow](https://github.com/oxc-project/oxc/blob/b016fd41101de5038a77484c11c0a19c1aa965a9/.github/workflows/release_apps.yml)
