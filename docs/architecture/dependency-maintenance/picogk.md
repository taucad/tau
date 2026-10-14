# PicoGK NuGet dependency maintenance

`packages/plugins/picogk/dotnet/` owns the managed worker, `PicoGK.hosted.patch` and the imported PicoGK dependency locks. `apps/desktop/scripts/prepare-picogk-dotnet.mts` owns the upstream commit/archive digest, .NET SDK/runtime pins, target mappings, patch application and locked restore. Follow that script's current pins rather than an independently installed SDK.

## Lock ownership and platform scope

Review all tracked NuGet locks with `git ls-files`; ignore-based file searches can miss platform locks. The two production restore targets map as follows:

| Target       | Runtime identifier | Imported PicoGK lock                  | Worker lock                                      |
| ------------ | ------------------ | ------------------------------------- | ------------------------------------------------ |
| Darwin ARM64 | `osx-arm64`        | `PicoGK.packages.lock.json`           | `Tau.PicoGK.Worker/packages.lock.json`           |
| Linux x64    | `linux-x64`        | `PicoGK.packages.linux-x64.lock.json` | `Tau.PicoGK.Worker/packages.linux-x64.lock.json` |

Paths in the table are relative to `packages/plugins/picogk/dotnet/`. The test project also owns its own tracked lock; inspect it when changing test dependencies. Keep distinct runtime resolutions rather than overwriting one platform with the other. Linux prepares a managed worker and Roslyn API extraction; the pinned upstream archive supplies no Linux native voxel kernel. A successful Linux restore/build is not a native modeling test.

## Regenerate a changed graph

Work in disposable staging under `out/` or an operating-system temporary directory. Download the script's exact upstream archive, verify its pinned digest, extract it, and apply the existing hosted patch with `git apply --check` followed by `git apply`. Preserve upstream identity. Change a managed upstream package reference in the hosted patch; do not edit an ignored extracted cache as the only source of the change.

Copy the worker project tree and both owners' corresponding locks into staging. Set `DOTNET_ROOT`, `DOTNET_CLI_HOME` and `NUGET_PACKAGES` to isolated tool/cache directories. With `DOTNET` pointing to the pinned SDK executable, `WORKER_PROJECT` to the staged worker project and `PICOGK_PROJECT` to the patched upstream project, run the following once per runtime/lock pair from the table:

```sh
"$DOTNET" restore "$WORKER_PROJECT" --runtime "$RID" --force-evaluate \
  "-p:PicoGKProject=$PICOGK_PROJECT" \
  -p:RestorePackagesWithLockFile=true "-p:NuGetLockFilePath=$LOCK_NAME"
```

`LOCK_NAME` is `packages.lock.json` or `packages.linux-x64.lock.json`; the property resolves separately within each restored project. Copy back only reviewed changed locks, retaining the `PicoGK.` prefix for the imported project's repository lock. Compare the worker locks even when they remain unchanged. Do not run `--force-evaluate` in ordinary preparation or CI validation.

## Validate independently

Use a fresh extraction, reapply the committed patch, and seed it with the candidate locks. Restore each runtime with the same properties and `--locked-mode` instead of `--force-evaluate`. The October 2026 validation then used:

```sh
"$DOTNET" build "$WORKER_PROJECT" --configuration Release --runtime linux-x64 --no-restore \
  "-p:PicoGKProject=$PICOGK_PROJECT" \
  -p:RestorePackagesWithLockFile=true -p:NuGetLockFilePath=packages.linux-x64.lock.json
"$DOTNET" list "$PICOGK_PROJECT" package --vulnerable --include-transitive --no-restore --format json
```

Inspect scan errors and feed failures rather than treating empty output as clean. Independently compare exact registry pins across every tracked platform/test lock with the official NuGet advisory feeds. Preserve findings, timestamps and coverage gaps. Run the prepared worker's `--emit-api <output.json> <patched-source-directory>` smoke check and verify zero diagnostics; this exercises managed metadata extraction, not native geometry.

On a supported Darwin ARM64 host, run `pnpm nx run picogk:test-dotnet --parallel=1` and `pnpm nx test picogk --watch=false --parallel=1`, plus relevant package checks. Both targets depend on desktop resource preparation. Native behavior and platform packaging still require their actual target gates; never synthesize an inventory or native payload to bypass them.

## Recorded qualification and limits

The 2026-10-13 security update changed SourceLink to 10.0.400 in the hosted patch and both imported PicoGK locks. Upstream commit `0e6cf6b6f4993ec16dbcd72d8f27f26b999980f3` and SDK 10.0.400 were retained. Both runtime locked restores passed, worker lock graphs stayed unchanged, the Linux Release build passed with two source-archive metadata warnings, and API extraction returned 141 entries with zero diagnostic errors. The restored-project vulnerability scan completed without reported vulnerable packages. Darwin native tests remained unverified in the Linux environment.

Exact results are retained in the private security assessment's October 13 artifact run at `evidence/nuget/validation.json`. This is a dated observation, not release qualification for future graphs. Follow the existing [npm](../../policy/npm-policy.md) and [release](../../policy/release-policy.md) policies for version plans and publication; none of these restore/build commands authorizes deployment or a release.
