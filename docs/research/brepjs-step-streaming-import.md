---
title: 'brepjs STEP Stream Import Audit'
description: 'Audit of brepjs STEP stream import/export and how GeoSpec should adapt the native OCCT ReadStream pattern for large STEP testing.'
status: active
created: '2026-06-01'
updated: '2026-06-01'
category: investigation
related:
  - docs/research/geospec-standalone-cad-testing-blueprint.md
  - docs/research/vitest-style-parameter-geometry-testing-blueprint.md
  - docs/research/browser-first-parameter-aware-testing.md
  - docs/policy/library-api-policy.md
---

# brepjs STEP Stream Import Audit

Investigation of `repos/brepjs` after syncing latest from `andymai/brepjs`, focused on its stream-based STEP import/export path and the implications for GeoSpec large-file testing.

## Executive Summary

`brepjs` now includes a custom `StepStreamIO` OpenCascade binding that bypasses Emscripten FS for STEP import/export. The native wrapper passes a full STEP string into C++, wraps it in `std::istringstream`, and calls OCCT `STEPControl_Reader::ReadStream`; export uses `std::ostringstream` plus `STEPControl_Writer::WriteStream`. This is not browser `ReadableStream` incremental parsing, but it is still a better P0 large-file baseline than MEMFS because it avoids temporary path management and an extra write/read through the virtual filesystem.

GeoSpec should adapt the pattern directly, but extend it to `STEPCAFControl_Reader::ReadStream` so AP242/XDE evidence is preserved. The public `geospec/step` API should accept `Blob`, `File`, Node streams, browser `ReadableStream`, and async iterables, normalize them with progress events, then use native `ReadStream` when available. MEMFS `ReadFile` should be an explicit fallback strategy with provenance, not the default.

## Methodology

- Ran `pnpm repos sync brepjs` from `/Users/rifont/git/tau`.
- Confirmed `repos/brepjs` is clean and on latest `main`.
- Inspected `repos/brepjs/src/kernel/occt/ioOps.ts`, `repos/brepjs/packages/brepjs-opencascade/build-config/brepjs.yml`, generated `.d.ts` files, STEP tests, and STEP benchmarks.
- Cross-checked OCCT headers and implementation in `repos/OCCT/src/DataExchange/TKDESTEP/STEPCAFControl` and `repos/OCCT/src/DataExchange/TKDESTEP/STEPControl` to verify XDE stream support.

## Sync Result

Latest local brepjs revision after sync:

```text
eba6ebc0b77fe0832bf8ca6f1d611150e9f6eead 2026-06-01 chore(main): release brepjs 18.35.3 (#1138)
```

The manifest entry is already present:

```yaml
brepjs:
  upstream: andymai/brepjs
  description: Web CAD library with pluggable geometry kernel
```

## Findings

### Finding 1: brepjs exposes a custom native `StepStreamIO` wrapper

`repos/brepjs/packages/brepjs-opencascade/build-config/brepjs.yml` binds `StepStreamIO` as a V8 feature wrapper. The relevant wrapper is hand-written C++ in `additionalBindCode`:

```cpp
class StepStreamIO {
public:
  static std::string exportSTEP(const TopoDS_Shape& shape, int schema) {
    STEPControl_Writer writer;
    Interface_Static::SetIVal("write.step.schema", schema);
    writer.Model(Standard_True);
    Message_ProgressRange progress;
    writer.Transfer(shape, STEPControl_AsIs, Standard_True, progress);
    std::ostringstream oss;
    writer.WriteStream(oss);
    return oss.str();
  }

  static TopoDS_Shape importSTEP(const std::string& data) {
    std::istringstream iss(data);
    STEPControl_Reader reader;
    if (reader.ReadStream("memory.step", iss) != IFSelect_RetDone) {
      return TopoDS_Shape();
    }
    Message_ProgressRange progress;
    reader.TransferRoots(progress);
    return reader.OneShape();
  }
};
```

Generated TypeScript confirms the public native surface:

```ts
export declare class StepStreamIO {
  static exportSTEP(shape: TopoDS_Shape, schema: Standard_Integer): string;
  static importSTEP(data: string): TopoDS_Shape;
}
```

### Finding 2: TypeScript feature-detects native stream I/O and falls back to MEMFS

The `src/kernel/occt/ioOps.ts` adapter checks for `oc.StepStreamIO` before allocating a temp file:

```ts
const streamIO = oc.StepStreamIO;
if (typeof streamIO?.importSTEP === 'function') {
  const shape = streamIO.importSTEP(dataStr);
  if (shape.IsNull()) {
    throw new Error('Failed to import STEP file: stream reader could not parse the input data');
  }
  return [shape];
}

const filename = uniqueIOFilename('_import', 'step');
oc.FS.writeFile('/' + filename, buffer);
const reader = new oc.STEPControl_Reader_1();
```

This is the right compatibility shape for GeoSpec: native stream first, filesystem fallback second, and a capability check rather than a version check.

### Finding 3: brepjs stream import is not chunked JS streaming

The current path still performs these copies:

1. JS reads or creates the full STEP payload.
2. TypeScript decodes `ArrayBuffer` to a string when needed.
3. Embind copies that string into C++ as `std::string`.
4. C++ creates a `std::istringstream` over the string.
5. OCCT parses from `ReadStream`.

This avoids MEMFS path overhead and temp file cleanup, but it does not parse incrementally from a browser `ReadableStream` or Node `Readable`. GeoSpec docs should call this "native stream import" or "OCCT iostream import", not "zero-copy streaming".

### Finding 4: OCCT supports XDE stream reads directly

The crucial GeoSpec difference is AP242/XDE evidence. brepjs uses `STEPControl_Reader`, which returns a shape. GeoSpec needs product structure, colors, materials, validation properties, PMI/GD&T where available, and assembly occurrences.

OCCT has the required hook:

```cpp
Standard_EXPORT IFSelect_ReturnStatus ReadStream(const char* const theName,
                                                 std::istream&     theIStream);
```

on `STEPCAFControl_Reader`, and its implementation delegates to the underlying STEP reader:

```cpp
IFSelect_ReturnStatus STEPCAFControl_Reader::ReadStream(const char* const theName,
                                                        std::istream&     theIStream)
{
  return myReader.ReadStream(theName, theIStream);
}
```

That means GeoSpec can implement the brepjs pattern without sacrificing XDE. The wrapper should instantiate `STEPCAFControl_Reader`, enable the XDE read modes requested by the caller, call `ReadStream("memory.step", iss)`, transfer into a `TDocStd_Document`, and extract evidence from XDE labels.

### Finding 5: Large-file API needs provenance and strategy reporting

Large-file behavior cannot be hidden behind a boolean. The loaded artifact should report how it read the file:

```ts
type StepReadStrategy = 'native-stream' | 'filesystem' | 'chunked-native-stream-experimental';

interface StepReadProvenance {
  strategy: StepReadStrategy;
  inputKind: 'path' | 'url' | 'blob' | 'file' | 'array-buffer' | 'uint8-array' | 'readable-stream' | 'async-iterable';
  bytesRead: number;
  copiedToEmscriptenFs: boolean;
  nativeReadStream: boolean;
  parseBoundary: 'full-text' | 'chunked-streambuf';
}
```

This matters because `native-stream` and `filesystem` have different memory profiles, and the test result should explain which path was used when a large STEP file fails in CI or the browser.

## Recommended GeoSpec API

### Public authoring surface

Keep the root `geospec` import for test authoring and use `geospec/step` only for STEP loading:

```ts
import { describe, expectGeo, it } from 'geospec';
import { loadStep } from 'geospec/step';

describe('supplier AP242 assembly', () => {
  it('preserves product structure and exact volume', async () => {
    const model = await loadStep({
      source: './fixtures/supplier-assembly.step',
      evidence: ['shape', 'xde', 'ap242', 'mesh'],
      units: 'mm',
      streaming: 'auto',
      onProgress(event) {
        console.info(event.phase, event.bytesRead);
      },
    });

    await expectGeo(model).toHaveStepUnits({ units: 'mm' });
    await expectGeo(model).toHaveProductStructure({
      occurrences: 12,
      requireNames: true,
    });
  });
});
```

### `geospec/step` types

```ts
type StepSource =
  | string
  | URL
  | Uint8Array
  | ArrayBuffer
  | Blob
  | File
  | ReadableStream<Uint8Array>
  | AsyncIterable<Uint8Array>;

type StepStreamingMode = 'auto' | 'native-stream' | 'filesystem' | 'chunked-native-stream-experimental';

interface LoadStepOptions {
  source: StepSource;
  evidence?: readonly StepEvidenceKind[];
  units?: LengthUnit;
  streaming?: StepStreamingMode;
  signal?: AbortSignal;
  onProgress?: (event: StepLoadProgressEvent) => void;
  maxBytes?: number;
  mesh?: StepMeshOptions;
}
```

`streaming: 'auto'` should prefer the native XDE stream wrapper. `streaming: 'filesystem'` should exist only for debugging parity and older builds. `chunked-native-stream-experimental` should be reserved for a later callback-backed `std::streambuf` implementation.

