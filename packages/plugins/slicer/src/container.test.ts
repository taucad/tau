import { createHash } from 'node:crypto';

import type { MachineArtifactReference } from '@taucad/runtime/machine';
import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { bambuContainerMembers, bambuPlateMember, readBambuContainer, writeBambuContainer } from '#container.js';
// The Bambu provider keeps its preflight private; this white-box import proves the container it admits.
/* oxlint-disable no-restricted-imports -- cross-package white-box acceptance check against @taucad/bambu's private preflight */
// eslint-disable-next-line @nx/enforce-module-boundaries -- same white-box check; @taucad/bambu exports no preflight subpath
import { prepareBambuArtifact } from '../../bambu/src/bambu.archive.js';
/* oxlint-enable no-restricted-imports -- white-box import ends */

const encoder = new TextEncoder();
const gcode = 'G28\nG90\nM83\nG1 X10 Y10 F3000\n';
const digest = (bytes: Uint8Array<ArrayBuffer>): MachineArtifactReference['digest'] =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}` as MachineArtifactReference['digest'];

describe('writeBambuContainer', () => {
  it('should write the censused member set in a fixed order with the plate MD5', () => {
    const bytes = writeBambuContainer({ gcode, modelName: 'cube', plate: 'textured-pei' });
    const members = unzipSync(bytes);
    expect(Object.keys(members)).toEqual([...bambuContainerMembers]);
    expect(new TextDecoder().decode(members[bambuPlateMember])).toBe(gcode);
    expect(new TextDecoder().decode(members['Metadata/plate_1.gcode.md5'])).toBe(
      createHash('md5').update(gcode).digest('hex'),
    );
    expect(new TextDecoder().decode(members['[Content_Types].xml'])).toContain(
      'Extension="gcode" ContentType="text/x.gcode"',
    );
    expect(new TextDecoder().decode(members['3D/3dmodel.model'])).toContain('<metadata name="Title">cube</metadata>');
    expect(JSON.parse(new TextDecoder().decode(members['Metadata/plate_1.json']))).toEqual({
      version: 2,
      name: 'cube',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu plate_1.json field names are fixed.
      bed_type: 'textured-pei',
    });
  });

  it('should be byte-deterministic and escape the model name', () => {
    const first = writeBambuContainer({ gcode, modelName: 'a<b>&"c"' });
    const second = writeBambuContainer({ gcode, modelName: 'a<b>&"c"' });
    expect(digest(first)).toBe(digest(second));
    expect(new TextDecoder().decode(unzipSync(first)['Metadata/slice_info.config'])).toContain(
      'name="a&lt;b&gt;&amp;&quot;c&quot;"',
    );
  });

  it('should add the thumbnail relationship only when a thumbnail is given', () => {
    const thumbnail = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const members = unzipSync(writeBambuContainer({ gcode, modelName: 'cube', thumbnail }));
    expect(Object.keys(members)).toEqual([...bambuContainerMembers, 'Metadata/plate_1.png']);
    expect(new TextDecoder().decode(members['_rels/.rels'])).toContain('metadata/thumbnail');
    expect(members['Metadata/plate_1.png']).toEqual(thumbnail);
  });

  it('should refuse an empty plate', () => {
    expect(() => writeBambuContainer({ gcode: '', modelName: 'cube' })).toThrow('SLICER_CONTAINER_PLATE_EMPTY');
  });

  it('should pass the Bambu provider preflight for an immutable artifact', async () => {
    const bytes = writeBambuContainer({ gcode, modelName: 'cube' });
    const prepared = await prepareBambuArtifact({
      artifact: {
        revision: {
          authorityId: 'authority',
          workspaceId: 'workspace',
          revisionId: 'revision' as MachineArtifactReference['revision']['revisionId'],
          treeDigest: digest(encoder.encode('tree')),
        },
        path: 'cube.gcode.3mf',
        digest: digest(bytes),
        length: bytes.byteLength,
        mediaType: 'application/vnd.bambulab.gcode-3mf',
        contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
        selectedMember: bambuPlateMember,
      },
      runtime: {
        async *readArtifact() {
          yield Uint8Array.from(bytes);
        },
      },
      signal: new AbortController().signal,
    });
    expect(prepared).toMatchObject({
      digest: digest(bytes),
      length: bytes.byteLength,
      memberMd5: createHash('md5').update(gcode).digest('hex'),
      parser: { id: 'tau.bambu.gcode-3mf', version: '1' },
    });
  });
});

describe('readBambuContainer', () => {
  it('should return the plate, verify its MD5 and digest every member', () => {
    const bytes = writeBambuContainer({ gcode, modelName: 'cube' });
    const container = readBambuContainer(bytes);
    expect(new TextDecoder().decode(container.gcode)).toBe(gcode);
    expect(container.md5Verified).toBe(true);
    expect(container.recordedMd5).toBe(createHash('md5').update(gcode).digest('hex'));
    expect(container.members.map((member) => member.name)).toEqual([...bambuContainerMembers]);
    const plate = container.members.find((member) => member.name === bambuPlateMember)!;
    expect(plate).toEqual({ name: bambuPlateMember, length: gcode.length, digest: digest(encoder.encode(gcode)) });
  });

  it('should report an unverified MD5 when the recorded value disagrees', () => {
    const bytes = zipSync({
      [bambuPlateMember]: encoder.encode(gcode),
      'Metadata/plate_1.gcode.md5': encoder.encode('0'.repeat(32)),
    });
    const container = readBambuContainer(Uint8Array.from(bytes));
    expect(container.md5Verified).toBe(false);
    expect(container.recordedMd5).toBe('0'.repeat(32));
  });

  it.each([
    ['a missing plate', zipSync({ 'Metadata/other.gcode': encoder.encode(gcode) }), 'SLICER_CONTAINER_PLATE_MISSING'],
    ['an empty plate', zipSync({ [bambuPlateMember]: new Uint8Array() }), 'SLICER_CONTAINER_PLATE_INVALID'],
    ['path traversal', zipSync({ '../plate_1.gcode': encoder.encode(gcode) }), 'SLICER_CONTAINER_MEMBER_INVALID'],
    [
      'case-colliding members',
      zipSync({ [bambuPlateMember]: encoder.encode(gcode), 'metadata/PLATE_1.GCODE': encoder.encode(gcode) }),
      'SLICER_CONTAINER_LIMIT',
    ],
    ['non-zip bytes', encoder.encode('not a zip'), 'SLICER_CONTAINER_INVALID'],
    ['no bytes', new Uint8Array(), 'SLICER_CONTAINER_LIMIT'],
  ])('should refuse %s', (_name, bytes, code) => {
    expect(() => readBambuContainer(Uint8Array.from(bytes))).toThrow(code);
  });
});
