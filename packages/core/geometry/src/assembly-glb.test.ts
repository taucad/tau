import { Accessor, Document, NodeIO } from '@gltf-transform/core';
import { tauCadTopologyExtension } from '@taucad/runtime/types';
import { admitMechanism, evaluatePose, transformMechanism } from '@taucad/kinematics';
import type { Mechanism } from '@taucad/kinematics';
import type { JSONObject, PublishedPartAsset, PublishedPartRecord } from '@taucad/runtime/types';
import { describe, expect, it, vi } from 'vitest';
import { flattenAdmittedAssemblyGlb, validateAdmittedAssemblyGlb } from '#assembly-glb.js';
import type { TauCadTopologyRoot } from '#extensions/tau-cad-topology.js';
import type { TauCadTopologyPayload } from '#extensions/tau-cad-topology.types.js';
import { validateTauCadTopology } from '#extensions/tau-cad-topology-validation.js';
import { createNodeIo } from '#gltf.utils.js';
import { transformGltfExportBytes } from '#utils/gltf-export-transform.js';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const translate = (x: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1] as const;
const scale = (x: number, y: number, z: number) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1] as const;
const digest = (character: string): PublishedPartAsset['digest'] =>
  `sha256:${character.repeat(64)}` as PublishedPartAsset['digest'];

// Frozen GLB from convertReplicadGeometriesToGltf, one TestShape with face and edge groups.
// Regenerate with the Replicad producer when its topology wire contract changes.
const realReplicadGlb = Uint8Array.from(
  Buffer.from(
    [
      'Z2xURgIAAAC0CgAADAgAAEpTT057ImFzc2V0Ijp7InZlcnNpb24iOiIyLjAiLCJnZW5lcmF0b3IiOiJAdGF1Y2FkL2dlb21ldHJ5',
      'LWNvcmVAMC4xLjAtYmV0YS4wIn0sInNjZW5lIjowLCJzY2VuZXMiOlt7Im5vZGVzIjpbMF19XSwibm9kZXMiOlt7Im1lc2giOjAs',
      'Im5hbWUiOiJUZXN0U2hhcGUiLCJleHRyYXMiOnsidGF1Q29tcG9uZW50SWQiOiJjb21wb25lbnQ6dGVzdHNoYXBlIiwidGF1Q29t',
      'cG9uZW50S2luZCI6InBhcnQiLCJ0YXVDb21wb25lbnRTZWxlY3RvciI6Im5vZGUvMCJ9fV0sIm1lc2hlcyI6W3sicHJpbWl0aXZl',
      'cyI6W3siYXR0cmlidXRlcyI6eyJQT1NJVElPTiI6MCwiTk9STUFMIjoxfSwibW9kZSI6NCwibWF0ZXJpYWwiOjAsImluZGljZXMi',
      'OjIsImV4dHJhcyI6eyJ0YXVDb21wb25lbnRJZCI6ImNvbXBvbmVudDp0ZXN0c2hhcGUiLCJ0YXVDb21wb25lbnRLaW5kIjoiYm9k',
      'eSIsInRhdUNvbXBvbmVudFNlbGVjdG9yIjoibm9kZS8wL3N1cmZhY2UiLCJmYWNlR3JvdXBzIjpbeyJzdGFydCI6MCwiY291bnQi',
      'OjMsImZhY2VJZCI6MH1dLCJ0YXVGYWNlR3JvdXBVbml0IjoiaW5kaWNlcy12MSJ9fSx7ImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04i',
      'OjN9LCJtb2RlIjoxLCJtYXRlcmlhbCI6MSwiZXh0cmFzIjp7InRhdUNvbXBvbmVudElkIjoiY29tcG9uZW50OnRlc3RzaGFwZSIs',
      'InRhdUNvbXBvbmVudEtpbmQiOiJsaW5lIiwidGF1Q29tcG9uZW50U2VsZWN0b3IiOiJub2RlLzAvZWRnZXMiLCJlZGdlR3JvdXBz',
      'IjpbeyJzdGFydCI6MCwiY291bnQiOjEyLCJlZGdlSWQiOjB9XSwidGF1RWRnZUdyb3VwVW5pdCI6Inh5ei1zY2FsYXJzLXYxIn19',
      'XSwibmFtZSI6IlRlc3RTaGFwZSJ9XSwiYWNjZXNzb3JzIjpbeyJidWZmZXJWaWV3IjowLCJieXRlT2Zmc2V0IjowLCJjb21wb25l',
      'bnRUeXBlIjo1MTI2LCJjb3VudCI6MywidHlwZSI6IlZFQzMiLCJtaW4iOlswLDAsLTAuMDAxMDAwMDAwMDQ3NDk3NDUxM10sIm1h',
      'eCI6WzAuMDAxMDAwMDAwMDQ3NDk3NDUxMywwLDBdfSx7ImJ1ZmZlclZpZXciOjEsImJ5dGVPZmZzZXQiOjAsImNvbXBvbmVudFR5',
      'cGUiOjUxMjYsImNvdW50IjozLCJ0eXBlIjoiVkVDMyJ9LHsiYnVmZmVyVmlldyI6MiwiYnl0ZU9mZnNldCI6MCwiY29tcG9uZW50',
      'VHlwZSI6NTEyNSwiY291bnQiOjMsInR5cGUiOiJTQ0FMQVIifSx7ImJ1ZmZlclZpZXciOjMsImJ5dGVPZmZzZXQiOjAsImNvbXBv',
      'bmVudFR5cGUiOjUxMjYsImNvdW50Ijo0LCJ0eXBlIjoiVkVDMyIsIm1pbiI6WzAsMCwtMC4wMDEwMDAwMDAwNDc0OTc0NTEzXSwi',
      'bWF4IjpbMC4wMDEwMDAwMDAwNDc0OTc0NTEzLDAsMF19XSwiYnVmZmVyVmlld3MiOlt7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6',
      'MCwiYnl0ZUxlbmd0aCI6MzYsInRhcmdldCI6MzQ5NjJ9LHsiYnVmZmVyIjowLCJieXRlT2Zmc2V0IjozNiwiYnl0ZUxlbmd0aCI6',
      'MzYsInRhcmdldCI6MzQ5NjJ9LHsiYnVmZmVyIjowLCJieXRlT2Zmc2V0Ijo3MiwiYnl0ZUxlbmd0aCI6MTIsInRhcmdldCI6MzQ5',
      'NjN9LHsiYnVmZmVyIjowLCJieXRlT2Zmc2V0Ijo4NCwiYnl0ZUxlbmd0aCI6NDgsInRhcmdldCI6MzQ5NjJ9LHsiYnVmZmVyIjow',
      'LCJieXRlT2Zmc2V0IjoxMzIsImJ5dGVMZW5ndGgiOjUxN31dLCJidWZmZXJzIjpbeyJieXRlTGVuZ3RoIjo2NTJ9XSwibWF0ZXJp',
      'YWxzIjpbeyJkb3VibGVTaWRlZCI6dHJ1ZSwicGJyTWV0YWxsaWNSb3VnaG5lc3MiOnsiYmFzZUNvbG9yRmFjdG9yIjpbMC43LDAu',
      'NywwLjcsMV0sIm1ldGFsbGljRmFjdG9yIjowLCJyb3VnaG5lc3NGYWN0b3IiOjAuMzV9fSx7ImRvdWJsZVNpZGVkIjp0cnVlLCJw',
      'YnJNZXRhbGxpY1JvdWdobmVzcyI6eyJiYXNlQ29sb3JGYWN0b3IiOlswLDAsMCwxXSwibWV0YWxsaWNGYWN0b3IiOjB9LCJleHRl',
      'bnNpb25zIjp7IktIUl9tYXRlcmlhbHNfdW5saXQiOnt9fX1dLCJleHRlbnNpb25zIjp7IlRBVV9jYWRfdG9wb2xvZ3kiOnsic2No',
      'ZW1hVmVyc2lvbiI6MSwiZW5jb2RpbmciOiJhcHBsaWNhdGlvbi9qc29uIiwidG9wb2xvZ3lCdWZmZXJWaWV3Ijo0fX0sImV4dGVu',
      'c2lvbnNVc2VkIjpbIlRBVV9jYWRfdG9wb2xvZ3kiLCJLSFJfbWF0ZXJpYWxzX3VubGl0Il19IIwCAABCSU4AAAAAAAAAAAAAAAAA',
      'bxKDOgAAAAAAAAAAAAAAAAAAAABvEoO6AAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAEAAAACAAAAAAAA',
      'AAAAAAAAAAAAbxKDOgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABvEoO6eyJzY2hlbWFWZXJzaW9uIjoxLCJjb21wb25lbnRz',
      'IjpbeyJpZCI6ImNvbXBvbmVudDp0ZXN0c2hhcGUiLCJuYW1lIjoiVGVzdFNoYXBlIiwia2luZCI6InBhcnQiLCJzZWxlY3RvciI6',
      'Im5vZGUvMCIsImZhY2VHcm91cHMiOlt7InN0YXJ0IjowLCJjb3VudCI6MywiZmFjZUlkIjowfV0sImVkZ2VHcm91cHMiOlt7InN0',
      'YXJ0IjowLCJjb3VudCI6MTIsImVkZ2VJZCI6MH1dLCJzb3VyY2VSZWZzIjp7Imtlcm5lbElkIjoicmVwbGljYWQiLCJmYWNlR3Jv',
      'dXBVbml0IjoiaW5kaWNlcy12MSIsImVkZ2VHcm91cFVuaXQiOiJ4eXotc2NhbGFycy12MSJ9LCJjYXBhYmlsaXRpZXMiOnsiZXhw',
      'b3J0cyI6W3siZmlkZWxpdHkiOiJtZXNoIiwiZm9ybWF0cyI6WyJnbGIiLCJzdGwiXSwiYXZhaWxhYmxlIjp0cnVlfSx7ImZpZGVs',
      'aXR5IjoiYnJlcCIsImZvcm1hdHMiOlsic3RlcCIsInN0cCIsImJyZXAiLCJkeGYiXSwiYXZhaWxhYmxlIjp0cnVlfV0sImhhc1By',
      'ZWNpc2VUb3BvbG9neSI6dHJ1ZX0sIm5vZGVJbmRleCI6MH1dfQAAAA==',
    ].join(''),
    'base64',
  ),
);

