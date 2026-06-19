import { NodeIO } from '@gltf-transform/core';
import type { JSONDocument } from '@gltf-transform/core';
import { registerTauGltfExtensions } from '@taucad/gltf-extensions';
import { tauCadTopologyExtension } from '@taucad/types/constants';

type StripTauGltfMetadataOptions = {
  format: 'glb' | 'gltf';
};

const encodeBase64 = (data: Uint8Array<ArrayBuffer>): string => {
  let binary = '';
  for (const byte of data) {
    binary += String.fromCodePoint(byte);
  }
  // oxlint-disable-next-line no-restricted-globals -- btoa is available in runtime browser targets and Node 24.
  return btoa(binary);
};

const embedGltfResources = (
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

/**
 * Strip Tau-owned interaction metadata from final GLB/glTF exports.
 *
 * @public
 */
export async function stripTauGltfMetadata(
  bytes: Uint8Array<ArrayBuffer>,
  options: StripTauGltfMetadataOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  const io = registerTauGltfExtensions(new NodeIO());
  const document =
    options.format === 'glb'
      ? await io.readBinary(bytes)
      : await io.readJSON({
          json: JSON.parse(new TextDecoder().decode(bytes)) as JSONDocument['json'],
          resources: {},
        });

  const root = document.getRoot();
  root.setExtension(tauCadTopologyExtension, null);

  for (const node of root.listNodes()) {
    const {
      tauComponentId: _tauComponentId,
      tauComponentKind: _tauComponentKind,
      tauComponentSelector: _tauComponentSelector,
      ...extras
    } = node.getExtras();
    node.setExtras(extras);
  }

  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const {
        tauComponentId: _tauComponentId,
        tauComponentKind: _tauComponentKind,
        tauComponentSelector: _tauComponentSelector,
        tauSectionOwnerComponentId: _tauSectionOwnerComponentId,
        faceGroups: _faceGroups,
        edgeGroups: _edgeGroups,
        ...extras
      } = primitive.getExtras();
      primitive.setExtras(extras);
    }
  }

  if (options.format === 'glb') {
    return io.writeBinary(document);
  }

  const result = await io.writeJSON(document);
  const json = embedGltfResources(result.json as unknown as Record<string, unknown>, result.resources);
  return new TextEncoder().encode(JSON.stringify(json, null, 2));
}
