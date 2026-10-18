/**
 * Purpose: The PicoGK layer as the .NET layer rule of `@taucad/dotnet-kernel-core/layer` publishes it, and the names
 *   the compose script, the release job (through it), the manifest tests and the native test fixture use.
 * Why: the layer is addressed by its digest on `cdn.tau.new` (`blobs/sha256/<hex>`, the D25 mirror layout) and by an
 *   immutable GitHub Release named after the digest; deriving both from the record keeps the manifest, the upload
 *   and the test from drifting (I13).
 * Environment: none; pure functions.
 * Usage: imported by scripts/compose-tau-plugin.mts, the manifest test and the native test fixture; not exported.
 * Exit codes: none.
 */
import { createDotnetLayer } from '@taucad/dotnet-kernel-core/layer';
import type { DotnetLayer, DotnetLayerRecord } from '@taucad/dotnet-kernel-core/layer';

/**
 * The Tau PicoGK layer: the ReadyToRun worker, the patched `PicoGK.dll`, Roslyn, SkiaSharp and the Tau-built engine,
 * which the macOS release job builds for darwin-arm64 only until a Linux engine builder exists.
 * @internal
 */
export const picogkLayer: DotnetLayer = {
  name: 'picogk',
  package: '@taucad/picogk',
  displayName: 'PicoGK',
  description:
    "The native PicoGK runtime closure: Microsoft's .NET runtime archive and the Tau framework-dependent layer.",
  targets: ['darwin-arm64'],
};

const rule = createDotnetLayer(picogkLayer);

/**
 * What `prepare-picogk-dotnet.mts --layer` writes beside the layer archive: the bytes' identity and provenance.
 * @internal
 */
export const picogkLayerRecordSchema = rule.recordSchema;

/** @internal */
export type PicogkLayerRecord = DotnetLayerRecord;

/** The GitHub Release that carries one layer, such as `picogk-layer-0123456789abcdef`. @internal */
export const { releaseTag: layerReleaseTag } = rule;

/** The URLs the manifest pins for a layer: the CDN URL, then the GitHub Release asset URL. @internal */
export const { urls: layerUrls } = rule;

/** The `worker` payload of the darwin-arm64 variant for a layer record. @internal */
export const { payload: layerPayload } = rule;

/** Replace the `worker` pin of the darwin-arm64 `runtime` variant and keep every other byte of the manifest. @internal */
export const { composeManifest } = rule;

/**
 * The CycloneDX 1.6 SBOM of the closure a manifest pins (charter D26). The layer's own inventory (PicoGK, Roslyn,
 * SkiaSharp and the engine's native sources) is the SBOM inside the layer, `tau-worker/tau-picogk-sbom.cdx.json`.
 * @internal
 */
export const { composeSbom } = rule;
