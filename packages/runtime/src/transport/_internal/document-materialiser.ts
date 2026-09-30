import type { Rendering, ExportResult } from '#client/runtime-document.types.js';
import type { WireRendering, WireExportResult } from '#types/runtime-document-protocol.types.js';
import type { BinaryContentDelivery } from '#types/runtime-wire.types.js';
import { asKnownArtifact } from '#types/runtime-artifact.js';

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
  return { ...wire, artifact: asKnownArtifact(artifact) ?? artifact };
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