## Native Wrapper Blueprint

P0 wrapper:

```cpp
class GeoSpecStepStreamReader {
public:
  static GeoSpecStepReadResult readText(const std::string& data,
                                        const GeoSpecStepReadOptions& options) {
    std::istringstream input(data);
    STEPCAFControl_Reader reader;

    reader.SetColorMode(options.readColors);
    reader.SetNameMode(options.readNames);
    reader.SetLayerMode(options.readLayers);
    reader.SetPropsMode(options.readValidationProperties);
    reader.SetGDTMode(options.readGdt);
    reader.SetMatMode(options.readMaterials);
    reader.SetProductMetaMode(options.readProductMetadata);

    IFSelect_ReturnStatus status = reader.ReadStream("memory.step", input);
    if (status != IFSelect_RetDone) {
      return GeoSpecStepReadResult::failure(status);
    }

    Handle(TDocStd_Document) document = new TDocStd_Document("GeoSpec-XDE");
    Message_ProgressRange progress;
    if (!reader.Transfer(document, progress)) {
      return GeoSpecStepReadResult::transferFailure();
    }

    return GeoSpecStepReadResult::fromDocument(document, reader);
  }
};
```

P1 wrapper:

- Add direct shape-only `STEPControl_Reader::ReadStream` for cases that request only `evidence: ['shape']`.
- Add `writeText` for STEP export parity using `STEPCAFControl_Writer` or `STEPControl_Writer::WriteStream`.
- Add memory telemetry: input bytes, text bytes, peak WASM heap if available, output evidence handle counts.

P2 wrapper:

- Implement a custom `std::streambuf` backed by a pull callback into JS or a worker-side chunk buffer.
- Use that only after proving call overhead and lifetime safety with large fixtures.

## Required Tests

| Test                                                         | Purpose                                                                | Priority |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- | -------- |
| Native stream import of simple AP242 STEP                    | Proves `STEPCAFControl_Reader::ReadStream` wrapper works               | P0       |
| Native stream import preserves XDE names/colors/product tree | Proves GeoSpec did not regress to shape-only STEP                      | P0       |
| MEMFS fallback parity                                        | Ensures older builds remain usable and report `strategy: 'filesystem'` | P0       |
| Invalid/empty STEP returns structured failure                | Avoids opaque exceptions from parser errors                            | P0       |
| Large STEP fixture from `Blob.stream()` in browser worker    | Proves progress, worker isolation, and memory behavior                 | P0       |
| Large STEP fixture from Node `AsyncIterable<Uint8Array>`     | Proves CI and non-browser ingestion                                    | P0       |
| Strategy provenance snapshot                                 | Makes memory and fallback behavior auditable                           | P0       |
| Abort before native parse                                    | Confirms cancellation during source ingestion                          | P1       |
| Worker termination during native parse                       | Documents current cancellation boundary                                | P1       |
| Experimental chunked streambuf spike                         | Determines whether true incremental parse is worth P2 complexity       | P2       |

## Implications For GeoSpec

- The blueprint should replace "write chunks into Emscripten FS, then `ReadFile`" as the default with "normalize source, then call native XDE `ReadStream`".
- `loadStep` should surface progress during source ingestion and evidence extraction. Native parse progress can be added later through a custom `Message_ProgressIndicator` wrapper.
- The Tau runtime should emit read strategy and capabilities in `GeometryArtifact.provenance`, so test tools can explain why a large STEP import failed.
- `geospec/step` should remain lazy. Importing `geospec` must not initialize OCCT or the STEP loader.

## References

- `repos/brepjs/src/kernel/occt/ioOps.ts`
- `repos/brepjs/packages/brepjs-opencascade/build-config/brepjs.yml`
- `repos/brepjs/packages/brepjs-opencascade/src/brepjs_single.d.ts`
- `repos/brepjs/tests/importFns.test.ts`
- `repos/brepjs/tests/kernel-ops.test.ts`
- `repos/brepjs/benchmarks/step-io.bench.test.ts`
- `repos/OCCT/src/DataExchange/TKDESTEP/STEPCAFControl/STEPCAFControl_Reader.hxx`
- `repos/OCCT/src/DataExchange/TKDESTEP/STEPCAFControl/STEPCAFControl_Reader.cxx`
- `repos/OCCT/src/DataExchange/TKDESTEP/STEPControl/STEPControl_Reader.hxx`
- `repos/OCCT/src/DataExchange/TKDESTEP/STEPControl/STEPControl_Reader.cxx`
