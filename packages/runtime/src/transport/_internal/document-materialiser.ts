import type { Rendering, ExportResult } from '#client/runtime-document.types.js';
import type { WireRendering, WireExportResult } from '#types/runtime-document-protocol.types.js';
import type { BinaryContentDelivery } from '#types/runtime-wire.types.js';
import { asKnownArtifact } from '#types/runtime-artifact.js';

/**
 * A delivered view artifact broke its media's content rule, so the client cannot hand it to a viewer. It carries the
 * code the worker gives the same rule (`GLTF_BYTES_INVALID`, `SVG_DOCUMENT_INVALID`), so a `discarded` observation names
 * the failure as the worker would rather than as `UNKNOWN`. Still a `TypeError`, as `asKnownArtifact` throws.
 *
 * @internal
 */
export class ArtifactContentInvalidError extends TypeError {
  public override readonly name = 'ArtifactContentInvalidError';
  public readonly code: 'GLTF_BYTES_INVALID' | 'SVG_DOCUMENT_INVALID';

  /**
   * Name the broken rule by the worker's code for it.
   *
   * @param mimeType - The known media type whose rule the content broke.
   * @param cause - The rule's own error.
   */
  public constructor(mimeType: 'image/svg+xml' | 'model/gltf-binary', cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.code = mimeType === 'image/svg+xml' ? 'SVG_DOCUMENT_INVALID' : 'GLTF_BYTES_INVALID';
  }
}

/** Decode a view and admit it only after asynchronous binary ownership is released. @internal */
export async function materialiseRendering(
  wire: WireRendering,
  resolveBinary: (content: BinaryContentDelivery) => Promise<Uint8Array<ArrayBuffer>>,
  isCurrent: () => boolean,
): Promise<Rendering | undefined> {
  if (!wire.success) {
    return isCurrent() ? wire : undefined;
  }
  const { content } = wire.artifact;
  const materialised = typeof content === 'string' ? content : await resolveBinary(content);
  if (!isCurrent()) {
    return undefined;
  }
  const artifact = { ...wire.artifact, content: materialised };
  let known: ReturnType<typeof asKnownArtifact>;
  try {
    known = asKnownArtifact(artifact);
  } catch (error) {
    throw new ArtifactContentInvalidError(
      artifact.mimeType === 'image/svg+xml' ? artifact.mimeType : 'model/gltf-binary',
      error,
    );
  }
  return { ...wire, artifact: known ?? artifact };
}

/** Decode all export files, preserving the nonempty tuple and file order. @internal */
export async function materialiseDocumentExport(
  wire: WireExportResult,
  resolveBinary: (content: BinaryContentDelivery) => Promise<Uint8Array<ArrayBuffer>>,
  isCurrent: () => boolean,
): Promise<ExportResult | undefined> {
  if (!wire.success) {
    return isCurrent() ? wire : undefined;
  }
  const [first, ...rest] = wire.files;
  const deliveries = await Promise.allSettled(wire.files.map(async (file) => resolveBinary(file.bytes)));
  const failed = deliveries.find((delivery) => delivery.status === 'rejected');
  if (failed?.status === 'rejected') {
    throw failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason));
  }
  const resolved = deliveries.map((delivery) => {
    if (delivery.status === 'rejected') {
      throw new Error('Export payload was not materialised.');
    }
    return delivery.value;
  });
  const firstBytes = resolved[0];
  if (!firstBytes) {
    throw new Error('Export payload was not materialised.');
  }
  const files: [
    { name: string; mimeType: string; bytes: Uint8Array<ArrayBuffer> },
    ...Array<{ name: string; mimeType: string; bytes: Uint8Array<ArrayBuffer> }>,
  ] = [{ ...first, bytes: firstBytes }];
  for (const [index, file] of rest.entries()) {
    const bytes = resolved[index + 1];
    if (!bytes) {
      throw new Error('Export payload was not materialised.');
    }
    files.push({ ...file, bytes });
  }
  if (!isCurrent()) {
    return undefined;
  }
  return { ...wire, files };
}
