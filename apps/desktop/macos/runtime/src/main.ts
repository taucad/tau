import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { converterRuntime } from '@taucad/converter';
import { GLB_BUFFER, WebIO } from '@gltf-transform/core';
import type { GLTF, JSONDocument } from '@gltf-transform/core';
import { normals, prune } from '@gltf-transform/functions';
import { base64ToUint8Array, uint8ArrayToBase64 } from 'uint8array-extras';
import manifest from '#quick-look-manifest' with { type: 'json' };

type NativeFile = { readonly path: string; readonly base64: string };
type NativeRequest = {
  readonly id: string;
  readonly entry: string;
  readonly files: readonly NativeFile[];
  readonly target: string;
  readonly width?: number;
  readonly height?: number;
};
type NativeReply =
  | { readonly type: 'ready' }
  | { readonly id: string; readonly success: true; readonly name: string; readonly base64: string }
  | { readonly id: string; readonly success: false; readonly error: string };

type QuickLookScope = typeof globalThis & {
  tauQuickLook: { cancel(id: string): void; convert(request: NativeRequest): void };
  webkit?: { messageHandlers?: { tauQuickLook?: { postMessage(reply: NativeReply): void } } };
};

const active = new Map<string, { terminate(): void }>();
const scope = globalThis as QuickLookScope;

const post = (reply: NativeReply): void => scope.webkit?.messageHandlers?.tauQuickLook?.postMessage(reply);

const readThumbnailGlb = (bytes: Uint8Array<ArrayBuffer>): JSONDocument => {
  if (bytes.byteLength < 20) {
    throw new Error('Converter returned a truncated GLB result');
  }
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.getUint32(0, true) !== 0x46_54_6c_67 || header.getUint32(4, true) !== 2) {
    throw new Error('Converter returned an invalid glTF 2.0 binary');
  }
  if (header.getUint32(8, true) !== bytes.byteLength || header.getUint32(16, true) !== 0x4e_4f_53_4a) {
    throw new Error('Converter returned an invalid GLB container');
  }
  const jsonLength = header.getUint32(12, true);
  const binHeaderOffset = 20 + jsonLength;
  if (binHeaderOffset > bytes.byteLength) {
    throw new Error('Converter returned a truncated GLB JSON chunk');
  }
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, binHeaderOffset)).trim()) as GLTF.IGLTF;
  if (json.buffers?.some((buffer) => buffer.uri !== undefined)) {
    throw new Error('Converter returned a GLB with an external buffer');
  }
  const resources: JSONDocument['resources'] = {};
  if (binHeaderOffset < bytes.byteLength) {
    if (binHeaderOffset + 8 > bytes.byteLength || header.getUint32(binHeaderOffset + 4, true) !== 0x00_4e_49_42) {
      throw new Error('Converter returned an invalid GLB binary chunk');
    }
    const binLength = header.getUint32(binHeaderOffset, true);
    if (binHeaderOffset + 8 + binLength > bytes.byteLength) {
      throw new Error('Converter returned a truncated GLB binary chunk');
    }
    const bin = new Uint8Array(binLength);
    bin.set(bytes.subarray(binHeaderOffset + 8, binHeaderOffset + 8 + binLength));
    resources[GLB_BUFFER] = bin;
  }
  return { json, resources };
};

