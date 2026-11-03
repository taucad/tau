# Geometry parity apps

Test backend only. The product runs author code through `Tau.PicoGK.Worker` and
its capture host; this project exists so PicoVoxel's geometry parity fixture runs
in a browser the same way it runs on the matched native comparator, and hands the
bytes it wrote back to the gate for comparison.

One project serves both measured modes, selected by `TauParityMode`:

- `aot` compiles the fixture and every pinned author source into the app, with
  the signed-distance generator resolved as an ordinary analyzer. That is how a
  build-time consumer ships them.
- `dynamic` compiles the same sources in the browser at run time, through the
  same compilation service the product uses, driving the generator explicitly.

Everything else is the shipped host's build: the same engine archive, the same
ahead-of-time compilation, SIMD, exception handling, heap and trimming. A parity
run that differed in any of these would be comparing a different browser build.

Prepare both apps from the Tau workspace root:

```sh
pnpm nx run picogk:prepare-parity-apps /absolute/path/to/config.json
```

```json
{
  "dotnet": "/absolute/dotnet-11/dotnet",
  "packageRoot": "/absolute/restored/picovoxel.picogk/<version>",
  "picoGkProject": "/absolute/composed/PicoGK.csproj",
  "picovoxelRoot": "/absolute/picovoxel",
  "referencesRoot": "/absolute/authoring-references",
  "outputRoot": "/absolute/out/parity-apps",
  "modes": ["aot", "dynamic"]
}
```

The script refuses a payload whose engine archive bytes no longer match their own
receipts, fetches each author tree at its pin through PicoVoxel's own fetcher,
which throws on any difference, and records the fixture, author and archive
identities beside the apps. Run a prepared app with PicoVoxel's
`dotnet/run-parity-browser.mjs`, which serves it cross-origin isolated and
collects the captures, then gate every engine together with
`dotnet/gate-parity.mjs`.

`index.html` is the only part of the run that is not the measured program. It
stages the project and the verified compiler references into the runtime's file
system in dynamic mode, as the shipped worker's owner does, and hands each
capture to the gate with `PUT capture/<file name>`.
