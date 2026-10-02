import type { Artifact } from '#types/runtime-kernel-v2.types.js';

/** Validated CAD media known to the runtime's built-in viewers. @public */
export type KnownArtifact =
  | (Omit<Artifact, 'mimeType' | 'content'> & Readonly<{ mimeType: 'image/svg+xml'; content: string }>)
  | (Omit<Artifact, 'mimeType' | 'content'> &
      Readonly<{ mimeType: 'model/gltf-binary'; content: Uint8Array<ArrayBuffer> }>);

/** Validate and narrow known media; retain unknown MIME types as opaque artifacts. @public */
export function asKnownArtifact(artifact: Artifact): KnownArtifact | undefined {
  if (artifact.mimeType === 'image/svg+xml') {
    if (typeof artifact.content !== 'string') {
      throw new TypeError('SVG artifact content must be a complete SVG string.');
    }
    const content = artifact.content.trim();
    if (!/^(?:<\?xml\s[^?]*\?>\s*)?<svg(?:\s[^>]*)?(?:\/>|>[\s\S]*<\/svg\s*>)$/u.test(content)) {
      throw new TypeError('SVG artifact content must be a complete SVG string.');
    }
    return { ...artifact, mimeType: 'image/svg+xml', content };
  }
  if (artifact.mimeType === 'model/gltf-binary') {
    if (!(artifact.content instanceof Uint8Array) || artifact.content.byteLength === 0) {
      throw new TypeError('GLB artifact content must be nonempty Uint8Array bytes.');
    }
    return { ...artifact, mimeType: 'model/gltf-binary', content: artifact.content };
  }
  return undefined;
}