// Frozen Replicad producer GLB: source-space 2×3 face extents; native volume already 60 mm³.
const realScaledReplicadGlb = Uint8Array.from(
  Buffer.from(
    [
      'Z2xURgIAAAAYCQAAsAUAAEpTT057ImFzc2V0Ijp7InZlcnNpb24iOiIyLjAiLCJnZW5lcmF0b3IiOiJAdGF1Y2FkL2dlb21ldHJ5',
      'LWNvcmVAMC4xLjAtYmV0YS4wIn0sInNjZW5lIjowLCJzY2VuZXMiOlt7Im5vZGVzIjpbMF19XSwibm9kZXMiOlt7Im1lc2giOjAs',
      'Im5hbWUiOiJTY2FsZWRTaGFwZSIsImV4dHJhcyI6eyJ0YXVDb21wb25lbnRJZCI6ImNvbXBvbmVudDpzY2FsZWRzaGFwZSIsInRh',
      'dUNvbXBvbmVudEtpbmQiOiJwYXJ0IiwidGF1Q29tcG9uZW50U2VsZWN0b3IiOiJub2RlLzAifX1dLCJtZXNoZXMiOlt7InByaW1p',
      'dGl2ZXMiOlt7ImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04iOjAsIk5PUk1BTCI6MX0sIm1vZGUiOjQsIm1hdGVyaWFsIjowLCJpbmRp',
      'Y2VzIjoyLCJleHRyYXMiOnsidGF1Q29tcG9uZW50SWQiOiJjb21wb25lbnQ6c2NhbGVkc2hhcGUiLCJ0YXVDb21wb25lbnRLaW5k',
      'IjoiYm9keSIsInRhdUNvbXBvbmVudFNlbGVjdG9yIjoibm9kZS8wL3N1cmZhY2UiLCJmYWNlR3JvdXBzIjpbeyJzdGFydCI6MCwi',
      'Y291bnQiOjMsImZhY2VJZCI6MH1dLCJ0YXVGYWNlR3JvdXBVbml0IjoiaW5kaWNlcy12MSJ9fV0sIm5hbWUiOiJTY2FsZWRTaGFw',
      'ZSJ9XSwiYWNjZXNzb3JzIjpbeyJidWZmZXJWaWV3IjowLCJieXRlT2Zmc2V0IjowLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3Vu',
      'dCI6MywidHlwZSI6IlZFQzMiLCJtaW4iOlswLDAsLTAuMDAzMDAwMDAwMDI2MDc3MDMyXSwibWF4IjpbMC4wMDIwMDAwMDAwOTQ5',
      'OTQ5MDI2LDAsMF19LHsiYnVmZmVyVmlldyI6MSwiYnl0ZU9mZnNldCI6MCwiY29tcG9uZW50VHlwZSI6NTEyNiwiY291bnQiOjMs',
      'InR5cGUiOiJWRUMzIn0seyJidWZmZXJWaWV3IjoyLCJieXRlT2Zmc2V0IjowLCJjb21wb25lbnRUeXBlIjo1MTI1LCJjb3VudCI6',
      'MywidHlwZSI6IlNDQUxBUiJ9XSwiYnVmZmVyVmlld3MiOlt7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MCwiYnl0ZUxlbmd0aCI6',
      'MzYsInRhcmdldCI6MzQ5NjJ9LHsiYnVmZmVyIjowLCJieXRlT2Zmc2V0IjozNiwiYnl0ZUxlbmd0aCI6MzYsInRhcmdldCI6MzQ5',
      'NjJ9LHsiYnVmZmVyIjowLCJieXRlT2Zmc2V0Ijo3MiwiYnl0ZUxlbmd0aCI6MTIsInRhcmdldCI6MzQ5NjN9LHsiYnVmZmVyIjow',
      'LCJieXRlT2Zmc2V0Ijo4NCwiYnl0ZUxlbmd0aCI6NzU5fV0sImJ1ZmZlcnMiOlt7ImJ5dGVMZW5ndGgiOjg0NH1dLCJtYXRlcmlh',
      'bHMiOlt7ImRvdWJsZVNpZGVkIjp0cnVlLCJwYnJNZXRhbGxpY1JvdWdobmVzcyI6eyJiYXNlQ29sb3JGYWN0b3IiOlswLjcsMC43',
      'LDAuNywxXSwibWV0YWxsaWNGYWN0b3IiOjAsInJvdWdobmVzc0ZhY3RvciI6MC4zNX19XSwiZXh0ZW5zaW9ucyI6eyJUQVVfY2Fk',
      'X3RvcG9sb2d5Ijp7InNjaGVtYVZlcnNpb24iOjEsImVuY29kaW5nIjoiYXBwbGljYXRpb24vanNvbiIsInRvcG9sb2d5QnVmZmVy',
      'VmlldyI6M319LCJleHRlbnNpb25zVXNlZCI6WyJUQVVfY2FkX3RvcG9sb2d5Il19ICAgTAMAAEJJTgAAAAAAAAAAAAAAAABvEgM7',
      'AAAAAAAAAAAAAAAAAAAAAKabRLsAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAQAAAAIAAAB7InNjaGVt',
      'YVZlcnNpb24iOjEsImNvbXBvbmVudHMiOlt7ImlkIjoiY29tcG9uZW50OnNjYWxlZHNoYXBlIiwibmFtZSI6IlNjYWxlZFNoYXBl',
      'Iiwia2luZCI6InBhcnQiLCJzZWxlY3RvciI6Im5vZGUvMCIsImZhY2VHcm91cHMiOlt7InN0YXJ0IjowLCJjb3VudCI6MywiZmFj',
      'ZUlkIjowfV0sImVkZ2VHcm91cHMiOltdLCJzb3VyY2VSZWZzIjp7Imtlcm5lbElkIjoicmVwbGljYWQiLCJmYWNlR3JvdXBVbml0',
      'IjoiaW5kaWNlcy12MSIsImVkZ2VHcm91cFVuaXQiOiJ4eXotc2NhbGFycy12MSJ9LCJwaHlzaWNhbCI6eyJ2b2x1bWUiOnsic3Rh',
      'dGUiOiJtZWFzdXJlZCIsInZhbHVlTW0zIjo2MCwiZ2VvbWV0cnlEaWdlc3QiOiJzaGEyNTY6YmJiYmJiYmJiYmJiYmJiYmJiYmJi',
      'YmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYiIsIm1ldGhvZCI6Im9jY3Qtc29saWQtdm9sdW1lIiwi',
      'dmFsaWRpdHkiOiJjbG9zZWQtc29saWQifSwiZGVuc2l0eSI6eyJ2YWx1ZUdQZXJDbTMiOjIuNywicHJvdmVuYW5jZSI6ImF1dGhv',
      'cmVkLXNoYXBlLWNvbmZpZyJ9fSwiY2FwYWJpbGl0aWVzIjp7ImV4cG9ydHMiOlt7ImZpZGVsaXR5IjoibWVzaCIsImZvcm1hdHMi',
      'OlsiZ2xiIiwic3RsIl0sImF2YWlsYWJsZSI6dHJ1ZX0seyJmaWRlbGl0eSI6ImJyZXAiLCJmb3JtYXRzIjpbInN0ZXAiLCJzdHAi',
      'LCJicmVwIiwiZHhmIl0sImF2YWlsYWJsZSI6dHJ1ZX1dLCJoYXNQcmVjaXNlVG9wb2xvZ3kiOnRydWV9LCJub2RlSW5kZXgiOjB9',
      'XX0A',
    ].join(''),
    'base64',
  ),
);

