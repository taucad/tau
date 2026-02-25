/**
 * Extract external URIs referenced by a GLTF JSON file (buffers and images).
 * Skips data URIs (base64-embedded resources).
 *
 * This is useful for discovering sidecar files (.bin, textures) that must
 * accompany a .gltf file during import.
 */
export function extractReferencedGltfUris(jsonText: string): string[] {
  let json: unknown;
  try {
    json = JSON.parse(jsonText);
  } catch {
    return [];
  }

  if (typeof json !== 'object' || json === null) {
    return [];
  }

  const uris: string[] = [];
  const gltfJson = json as Record<string, unknown>;

  if (Array.isArray(gltfJson['buffers'])) {
    for (const buffer of gltfJson['buffers']) {
      if (typeof buffer === 'object' && buffer !== null && 'uri' in buffer && typeof buffer.uri === 'string') {
        const uri = buffer.uri as string;
        if (!uri.startsWith('data:')) {
          uris.push(uri);
        }
      }
    }
  }

  if (Array.isArray(gltfJson['images'])) {
    for (const image of gltfJson['images']) {
      if (typeof image === 'object' && image !== null && 'uri' in image && typeof image.uri === 'string') {
        const uri = image.uri as string;
        if (!uri.startsWith('data:')) {
          uris.push(uri);
        }
      }
    }
  }

  return uris;
}
