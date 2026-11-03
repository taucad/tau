# PicoGK browser host preparation

This project compiles the existing worker sources for the qualified .NET 11
browser workload. It does not replace the desktop host or publish a package.
The initial preparation target stages the serial host; threaded qualification
and automatic package provisioning remain separate program tasks.

Run from the Tau workspace root:

```sh
pnpm nx run picogk:prepare-browser-host /absolute/path/to/config.json
```

The configuration names explicitly prepared inputs:

```json
{
  "dotnet": "/absolute/dotnet-11/dotnet",
  "nuget": "/absolute/nuget/packages",
  "hostRid": "osx-arm64",
  "validatorRoot": "/absolute/qualified-dotnet-tools",
  "archiveRoot": "/absolute/qualified-serial-archive",
  "picoGkProject": "/absolute/patched-picogk/PicoGK.csproj",
  "roslynRoot": "/absolute/patched-roslyn",
  "retentionProps": "/absolute/AuthoringRetention.props",
  "referencesRoot": "/absolute/authoring-references",
  "outputRoot": "/absolute/tau/out/picogk-browser-host"
}
```

`validatorRoot` supplies the qualified PicoVoxel `validate-inputs.mjs`,
`inputs.json`, `global.json` and `toolchain.csproj`. Their bytes must match the
archive's input receipt. No optional repository checkout is implicitly read.
The script invokes that validator to compare the actual SDK, runtime packs,
compiler executable and inventories with the archive's recorded toolchain.
It also verifies the six native files and their sidecars before publishing.

`referencesRoot` contains the admitted authoring reference DLLs. The script
always replaces its PicoGK reference with the DLL produced by this build.
`roslynRoot` supplies the qualified browser checksum adaptation; the host's
retention props preserve APIs used by runtime-authored C#.

The output root must be beneath this workspace's `out/`. Standard .NET build
outputs remain there. `bundle/` contains only the runtime's declared resources,
authoring references, `assets-manifest.json` and its SHA-256 receipt. The
manifest binds the protocol, qualified toolchain, archive input receipt,
compiler identity and every resource's bytes. It can be consumed by the
browser asset loader; the worker verifies executable bytes before import.

The browser build keeps trim diagnostics visible for runtime-authored IL.
Explicit retention plus the browser conformance suite establish that behavior;
static reflection analysis alone cannot establish it. Successful preparation
is an asset/build check, not geometry parity or full browser qualification.