const sourceGlb = async (
  componentId: string,
  offset: number,
  materialName = 'Duplicate',
): Promise<Uint8Array<ArrayBuffer>> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const position = document
    .createAccessor()
    .setType(Accessor.Type['VEC3']!)
    .setArray(new Float32Array([offset, 0, 0, offset + 1, 0, 0, offset, 1, 0]))
    .setBuffer(buffer);
  const material = document.createMaterial(materialName);
  const mesh = document
    .createMesh()
    .addPrimitive(document.createPrimitive().setAttribute('POSITION', position).setMaterial(material));
  const scene = document
    .createScene()
    .addChild(document.createNode('Same Name').setMesh(mesh).setExtras({ tauComponentId: componentId }));
  document.getRoot().setDefaultScene(scene);
  const io = await createNodeIo();
  return io.writeBinary(document);
};

const withUnsupportedMaterialExtension = (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = input.getUint32(12, true);
  const document = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as {
    materials: Array<{ extensions?: Record<string, unknown> }>;
  };
  document.materials[0]!.extensions = {};
  document.materials[0]!.extensions['UNSUPPORTED_display'] = {};
  const json = new TextEncoder().encode(JSON.stringify(document));
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const output = new Uint8Array(bytes.length - jsonLength + paddedLength);
  output.set(bytes.subarray(0, 20));
  output.set(json, 20);
  output.fill(0x20, 20 + json.length, 20 + paddedLength);
  output.set(bytes.subarray(20 + jsonLength), 20 + paddedLength);
  const header = new DataView(output.buffer);
  header.setUint32(8, output.length, true);
  header.setUint32(12, paddedLength, true);
  return output;
};

const record = (asset: PublishedPartAsset): PublishedPartRecord => ({
  schemaVersion: 1,
  variants: { default: { source: { entry: 'part.ts', files: {} }, glb: asset } },
});

