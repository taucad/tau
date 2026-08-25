/**
 * Extract external buffer and image URIs from glTF JSON.
 *
 * @param jsonText - Raw `.gltf` JSON text.
 * @returns Referenced non-data URIs, or an empty array for invalid JSON.
 * @public
 */
export const extractReferencedGltfUris = (jsonText: string): string[] => {
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
  const gltf = json as Record<string, unknown>;
  for (const key of ['buffers', 'images']) {
    const resources = gltf[key];
    if (!Array.isArray(resources)) {
      continue;
    }
    for (const resource of resources as unknown[]) {
      if (
        typeof resource === 'object' &&
        resource !== null &&
        'uri' in resource &&
        typeof resource.uri === 'string' &&
        !resource.uri.startsWith('data:')
      ) {
        uris.push(resource.uri);
      }
    }
  }
  return uris;
};