const toStaticThumbnailGlb = async (bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> => {
  const io = new WebIO();
  const jsonDocument = readThumbnailGlb(bytes);
  delete jsonDocument.json.images;
  delete jsonDocument.json.textures;
  delete jsonDocument.json.samplers;
  for (const material of jsonDocument.json.materials ?? []) {
    delete material.normalTexture;
    delete material.occlusionTexture;
    delete material.emissiveTexture;
    delete material.pbrMetallicRoughness?.baseColorTexture;
    delete material.pbrMetallicRoughness?.metallicRoughnessTexture;
  }
  const document = await io.readJSON(jsonDocument);
  const root = document.getRoot();
  for (const animation of root.listAnimations()) {
    animation.dispose();
  }
  for (const node of root.listNodes()) {
    node.setSkin(null);
    node.setWeights([]);
  }
  for (const skin of root.listSkins()) {
    skin.dispose();
  }
  for (const mesh of root.listMeshes()) {
    mesh.setWeights([]);
    for (const primitive of mesh.listPrimitives()) {
      for (const semantic of primitive.listSemantics()) {
        if (semantic !== 'POSITION' && semantic !== 'NORMAL') {
          primitive.setAttribute(semantic, null);
        }
      }
      for (const target of primitive.listTargets()) {
        primitive.removeTarget(target);
      }
    }
  }
  for (const material of root.listMaterials()) {
    material.setBaseColorTexture(null);
    material.setMetallicRoughnessTexture(null);
    material.setNormalTexture(null);
    material.setOcclusionTexture(null);
    material.setEmissiveTexture(null);
  }
  await document.transform(normals(), prune());
  const output = await io.writeBinary(document);
  const copy = new Uint8Array(output.byteLength);
  copy.set(output);
  return copy;
};

const convert = async (request: NativeRequest): Promise<void> => {
  if (active.has(request.id)) {
    post({ id: request.id, success: false, error: 'Duplicate conversion request' });
    return;
  }
  const totalBase64Bytes = request.files.reduce((total, file) => total + file.base64.length, 0);
  if (request.files.length === 0 || request.files.length > manifest.limits.maxFiles) {
    post({ id: request.id, success: false, error: 'Quick Look file-count limit exceeded' });
    return;
  }
  if (totalBase64Bytes > Math.ceil((manifest.limits.maxTotalBytes * 4) / 3) + 4) {
    post({ id: request.id, success: false, error: 'Quick Look input-size limit exceeded' });
    return;
  }
  if (
    request.target !== 'usdz' &&
    (request.target !== 'png' ||
      !Number.isInteger(request.width) ||
      !Number.isInteger(request.height) ||
      request.width! < 16 ||
      request.width! > 4096 ||
      request.height! < 16 ||
      request.height! > 4096)
  ) {
    post({ id: request.id, success: false, error: 'Invalid Quick Look output request' });
    return;
  }

  const files = Object.fromEntries(request.files.map((file) => [file.path, base64ToUint8Array(file.base64)]));
  const client = createRuntimeClient({
    transport: inProcessTransport({ runtime: converterRuntime, fileSystem: fromMemoryFs() }),
  });
  active.set(request.id, client);
  try {
    await client.connect();
    const source = { files, entry: request.entry };
    const outcome =
      request.target === 'png'
        ? await (async () => {
            const glb = await client.export('glb', { source });
            const model = glb.success && glb.data.length === 1 ? glb.data[0] : undefined;
            if (!glb.success || !model?.name.endsWith('.glb')) {
              throw new Error(glb.success ? 'Converter returned an invalid GLB result' : glb.issues[0]?.message);
            }
            const thumbnail = await toStaticThumbnailGlb(model.bytes);
            return client.export('png', {
              source: { entry: 'thumbnail.glb', files: { 'thumbnail.glb': thumbnail } },
              exportOptions: { width: request.width!, height: request.height! },
            });
          })()
        : await client.export('usdz', { source });
    const output = outcome.success && outcome.data.length === 1 ? outcome.data[0] : undefined;
    if (!outcome.success || !output?.name.endsWith(`.${request.target}`)) {
      throw new Error(
        outcome.success
          ? `Converter returned an invalid ${request.target.toUpperCase()} result`
          : (outcome.issues[0]?.message ?? `${request.target.toUpperCase()} export failed`),
      );
    }
    if (output.bytes.byteLength === 0 || output.bytes.byteLength > manifest.limits.maxOutputBytes) {
      throw new Error('Quick Look output-size limit exceeded');
    }
    post({ id: request.id, success: true, name: output.name, base64: uint8ArrayToBase64(output.bytes) });
  } catch (error) {
    post({
      id: request.id,
      success: false,
      error: error instanceof Error ? error.message : `${request.target.toUpperCase()} export failed`,
    });
  } finally {
    active.delete(request.id);
    client.terminate();
  }
};

scope.tauQuickLook = {
  cancel(id) {
    active.get(id)?.terminate();
    active.delete(id);
  },
  convert(request) {
    void convert(request);
  },
};
post({ type: 'ready' });