describe('flattenAdmittedAssemblyGlb', () => {
  it('rejects an unknown optional material extension before the reader can discard it', async () => {
    const bytes = withUnsupportedMaterialExtension(await sourceGlb('body', 0));
    const asset: PublishedPartAsset = { path: 'unsupported.glb', digest: digest('4'), byteLength: bytes.length };
    await expect(
      flattenAdmittedAssemblyGlb({
        parts: { body: record(asset) },
        occurrences: [{ id: 'body', transform: identity, part: 'body', variant: 'default' }],
        readAsset: async () => bytes,
      }),
    ).rejects.toThrow('UNSUPPORTED_display');
  });

  it('remaps real Replicad topology and primitive refs for two placed occurrences', async () => {
    const io = await createNodeIo();
    const source = await io.readBinary(realReplicadGlb);
    const sourcePayload = source
      .getRoot()
      .getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)
      ?.getPayload() as unknown as TauCadTopologyPayload;
    expect(sourcePayload.components).toHaveLength(1);
    expect(sourcePayload.components[0]?.id).toBe('component:testshape');

    const asset: PublishedPartAsset = { path: 'replicad.glb', digest: digest('f'), byteLength: realReplicadGlb.length };
    const flattened = await flattenAdmittedAssemblyGlb({
      parts: { shape: record(asset) },
      occurrences: [
        { id: 'first', transform: translate(2), part: 'shape', variant: 'default' },
        { id: 'second', transform: translate(4), part: 'shape', variant: 'default' },
      ],
      readAsset: async () => realReplicadGlb,
    });
    const document = await io.readBinary(flattened.geometry.content);
    const root = document.getRoot();
    const payload = root
      .getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)
      ?.getPayload() as unknown as TauCadTopologyPayload;
    expect(payload.components).toHaveLength(4);
    const wrappers = payload.components.filter((component) => component.parentId === undefined);
    const qualified = payload.components.filter((component) => component.sourceRefs?.['kernelId'] === 'replicad');
    expect(qualified).toHaveLength(2);
    expect(qualified[0]?.id).not.toBe(qualified[1]?.id);
    expect(qualified.map((component) => component.parentId)).toHaveLength(2);
    expect(
      qualified.every((component) =>
        payload.components.some(
          (parent) => parent.id === component.parentId && parent.childIds?.includes(component.id),
        ),
      ),
    ).toBe(true);
    expect(qualified.map((component) => component.primitiveRefs?.[0]?.meshIndex)).toEqual([0, 0]);
    expect(qualified.map((component) => component.primitiveRefs?.[0]?.nodeIndex)).toEqual(
      qualified.map((component) => component.nodeIndex),
    );
    expect(new Set(qualified.map((component) => component.nodeIndex)).size).toBe(2);
    expect(
      qualified.every(
        (component) => root.listNodes()[component.nodeIndex!]?.getExtras()['tauComponentId'] === component.id,
      ),
    ).toBe(true);
    expect(wrappers).toHaveLength(2);
    expect(root.listMaterials()).toHaveLength(2);
    expect(root.listMaterials()[1]!.getExtension('KHR_materials_unlit')).not.toBeNull();
    const bounds = {
      nodes: root
        .listNodes()
        .map((node) => ({ meshIndex: node.getMesh() ? root.listMeshes().indexOf(node.getMesh()!) : undefined })),
      meshes: root.listMeshes().map((mesh) =>
        mesh.listPrimitives().map((primitive) => ({
          mode: primitive.getMode(),
          indexCount: primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0,
          positionScalarCount: (primitive.getAttribute('POSITION')?.getCount() ?? 0) * 3,
        })),
      ),
    };
    expect(validateTauCadTopology(payload, bounds)).toEqual([]);
  });

  it('remaps source parent/child relations and explicit primitive refs per occurrence', async () => {
    const io = await createNodeIo();
    const source = await io.readBinary(realReplicadGlb);
    const sourceRoot = source.getRoot();
    const parentNode = sourceRoot.listNodes()[0]!;
    const childNode = source
      .createNode('Child')
      .setMesh(parentNode.getMesh())
      .setExtras({ tauComponentId: 'component:child' });
    parentNode.addChild(childNode);
    const extension = sourceRoot.getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!;
    const original = extension.getPayload() as unknown as TauCadTopologyPayload;
    const first = original.components[0]!;
    extension.setPayload({
      schemaVersion: 1,
      components: [
        { ...first, childIds: ['component:child'] },
        {
          ...first,
          id: 'component:child',
          name: 'Child',
          parentId: first.id,
          childIds: [],
          nodeIndex: 1,
          primitiveRefs: [{ nodeIndex: 1, meshIndex: 0, primitiveIndex: 0 }],
          faceGroups: [],
          edgeGroups: [],
        },
      ],
    });
    const sourceBytes = await io.writeBinary(source);
    const asset: PublishedPartAsset = { path: 'hierarchy.glb', digest: digest('1'), byteLength: sourceBytes.length };
    const flattened = await flattenAdmittedAssemblyGlb({
      parts: { shape: record(asset) },
      occurrences: [
        { id: 'left', transform: identity, part: 'shape', variant: 'default' },
        { id: 'right', transform: translate(5), part: 'shape', variant: 'default' },
      ],
      readAsset: async () => sourceBytes,
    });
    const output = await io.readBinary(flattened.geometry.content);
    const payload = output
      .getRoot()
      .getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!
      .getPayload() as unknown as TauCadTopologyPayload;
    const parents = payload.components.filter((component) => component.name === 'TestShape');
    const children = payload.components.filter((component) => component.name === 'Child');
    expect(parents).toHaveLength(2);
    expect(children).toHaveLength(2);
    expect(parents.map((parent) => parent.childIds)).toEqual([[children[0]!.id], [children[1]!.id]]);
    expect(children.map((child) => child.parentId)).toEqual(parents.map((parent) => parent.id));
    expect(children.map((child) => child.primitiveRefs?.[0]?.nodeIndex)).toEqual(
      children.map((child) => child.nodeIndex),
    );
    expect(children.map((child) => child.primitiveRefs?.[0]?.meshIndex)).toEqual([0, 0]);
  });

  it('keeps occurrence ancestry, placements, and material source asset/index despite duplicate names', async () => {
    const first = await sourceGlb('body', 0);
    const second = await sourceGlb('body', 10);
    const assetA: PublishedPartAsset = { path: 'assets/a.glb', digest: digest('a'), byteLength: first.length };
    const assetB: PublishedPartAsset = { path: 'assets/b.glb', digest: digest('b'), byteLength: second.length };
    const bytes = new Map([
      [assetA.path, first],
      [assetB.path, second],
    ]);
    const secondRecord: PublishedPartRecord = {
      schemaVersion: 1,
      variants: { dark: { source: { entry: 'dark.ts', files: {} }, glb: assetB } },
    };
    let reads = 0;
    const result = await flattenAdmittedAssemblyGlb({
      parts: { a: record(assetA), b: secondRecord },
      occurrences: [
        { id: 'left', transform: translate(2), part: 'a', variant: 'default' },
        { id: 'right', transform: translate(20), part: 'b', variant: 'dark' },
      ],
      readAsset: async (_part, asset) => {
        reads++;
        return bytes.get(asset.path)!;
      },
    });
    expect(reads).toBe(2);
    const io = await createNodeIo();
    const document = await io.readBinary(result.geometry.content);
    const scene = document.getRoot().getDefaultScene()!;
    expect(scene.listChildren()).toHaveLength(2);
    expect(scene.listChildren().map((node) => node.getTranslation()[0])).toEqual([2, 20]);
    expect(result.bounds).toEqual({ min: [2, 0, 0], max: [31, 1, 0] });
    expect(Object.values(result.components).map((value) => value.ancestry)).toEqual([['left'], ['right']]);
    expect(Object.values(result.components).map((value) => value.sourceComponentId)).toEqual(['body', 'body']);
    expect(Object.keys(result.components)).toHaveLength(2);
    expect(result.materials).toEqual([
      { flattenedIndex: 0, sourceDigest: assetA.digest, sourceMaterialIndex: 0, variant: 'default' },
      { flattenedIndex: 1, sourceDigest: assetB.digest, sourceMaterialIndex: 0, variant: 'dark' },
    ]);
    expect(
      document
        .getRoot()
        .listMaterials()
        .map((material) => material.getName()),
    ).toEqual(['Duplicate', 'Duplicate']);

    const transformed = await transformGltfExportBytes(result.geometry.content, {
      format: 'glb',
      unit: { length: 'millimeter' },
    });
    const exported = await io.readBinary(transformed);
    expect(
      exported
        .getRoot()
        .listNodes()
        .every((node) => node.getExtras()['tauComponentId'] === undefined),
    ).toBe(true);
  });

  it('shares source mesh but creates distinct nodes for repeated placements', async () => {
    const bytes = await sourceGlb('shape', 0);
    const asset: PublishedPartAsset = { path: 'asset.glb', digest: digest('c'), byteLength: bytes.length };
    const result = await flattenAdmittedAssemblyGlb({
      parts: { part: record(asset) },
      occurrences: [
        { id: 'left', transform: identity, part: 'part', variant: 'default' },
        { id: 'right', transform: translate(5), part: 'part', variant: 'default' },
      ],
      readAsset: async () => bytes,
    });
    const io = await createNodeIo();
    const document = await io.readBinary(result.geometry.content);
    expect(document.getRoot().listMeshes()).toHaveLength(1);
    expect(document.getRoot().getDefaultScene()!.listChildren()).toHaveLength(2);
    expect(Object.keys(result.components)).toHaveLength(2);
    expect(result.bounds).toEqual({ min: [0, 0, 0], max: [6, 1, 0] });
  });

  it('reads and merges one digest once across differently named pinned part aliases', async () => {
    const bytes = await sourceGlb('shape', 0);
    const asset: PublishedPartAsset = { path: 'asset.glb', digest: digest('3'), byteLength: bytes.length };
    const darkRecord: PublishedPartRecord = {
      schemaVersion: 1,
      variants: { dark: { source: { entry: 'dark.ts', files: {} }, glb: asset } },
    };
    let reads = 0;
    const result = await flattenAdmittedAssemblyGlb({
      parts: { aliasA: record(asset), aliasB: darkRecord },
      occurrences: [
        { id: 'left', transform: identity, part: 'aliasA', variant: 'default' },
        { id: 'right', transform: translate(5), part: 'aliasB', variant: 'dark' },
      ],
      readAsset: async () => {
        reads++;
        return bytes;
      },
    });
    const io = await createNodeIo();
    const document = await io.readBinary(result.geometry.content);
    expect(reads).toBe(1);
    expect(document.getRoot().listMeshes()).toHaveLength(1);
    expect(result.materials.map(({ flattenedIndex, variant }) => ({ flattenedIndex, variant }))).toEqual([
      { flattenedIndex: 0, variant: 'default' },
      { flattenedIndex: 0, variant: 'dark' },
    ]);
    expect(Object.keys(result.components)).toHaveLength(2);
  });

  it('encodes exact nested ancestry without separator collisions or reserved-key lookup', async () => {
    const bytes = await sourceGlb('constructor', 0);
    const asset: PublishedPartAsset = { path: 'asset.glb', digest: digest('e'), byteLength: bytes.length };
    const result = await flattenAdmittedAssemblyGlb({
      parts: Object.fromEntries([
        ['__proto__', record(asset)],
        ['toString', record(asset)],
      ]),
      occurrences: [
        { id: 'a/b', transform: identity, part: 'toString', variant: 'default' },
        {
          id: 'a',
          transform: translate(5),
          children: [{ id: 'b', transform: translate(3), part: 'toString', variant: 'default' }],
        },
        { id: 'reserved', transform: identity, part: '__proto__', variant: 'default' },
      ],
      readAsset: async () => bytes,
    });
    expect(Object.values(result.components).map(({ ancestry }) => ancestry)).toEqual([
      ['a/b'],
      ['a', 'b'],
      ['reserved'],
    ]);
    expect(new Set(Object.keys(result.components)).size).toBe(3);
    expect(result.bounds).toEqual({ min: [0, 0, 0], max: [9, 1, 0] });
  });

  it('rejects an unknown variant and an unannotated mesh node', async () => {
    const bytes = await sourceGlb('body', 0);
    const asset: PublishedPartAsset = { path: 'asset.glb', digest: digest('d'), byteLength: bytes.length };
    await expect(
      flattenAdmittedAssemblyGlb({
        parts: { part: record(asset) },
        occurrences: [{ id: 'x', transform: identity, part: 'part', variant: 'toString' }],
        readAsset: async () => bytes,
      }),
    ).rejects.toThrow('Unknown published part variant');

    const io = await createNodeIo();
    const document = await io.readBinary(bytes);
    document.getRoot().listNodes()[0]!.setExtras({});
    const untagged = await io.writeBinary(document);
    await expect(
      flattenAdmittedAssemblyGlb({
        parts: { part: record(asset) },
        occurrences: [{ id: 'x', transform: identity, part: 'part', variant: 'default' }],
        readAsset: async () => untagged,
      }),
    ).rejects.toThrow('lacks tauComponentId');
  });

  it('rejects adapter-ineligible topology references before projection', async () => {
    const io = await createNodeIo();
    const source = await io.readBinary(realReplicadGlb);
    const extension = source.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!;
    const payload = extension.getPayload() as unknown as TauCadTopologyPayload;
    extension.setPayload({
      ...payload,
      components: [{ ...payload.components[0]!, nodeIndex: 999 }],
    } as unknown as Parameters<TauCadTopologyRoot['setPayload']>[0]);
    const bytes = await io.writeBinary(source);
    const asset: PublishedPartAsset = { path: 'invalid.glb', digest: digest('2'), byteLength: bytes.length };
    await expect(
      flattenAdmittedAssemblyGlb({
        parts: { shape: record(asset) },
        occurrences: [{ id: 'first', transform: identity, part: 'shape', variant: 'default' }],
        readAsset: async () => bytes,
      }),
    ).rejects.toThrow('missing node 999');
  });

  it('should reject topology and mesh identity mismatches before producing projection bytes', async () => {
    const io = await createNodeIo();
    const cases = await Promise.all(
      (['different-id', 'foreign-ref', 'missing-owner', 'empty-refs'] as const).map(async (kind) => {
        const source = await io.readBinary(realReplicadGlb);
        const extension = source.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!;
        const payload = extension.getPayload() as unknown as TauCadTopologyPayload;
        const first = payload.components[0]!;
        const other = source
          .createNode('Other')
          .setMesh(source.getRoot().listMeshes()[0]!)
          .setExtras({ tauComponentId: 'component:other' });
        source.getRoot().getDefaultScene()!.addChild(other);
        const otherComponent = {
          ...first,
          id: 'component:other',
          name: 'Other',
          nodeIndex: 1,
          faceGroups: [],
          edgeGroups: [],
        };
        const components =
          kind === 'different-id'
            ? [{ ...first, id: 'topology-only' }, otherComponent]
            : kind === 'foreign-ref'
              ? [
                  { ...first, primitiveRefs: [{ nodeIndex: 1, meshIndex: 0, primitiveIndex: 0 }], edgeGroups: [] },
                  otherComponent,
                ]
              : kind === 'missing-owner'
                ? [first]
                : [{ ...first, primitiveRefs: [], faceGroups: [], edgeGroups: [] }, otherComponent];
        extension.setPayload({ ...payload, components } as unknown as JSONObject);
        return { kind, bytes: await io.writeBinary(source) };
      }),
    );
    const messages = {
      'different-id': 'identity differs from its mesh node',
      'foreign-ref': 'primitive reference belongs to a different component identity',
      'missing-owner': 'omits a mesh-bearing active scene component',
      'empty-refs': 'mesh component has no owned primitive references',
    };
    const writer = vi.spyOn(NodeIO.prototype, 'writeBinary');
    try {
      await Promise.all(
        cases.map(async ({ kind, bytes }) => {
          const before = new Uint8Array(bytes);
          const asset: PublishedPartAsset = { path: 'invalid.glb', digest: digest('3'), byteLength: bytes.length };
          const input = {
            parts: { shape: record(asset) },
            occurrences: [{ id: 'shape', transform: identity, part: 'shape', variant: 'default' }],
            readAsset: async () => bytes,
          };
          const outcomes = await Promise.allSettled([
            validateAdmittedAssemblyGlb(input),
            flattenAdmittedAssemblyGlb(input),
          ]);
          for (const outcome of outcomes) {
            expect(outcome.status).toBe('rejected');
            if (outcome.status === 'rejected') {
              expect(outcome.reason).toBeInstanceOf(TypeError);
              expect(outcome.reason.message).toContain(messages[kind]);
            }
          }
          expect(bytes).toEqual(before);
        }),
      );
      expect(writer).not.toHaveBeenCalled();
    } finally {
      writer.mockRestore();
    }
  });

  it('should preserve logical groups and distinct component owners sharing one immutable mesh', async () => {
    const io = await createNodeIo();
    const source = await io.readBinary(realReplicadGlb);
    const extension = source.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!;
    const payload = extension.getPayload() as unknown as TauCadTopologyPayload;
    const first = payload.components[0]!;
    const other = source
      .createNode('Other')
      .setMesh(source.getRoot().listMeshes()[0]!)
      .setExtras({ tauComponentId: 'component:other' });
    source.getRoot().getDefaultScene()!.addChild(other);
    extension.setPayload({
      ...payload,
      components: [
        { id: 'group', name: 'Group', kind: 'assembly', selector: 'group', childIds: [first.id, 'component:other'] },
        { ...first, parentId: 'group' },
        {
          ...first,
          id: 'component:other',
          name: 'Other',
          parentId: 'group',
          nodeIndex: 1,
          primitiveRefs: [{ nodeIndex: 1, meshIndex: 0, primitiveIndex: 0 }],
          faceGroups: [],
          edgeGroups: [],
        },
      ],
    } as unknown as JSONObject);
    const bytes = await io.writeBinary(source);
    const asset: PublishedPartAsset = { path: 'group.glb', digest: digest('4'), byteLength: bytes.length };
    const input = {
      parts: { shape: record(asset) },
      occurrences: [{ id: 'shape', transform: identity, part: 'shape', variant: 'default' }],
      readAsset: async () => bytes,
    };
    const metadata = await validateAdmittedAssemblyGlb(input);
    const projected = await flattenAdmittedAssemblyGlb(input);
    const output = await io.readBinary(projected.geometry.content);
    const displayed = metadata.components.filter(({ component }) => component.primitiveRefs?.length);
    expect(displayed.map(({ sourceComponentId }) => sourceComponentId)).toEqual([first.id, 'component:other']);
    expect(output.getRoot().listMeshes()).toHaveLength(1);
    expect(
      output
        .getRoot()
        .listNodes()
        .filter((node) => node.getMesh()),
    ).toHaveLength(2);
    expect(
      metadata.components.find(({ sourceComponentId }) => sourceComponentId === 'group')?.component.childIds,
    ).toEqual(displayed.map(({ component }) => component.id));
  });

  it('rejects conflicting and cyclic source topology parents regardless of component order', async () => {
    const io = await createNodeIo();
    const invalid = async (components: TauCadTopologyPayload['components']) => {
      const source = await io.readBinary(realReplicadGlb);
      source
        .getRoot()
        .getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!
        .setPayload({
          schemaVersion: 1,
          components,
        } as unknown as Parameters<TauCadTopologyRoot['setPayload']>[0]);
      const bytes = await io.writeBinary(source);
      const asset: PublishedPartAsset = { path: 'invalid.glb', digest: digest('4'), byteLength: bytes.length };
      return flattenAdmittedAssemblyGlb({
        parts: { shape: record(asset) },
        occurrences: [{ id: 'first', transform: identity, part: 'shape', variant: 'default' }],
        readAsset: async () => bytes,
      });
    };
    const baseDocument = await io.readBinary(realReplicadGlb);
    const base = baseDocument
      .getRoot()
      .getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!
      .getPayload() as unknown as TauCadTopologyPayload;
    const component = base.components[0]!;
    await expect(
      invalid([
        { ...component, id: 'child', parentId: 'second' },
        { ...component, id: 'first', childIds: ['child'] },
        { ...component, id: 'second' },
      ]),
    ).rejects.toThrow('conflicting parents');
    await expect(
      invalid([
        { ...component, id: 'first', parentId: 'second' },
        { ...component, id: 'second', parentId: 'first' },
      ]),
    ).rejects.toThrow('parent cycle');
  });

  it('rejects source camera state before flattening away its display behavior', async () => {
    const io = await createNodeIo();
    const source = await io.readBinary(realReplicadGlb);
    source.getRoot().listNodes()[0]!.setCamera(source.createCamera());
    const bytes = await io.writeBinary(source);
    const asset: PublishedPartAsset = { path: 'camera.glb', digest: digest('5'), byteLength: bytes.length };
    await expect(
      flattenAdmittedAssemblyGlb({
        parts: { shape: record(asset) },
        occurrences: [{ id: 'first', transform: identity, part: 'shape', variant: 'default' }],
        readAsset: async () => bytes,
      }),
    ).rejects.toThrow('animation, skin, or camera state');
  });

  it('derives volume from added occurrence determinants without recounting Replicad source scaling', async () => {
    const io = await createNodeIo();
    const source = await io.readBinary(realScaledReplicadGlb);
    const sourcePayload = source
      .getRoot()
      .getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!
      .getPayload() as unknown as TauCadTopologyPayload;
    expect(sourcePayload.components[0]!.physical?.volume).toMatchObject({ state: 'measured', valueMm3: 60 });
    const asset: PublishedPartAsset = {
      path: 'scaled.glb',
      digest: digest('6'),
      byteLength: realScaledReplicadGlb.length,
    };
    const flattened = await flattenAdmittedAssemblyGlb({
      parts: { shape: record(asset) },
      occurrences: [
        {
          id: 'group',
          transform: scale(2, 1, 1),
          children: [{ id: 'mirrored', transform: scale(1, 3, -1), part: 'shape', variant: 'default' }],
        },
      ],
      readAsset: async () => realScaledReplicadGlb,
    });
    const output = await io.readBinary(flattened.geometry.content);
    const outputPayload = output
      .getRoot()
      .getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!
      .getPayload() as unknown as TauCadTopologyPayload;
    const derived = outputPayload.components.find((component) => component.physical)?.physical;
    expect(derived?.volume).toEqual({
      state: 'derived',
      sourceValueMm3: 60,
      addedAbsDeterminant: 6,
      valueMm3: 360,
      geometryDigest: `sha256:${'b'.repeat(64)}`,
      method: 'occurrence-determinant-v1',
      validity: 'placed-solid',
    });
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Published physical wire unit spelling.
    expect(derived?.density).toEqual({ valueGPerCm3: 2.7, provenance: 'authored-shape-config' });
    expect(sourcePayload.components[0]!.physical?.volume.state).toBe('measured');

    const republishedAsset: PublishedPartAsset = {
      path: 'assembly.glb',
      digest: digest('7'),
      byteLength: flattened.geometry.content.length,
    };
    const republished = await flattenAdmittedAssemblyGlb({
      parts: { assembly: record(republishedAsset) },
      occurrences: [{ id: 'again', transform: scale(2, 1, 1), part: 'assembly', variant: 'default' }],
      readAsset: async () => flattened.geometry.content,
    });
    const republishedDocument = await io.readBinary(republished.geometry.content);
    const republishedPayload = republishedDocument
      .getRoot()
      .getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!
      .getPayload() as unknown as TauCadTopologyPayload;
    expect(republishedPayload.components.find((component) => component.physical)?.physical?.volume).toMatchObject({
      state: 'derived',
      sourceValueMm3: 60,
      addedAbsDeterminant: 12,
      valueMm3: 720,
    });

    const zero = await flattenAdmittedAssemblyGlb({
      parts: { shape: record(asset) },
      occurrences: [{ id: 'zero', transform: scale(0, 1, 1), part: 'shape', variant: 'default' }],
      readAsset: async () => realScaledReplicadGlb,
    });
    const zeroDocument = await io.readBinary(zero.geometry.content);
    const zeroPayload = zeroDocument
      .getRoot()
      .getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!
      .getPayload() as unknown as TauCadTopologyPayload;
    expect(zeroPayload.components.find((component) => component.physical)?.physical?.volume).toEqual({
      state: 'unavailable',
      reason: 'degenerate-placement',
    });

    const overflow = await flattenAdmittedAssemblyGlb({
      parts: { shape: record(asset) },
      occurrences: [{ id: 'overflow', transform: scale(1e200, 1e200, 1e200), part: 'shape', variant: 'default' }],
      readAsset: async () => realScaledReplicadGlb,
    });
    const overflowDocument = await io.readBinary(overflow.geometry.content);
    const overflowPayload = overflowDocument
      .getRoot()
      .getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!
      .getPayload() as unknown as TauCadTopologyPayload;
    expect(overflowPayload.components.find((component) => component.physical)?.physical?.volume).toEqual({
      state: 'unavailable',
      reason: 'nonfinite-placement',
    });
  });

  it('rejects malformed source physical evidence before zero placement can hide it', async () => {
    const io = await createNodeIo();
    const source = await io.readBinary(realScaledReplicadGlb);
    const extension = source.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!;
    const payload = extension.getPayload() as unknown as TauCadTopologyPayload;
    extension.setPayload({
      ...payload,
      components: payload.components.map((component) => ({
        ...component,
        physical: component.physical && {
          ...component.physical,
          volume: { ...component.physical.volume, valueMm3: 0 },
        },
      })),
    } as unknown as JSONObject);
    const bytes = await io.writeBinary(source);
    const asset: PublishedPartAsset = { path: 'invalid-physical.glb', digest: digest('8'), byteLength: bytes.length };
    await expect(
      flattenAdmittedAssemblyGlb({
        parts: { shape: record(asset) },
        occurrences: [{ id: 'zero', transform: scale(0, 1, 1), part: 'shape', variant: 'default' }],
        readAsset: async () => bytes,
      }),
    ).rejects.toThrow('Source topology is invalid: component:scaledshape has invalid native solid volume evidence');
  });
});

