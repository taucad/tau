const encodeBase64 = (data: Uint8Array<ArrayBuffer>): string => {
  let binary = '';
  for (const byte of data) {
    binary += String.fromCodePoint(byte);
  }
  // oxlint-disable-next-line no-restricted-globals -- btoa is available in runtime browser targets and Node 24.
  return btoa(binary);
};

/**
 * Embed glTF buffer resources as data URIs in a JSON document.
 *
 * @param json - Mutable glTF JSON object produced by glTF Transform.
 * @param resources - Resource bytes keyed by the buffer URI recorded in the document.
 * @returns The supplied JSON object with matching buffer resources embedded.
 * @public
 */
export const embedGltfResources = (
  json: Record<string, unknown>,
  resources: Record<string, Uint8Array<ArrayBuffer> | ArrayBuffer>,
): Record<string, unknown> => {
  const buffers = Array.isArray(json['buffers']) ? json['buffers'] : [];
  for (const buffer of buffers) {
    if (!buffer || typeof buffer !== 'object') {
      continue;
    }
    const record = buffer as Record<string, unknown>;
    const uri = typeof record['uri'] === 'string' ? record['uri'] : undefined;
    const resource = uri ? resources[uri] : undefined;
    if (!resource) {
      continue;
    }
    const bytes = resource instanceof Uint8Array ? resource : new Uint8Array(resource);
    record['uri'] = `data:application/octet-stream;base64,${encodeBase64(bytes)}`;
  }
  return json;
};