describe('validateAdmittedAssemblyGlb', () => {
  it('should remap independently placed mechanism identities, motion, couplings and animation without changing source', async () => {
    const io = await createNodeIo();
    const source = await io.readBinary(realReplicadGlb);
    const extension = source.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!;
    const payload = extension.getPayload() as unknown as TauCadTopologyPayload;
    const mechanism: Mechanism = {
      schemaVersion: 1,
      units: { length: 'm', angle: 'rad' },
      root: 'base',
      links: { base: { components: [] }, arm: { components: [payload.components[0]!.id] }, tip: { components: [] } },
      joints: {
        hinge: { type: 'revolute', parent: 'base', child: 'arm', origin: [0.002, 0.003, 0], axis: [0, 0, 1] },
        follower: { type: 'revolute', parent: 'arm', child: 'tip', origin: [0.004, 0, 0], axis: [0, 0, 1] },
      },
      couplings: [{ driver: 'hinge', follower: 'follower', ratio: 2, offset: 0.1 }],
      animations: [
        {
          id: 'turn',
          duration: 1,
          keyframes: [
            { time: 0, coordinates: { hinge: 0 } },
            { time: 1, coordinates: { hinge: 0.5 } },
          ],
        },
      ],
    };
    expect(admitMechanism(mechanism).status).toBe('admitted');
    extension.setPayload({ ...payload, mechanism } as unknown as JSONObject);
    const bytes = await io.writeBinary(source);
    const asset: PublishedPartAsset = { path: 'mechanism.glb', digest: digest('d'), byteLength: bytes.length };
    const rotated = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0.1, 0.2, 0, 1] as const;
    const input = {
      parts: { mechanism: record(asset) },
      occurrences: [
        { id: 'left', transform: translate(0.02), part: 'mechanism', variant: 'default' },
        { id: 'right', transform: rotated, part: 'mechanism', variant: 'default' },
      ],
      readAsset: async () => bytes,
    };
    const before = structuredClone({ input: { parts: input.parts, occurrences: input.occurrences }, bytes, mechanism });
    const metadata = await validateAdmittedAssemblyGlb(input);
    const flat = await flattenAdmittedAssemblyGlb(input);
    const projected = await io.readBinary(flat.geometry.content);
    const flattenedPayload = projected
      .getRoot()
      .getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!
      .getPayload() as unknown as TauCadTopologyPayload;
    expect(metadata.mechanism).toEqual(flattenedPayload.mechanism);
    const result = metadata.mechanism!;
    expect(admitMechanism(result).status).toBe('admitted');
    expect(Object.keys(result.links)).toHaveLength(7);
    expect(Object.keys(result.joints)).toHaveLength(6);
    expect(result.animations).toHaveLength(2);
    expect(new Set(result.animations!.map(({ id }) => id)).size).toBe(2);
    for (const occurrence of input.occurrences) {
      const canonical = metadata.components.find(
        ({ ancestry, sourceComponentId }) =>
          ancestry[0] === occurrence.id && sourceComponentId === payload.components[0]!.id,
      )!.component.id;
      const arm = Object.entries(result.links).find(([, mechanismLink]) =>
        mechanismLink.components.includes(canonical),
      )![0];
      const hinge = Object.entries(result.joints).find(([, joint]) => joint.child === arm)![0];
      const oracle = transformMechanism({ mechanism, units: result.units, matrix: occurrence.transform });
      expect(oracle.status).toBe('transformed');
      if (oracle.status !== 'transformed') {
        throw new Error('Expected rigid transform');
      }
      expect(result.joints[hinge]!.origin).toEqual(oracle.mechanism.joints['hinge']!.origin);
      const actualPose = evaluatePose({ mechanism: result, coordinates: { [hinge]: 0.4 } });
      const oraclePose = evaluatePose({ mechanism: oracle.mechanism, coordinates: { hinge: 0.4 } });
      expect(actualPose.status).toBe('posed');
      expect(oraclePose.status).toBe('posed');
      if (actualPose.status !== 'posed' || oraclePose.status !== 'posed') {
        throw new Error('Expected admitted poses');
      }
      expect(actualPose.pose.linkTransforms[arm]).toEqual(oraclePose.pose.linkTransforms['arm']);
      const coupling = result.couplings!.find(({ driver }) => driver === hinge)!;
      expect(coupling).toMatchObject({ ratio: 2, offset: 0.1 });
      const animation = result.animations!.find(({ keyframes }) => hinge in keyframes[0]!.coordinates)!;
      expect(animation.keyframes[1]!.coordinates).toEqual({ [hinge]: 0.5 });
    }
    expect({ input: { parts: input.parts, occurrences: input.occurrences }, bytes, mechanism }).toEqual(before);
  });

  it('should reject nonrigid and mirrored mechanism placement consistently before returning display metadata', async () => {
    const io = await createNodeIo();
    const source = await io.readBinary(realReplicadGlb);
    const extension = source.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!;
    const payload = extension.getPayload() as unknown as TauCadTopologyPayload;
    const mechanism: Mechanism = {
      schemaVersion: 1,
      units: { length: 'm', angle: 'rad' },
      root: 'root',
      links: { root: { components: [payload.components[0]!.id] } },
      joints: {},
    };
    extension.setPayload({ ...payload, mechanism } as unknown as JSONObject);
    const bytes = await io.writeBinary(source);
    const asset: PublishedPartAsset = { path: 'mechanism.glb', digest: digest('e'), byteLength: bytes.length };
    await Promise.all(
      [scale(2, 1, 1), scale(-1, 1, 1), scale(0, 0, 0)].map(async (transform) => {
        const input = {
          parts: { mechanism: record(asset) },
          occurrences: [{ id: 'one', transform, part: 'mechanism', variant: 'default' }],
          readAsset: async () => bytes,
        };
        await Promise.all([
          expect(validateAdmittedAssemblyGlb(input)).rejects.toThrow('not a proper rigid transform'),
          expect(flattenAdmittedAssemblyGlb(input)).rejects.toThrow('not a proper rigid transform'),
        ]);
      }),
    );
  });

  it('should match flattened canonical topology, physical facts, materials and placed bounds across reorder and namespaces', async () => {
    const io = await createNodeIo();
    const sourceBytes = { shape: realScaledReplicadGlb, edged: realReplicadGlb };
    const shapeAsset: PublishedPartAsset = {
      path: 'shape.glb',
      digest: digest('a'),
      byteLength: sourceBytes.shape.length,
    };
    const edgedAsset: PublishedPartAsset = {
      path: 'edged.glb',
      digest: digest('b'),
      byteLength: sourceBytes.edged.length,
    };
    const parts = { shape: record(shapeAsset), edged: record(edgedAsset) };
    const aliasRecord = {
      ...parts.edged,
      variants: { ...parts.edged.variants, alias: parts.edged.variants['default']! },
    };
    const children = [
      { id: 'same/id', transform: scale(-2, 3, 1), part: 'shape', variant: 'default' },
      { id: 'same', transform: translate(0.02), part: 'edged', variant: 'alias' },
      { id: 'zero', transform: scale(0, 0, 0), part: 'shape', variant: 'default' },
    ];
    const input = {
      parts: { ...parts, edged: aliasRecord },
      occurrences: [
        { id: 'group/a', transform: translate(0.1), children },
        {
          id: 'group',
          transform: translate(0.2),
          children: [{ id: 'a/same/id', transform: identity, part: 'shape', variant: 'default' }],
        },
        { id: 'empty', transform: identity, children: [] },
      ],
      readAsset: async (_part: string, asset: PublishedPartAsset) =>
        asset.path === shapeAsset.path ? sourceBytes.shape : sourceBytes.edged,
    };
    const before = structuredClone({ parts: input.parts, occurrences: input.occurrences, sourceBytes });
    const metadata = await validateAdmittedAssemblyGlb(input);
    const projected = await flattenAdmittedAssemblyGlb(input);
    const document = await io.readBinary(projected.geometry.content);
    const payload = document
      .getRoot()
      .getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!
      .getPayload() as unknown as TauCadTopologyPayload;
    expect(metadata.bounds).toEqual(projected.bounds);
    expect(metadata.materials).toEqual(
      projected.materials.map(({ flattenedIndex: _index, ...provenance }) => provenance),
    );
    expect(metadata.materials.every((entry) => !('flattenedIndex' in entry))).toBe(true);
    const semantics = ({
      nodeIndex: _node,
      meshIndex: _mesh,
      primitiveRefs: _references,
      ...component
    }: TauCadTopologyPayload['components'][number]) => component;
    expect(metadata.components.map(({ component }) => semantics(component))).toEqual(payload.components.map(semantics));
    expect(new Set(metadata.components.map(({ component }) => component.id)).size).toBe(metadata.components.length);
    const sourceDocuments = new Map(
      await Promise.all(
        Object.entries(sourceBytes).map(async ([part, bytes]) => [part, await io.readBinary(bytes)] as const),
      ),
    );
    for (const entry of metadata.components) {
      if (!entry.sourceComponentId) {
        continue;
      }
      expect(projected.components[entry.component.id]).toEqual({
        ancestry: entry.ancestry,
        sourceComponentId: entry.sourceComponentId,
      });
      const occurrence = metadata.occurrences.find(
        ({ ancestry }) => JSON.stringify(ancestry) === JSON.stringify(entry.ancestry),
      )!;
      const source = sourceDocuments.get(occurrence.definition!.part)!;
      const flattenedComponent = payload.components.find(({ id }) => id === entry.component.id)!;
      expect(entry.component.primitiveRefs).toHaveLength(flattenedComponent.primitiveRefs!.length);
      for (const [index, ref] of entry.component.primitiveRefs!.entries()) {
        const sourcePrimitive = source.getRoot().listMeshes()[ref.meshIndex]!.listPrimitives()[ref.primitiveIndex]!;
        const flattenedRef = flattenedComponent.primitiveRefs![index]!;
        const flattenedPrimitive = document.getRoot().listMeshes()[flattenedRef.meshIndex]!.listPrimitives()[
          flattenedRef.primitiveIndex
        ]!;
        expect(source.getRoot().listNodes()[ref.nodeIndex]!.getMesh()).toBe(
          source.getRoot().listMeshes()[ref.meshIndex],
        );
        expect(sourcePrimitive.getAttribute('POSITION')!.getArray()).toEqual(
          flattenedPrimitive.getAttribute('POSITION')!.getArray(),
        );
        expect(sourcePrimitive.getMaterial()!.getBaseColorFactor()).toEqual(
          flattenedPrimitive.getMaterial()!.getBaseColorFactor(),
        );
      }
    }
    for (const occurrence of metadata.occurrences) {
      const node = document
        .getRoot()
        .listNodes()
        .find((candidate) => candidate.getExtras()['tauComponentId'] === occurrence.id)!;
      expect(occurrence.worldTransform).toEqual(node.getWorldMatrix());
      if (occurrence.ancestry[0] === 'empty') {
        expect(occurrence.bounds).toBeUndefined();
      }
    }
    expect(metadata.occurrences.find(({ ancestry }) => ancestry.at(-1) === 'zero')!.bounds).toEqual({
      min: [0.1, 0, 0],
      max: [0.1, 0, 0],
    });
    const reordered = await validateAdmittedAssemblyGlb({
      ...input,
      occurrences: [...input.occurrences]
        .reverse()
        .map((occurrence) => ({ ...occurrence, children: [...occurrence.children].reverse() })),
    });
    const canonical = (value: typeof metadata) =>
      value.components
        .map((entry) => ({
          ...entry,
          component: {
            ...entry.component,
            ...(entry.component.childIds ? { childIds: [...entry.component.childIds].sort() } : {}),
          },
        }))
        .sort((left, right) => left.component.id.localeCompare(right.component.id));
    expect(canonical(reordered)).toEqual(canonical(metadata));
    for (const [value, authored] of [
      [metadata, input.occurrences],
      [
        reordered,
        [...input.occurrences]
          .reverse()
          .map((occurrence) => ({ ...occurrence, children: [...occurrence.children].reverse() })),
      ],
    ] as const) {
      const group = value.components.find(
        ({ ancestry, component }) =>
          ancestry.length === 1 && ancestry[0] === 'group/a' && component.kind === 'assembly',
      )!;
      const authoredGroup = authored.find(({ id }) => id === 'group/a')!;
      expect(group.component.childIds).toEqual(
        authoredGroup.children.map(
          (child) =>
            value.occurrences.find(
              ({ ancestry }) => ancestry.length === 2 && ancestry[0] === 'group/a' && ancestry[1] === child.id,
            )!.id,
        ),
      );
    }
    expect({ parts: input.parts, occurrences: input.occurrences, sourceBytes }).toEqual(before);
  });

  it('should validate repeated nested occurrences without allocating projection nodes or output bytes', async () => {
    const bytes = await sourceGlb('body', 0);
    const asset: PublishedPartAsset = { path: 'part.glb', digest: digest('a'), byteLength: bytes.length };
    const readAsset = vi.fn(async () => bytes);
    const createNode = vi.spyOn(Document.prototype, 'createNode');
    const createMesh = vi.spyOn(Document.prototype, 'createMesh');
    const createScene = vi.spyOn(Document.prototype, 'createScene');
    const transform = vi.spyOn(Document.prototype, 'transform');
    const writeBinary = vi.spyOn(NodeIO.prototype, 'writeBinary');
    try {
      const input = {
        parts: { body: record(asset) },
        occurrences: [
          {
            id: 'group',
            transform: translate(10),
            children: Array.from({ length: 1000 }, (_, index) => ({
              id: `body-${index}`,
              transform: translate(index),
              part: 'body',
              variant: 'default',
            })),
          },
        ],
        readAsset,
      };
      const before = structuredClone({ parts: input.parts, occurrences: input.occurrences });
      const metadata = await validateAdmittedAssemblyGlb(input);
      expect(metadata.occurrences).toHaveLength(1001);
      expect(metadata.components).toHaveLength(2001);
      expect(metadata.bounds).toEqual({ min: [10, 0, 0], max: [1010, 1, 0] });
      expect('geometry' in metadata).toBe(false);
      expect(metadata.materials).toEqual([{ sourceDigest: asset.digest, sourceMaterialIndex: 0, variant: 'default' }]);
      expect({ parts: input.parts, occurrences: input.occurrences }).toEqual(before);
      expect(readAsset).toHaveBeenCalledOnce();
      // The only nodes/mesh/scene belong to the one parsed source, independent of occurrence count.
      expect(createNode).toHaveBeenCalledOnce();
      expect(createMesh).toHaveBeenCalledOnce();
      expect(createScene).toHaveBeenCalledOnce();
      expect(transform).not.toHaveBeenCalled();
      expect(writeBinary).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('should preserve admission parity for nested translated, scaled, mirrored and zero-scale sources', async () => {
    const io = await createNodeIo();
    await Promise.all(
      (
        [
          [2, 3, 4],
          [-2, 3, 4],
          [0, 3, 4],
          [0, 0, 0],
        ] as const
      ).map(async (sourceScale) => {
        const source = await io.readBinary(await sourceGlb('body', 0));
        const leaf = source.getRoot().listNodes()[0]!;
        leaf.setTranslation([2, 3, 4]).setScale([...sourceScale]);
        const parent = source.createNode('internal').setTranslation([4, 5, 6]).addChild(leaf);
        source.getRoot().getDefaultScene()!.addChild(parent);
        const bytes = await io.writeBinary(source);
        const asset: PublishedPartAsset = { path: 'nested.glb', digest: digest('a'), byteLength: bytes.length };
        const input = {
          parts: { body: record(asset) },
          occurrences: [
            {
              id: 'group',
              transform: translate(10),
              children: [
                {
                  id: 'body',
                  transform: scale(-2, 3, 4),
                  part: 'body',
                  variant: 'default',
                },
              ],
            },
          ],
          readAsset: async () => bytes,
        };
        await validateAdmittedAssemblyGlb(input);
        const result = await flattenAdmittedAssemblyGlb(input);
        const xEnds = [6, 6 + sourceScale[0]].map((value) => 10 - 2 * value);
        const yEnds = [8, 8 + sourceScale[1]].map((value) => 3 * value);
        expect(result.bounds.min).toEqual([Math.min(...xEnds), Math.min(...yEnds), 40]);
        expect(result.bounds.max).toEqual([Math.max(...xEnds), Math.max(...yEnds), 40]);
      }),
    );
  });

  it('should reject active-scene identities, topology references and cyclic occurrence graphs consistently', async () => {
    const io = await createNodeIo();
    const unplaced = await io.readBinary(realReplicadGlb);
    const outside = unplaced.createScene('inactive');
    const inactiveNode = unplaced.getRoot().listNodes()[0]!;
    // oxlint-disable-next-line unicorn/prefer-dom-node-remove -- glTF-Transform Scene is not a DOM parent and requires removeChild.
    unplaced.getRoot().getDefaultScene()!.removeChild(inactiveNode);
    outside.addChild(inactiveNode);
    const inactiveBytes = await io.writeBinary(unplaced);
    const duplicate = await io.readBinary(await sourceGlb('body', 0));
    const duplicateNode = duplicate
      .createNode('other')
      .setMesh(duplicate.getRoot().listMeshes()[0]!)
      .setExtras({ tauComponentId: 'body' });
    duplicate.getRoot().getDefaultScene()!.addChild(duplicateNode);
    const duplicateBytes = await io.writeBinary(duplicate);
    const badRef = await io.readBinary(realReplicadGlb);
    const extension = badRef.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!;
    const payload = extension.getPayload() as unknown as TauCadTopologyPayload;
    extension.setPayload({
      ...payload,
      components: [{ ...payload.components[0]!, primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 999 }] }],
    } as unknown as JSONObject);
    const badRefBytes = await io.writeBinary(badRef);
    await Promise.all(
      [inactiveBytes, duplicateBytes, badRefBytes].map(async (bytes) => {
        const asset: PublishedPartAsset = { path: 'invalid.glb', digest: digest('b'), byteLength: bytes.length };
        const input = {
          parts: { body: record(asset) },
          occurrences: [{ id: 'body', transform: identity, part: 'body', variant: 'default' }],
          readAsset: async () => bytes,
        };
        const results = await Promise.allSettled([
          validateAdmittedAssemblyGlb(input),
          flattenAdmittedAssemblyGlb(input),
        ]);
        expect(results[0].status).toBe('rejected');
        expect(results[1].status).toBe('rejected');
        if (results[0].status === 'rejected' && results[1].status === 'rejected') {
          expect(results[0].reason).toBeInstanceOf(TypeError);
          expect(results[0].reason.message).toEqual(results[1].reason.message);
        }
      }),
    );
    const children: Array<Parameters<typeof validateAdmittedAssemblyGlb>[0]['occurrences'][number]> = [];
    const cycle = { id: 'cycle', transform: identity, children };
    children.push(cycle);
    const input = { parts: {}, occurrences: [cycle], readAsset: async () => new Uint8Array() };
    await expect(validateAdmittedAssemblyGlb(input)).rejects.toThrow('invalid ID or cycle');
    await expect(flattenAdmittedAssemblyGlb(input)).rejects.toThrow('invalid ID or cycle');
  });

  it('should preserve valid projection and invalid admission parity', async () => {
    const io = await createNodeIo();
    const bytes = await sourceGlb('body', 0);
    const untagged = await io.readBinary(bytes);
    untagged.getRoot().listNodes()[0]!.setExtras({});
    const untaggedBytes = await io.writeBinary(untagged);
    const source = await io.readBinary(realReplicadGlb);
    const extension = source.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)!;
    const payload = extension.getPayload() as unknown as TauCadTopologyPayload;
    extension.setPayload({
      ...payload,
      components: [{ ...payload.components[0]!, nodeIndex: 999 }],
    } as unknown as JSONObject);
    const invalidTopology = await io.writeBinary(source);
    const asset: PublishedPartAsset = { path: 'part.glb', digest: digest('a'), byteLength: bytes.length };
    const occurrences = [{ id: 'body', transform: translate(5), part: 'body', variant: 'default' }];
    const valid = { parts: { body: record(asset) }, occurrences, readAsset: async () => bytes };
    await validateAdmittedAssemblyGlb(valid);
    const projected = await flattenAdmittedAssemblyGlb(valid);
    expect(projected.bounds).toEqual({ min: [5, 0, 0], max: [6, 1, 0] });
    const cases = [
      { ...valid, readAsset: async () => withUnsupportedMaterialExtension(bytes) },
      { ...valid, readAsset: async () => untaggedBytes },
      { ...valid, readAsset: async () => invalidTopology },
      { ...valid, occurrences: [{ ...occurrences[0]!, variant: 'missing' }] },
      { ...valid, occurrences: [...occurrences, ...occurrences] },
      { ...valid, occurrences: [{ ...occurrences[0]!, transform: [Number.NaN] }] },
      { ...valid, occurrences: [] },
    ];
    await Promise.all(
      cases.map(async (input) => {
        const errors = await Promise.all(
          [validateAdmittedAssemblyGlb(input), flattenAdmittedAssemblyGlb(input)].map(async (promise) => {
            try {
              await promise;
              expect.fail('Invalid input must fail admission and projection.');
            } catch (error) {
              if (!(error instanceof Error)) {
                throw error;
              }
              return { name: error.name, message: error.message };
            }
          }),
        );
        expect(errors[0]).toEqual(errors[1]);
        expect(['TypeError', 'RangeError']).toContain(errors[0]!.name);
      }),
    );
  });
});
