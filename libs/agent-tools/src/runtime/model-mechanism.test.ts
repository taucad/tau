import { describe, expect, it } from 'vitest';
import { tauCadTopologyExtension } from '@taucad/runtime/types';
import type { KernelIssue } from '@taucad/runtime/types';

import { readGlbMechanism, reportModelMechanism } from '#runtime/model-mechanism.js';

const pad = (bytes: Uint8Array<ArrayBuffer>, fill: number): Uint8Array<ArrayBuffer> => {
  const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4).fill(fill);
  padded.set(bytes);
  return padded;
};

/** A GLB whose BIN chunk holds `payload` as the `TAU_cad_topology` bufferView, after `lead` other bytes. */
const glbWithTopology = (payload: unknown, lead = 8): Uint8Array<ArrayBuffer> => {
  const payloadBytes = new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload));
  const bin = pad(new Uint8Array([...new Uint8Array(lead), ...payloadBytes]), 0);
  const json = pad(
    new TextEncoder().encode(
      JSON.stringify({
        asset: { version: '2.0' },
        extensionsUsed: [tauCadTopologyExtension],
        extensions: { [tauCadTopologyExtension]: { topologyBufferView: 1 } },
        buffers: [{ byteLength: bin.byteLength }],
        bufferViews: [
          { buffer: 0, byteOffset: 0, byteLength: lead },
          { buffer: 0, byteOffset: lead, byteLength: payloadBytes.byteLength },
        ],
      }),
    ),
    0x20,
  );
  const bytes = new Uint8Array(12 + 8 + json.byteLength + 8 + bin.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46_54_6c_67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, json.byteLength, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  bytes.set(json, 20);
  view.setUint32(20 + json.byteLength, bin.byteLength, true);
  view.setUint32(24 + json.byteLength, 0x00_4e_49_42, true);
  bytes.set(bin, 28 + json.byteLength);
  return bytes;
};

/** A GLB with a JSON chunk only and no topology extension. */
const plainGlb = (): Uint8Array<ArrayBuffer> => {
  const json = pad(new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' } })), 0x20);
  const bytes = new Uint8Array(20 + json.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46_54_6c_67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, json.byteLength, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  bytes.set(json, 20);
  return bytes;
};

const planetaryMechanism = {
  schemaVersion: 1,
  units: { length: 'm', angle: 'rad' },
  root: 'frame',
  links: { frame: {}, sun: {}, carrier: {}, planetA: {}, planetB: {}, planetC: {} },
  joints: { sun: {}, carrier: {}, planetA: {}, planetB: {}, planetC: {} },
  couplings: [{}, {}, {}, {}],
  animations: [{ id: 'four-sun-turns', duration: 8, keyframes: [] }],
};

const glbArtifact = (content: Uint8Array<ArrayBuffer>) => ({ mimeType: 'model/gltf-binary', content });

/** The kernel warning `toMechanismKernelIssue` writes for a mechanism diagnostic. */
const mechanismIssue = (code: string, path: string, message: string): KernelIssue => ({
  code: 'INVALID_REFERENCE',
  severity: 'warning',
  type: 'kernel',
  message: `Mechanism ${path}: ${message} Fix it.`,
  details: { producer: { kernelId: 'replicad' }, mechanism: { code, path, message, recovery: 'Fix it.' } },
});

describe('readGlbMechanism', () => {
  it('should count the links, joints and couplings and list the animations the topology payload carries', () => {
    expect(
      readGlbMechanism(glbWithTopology({ schemaVersion: 1, components: [], mechanism: planetaryMechanism })),
    ).toEqual({
      topology: true,
      mechanism: { links: 6, joints: 5, couplings: 4, animations: ['four-sun-turns'] },
    });
  });

  it('should report topology without a mechanism when the payload has none', () => {
    expect(readGlbMechanism(glbWithTopology({ schemaVersion: 1, components: [] }))).toEqual({ topology: true });
  });

  it('should report no topology for a GLB without the extension or with a payload that does not parse', () => {
    expect(readGlbMechanism(plainGlb())).toEqual({ topology: false });
    expect(readGlbMechanism(glbWithTopology('{"mechanism":'))).toEqual({ topology: false });
  });

  it('should return undefined for bytes that are not a GLB', () => {
    expect(readGlbMechanism(new TextEncoder().encode('<svg/>'.padEnd(24)))).toBeUndefined();
  });
});

describe('reportModelMechanism', () => {
  it('should report an admitted mechanism the default view delivered', () => {
    expect(
      reportModelMechanism({
        artifact: glbArtifact(glbWithTopology({ schemaVersion: 1, components: [], mechanism: planetaryMechanism })),
        issues: [],
      }),
    ).toEqual({
      declared: true,
      admitted: true,
      links: 6,
      joints: 5,
      couplings: 4,
      animations: ['four-sun-turns'],
    });
  });

  it('should report no declared mechanism for a topology view without one', () => {
    expect(
      reportModelMechanism({
        artifact: glbArtifact(glbWithTopology({ schemaVersion: 1, components: [] })),
        issues: [],
      }),
    ).toEqual({ declared: false, admitted: false, links: 0, joints: 0, couplings: 0, animations: [] });
  });

  it('should report a declared mechanism the writer dropped, with each diagnostic path once', () => {
    const issues = [
      { code: 'DISPLAY_SIMPLIFIED', severity: 'info', type: 'kernel', message: 'Unrelated.' } satisfies KernelIssue,
      mechanismIssue('UNKNOWN_JOINT', '/couplings/0/joint', 'Coupling names unknown joint "ring".'),
      mechanismIssue('UNKNOWN_JOINT', '/couplings/0/joint', 'Coupling names unknown joint "ring".'),
    ];

    expect(
      reportModelMechanism({ artifact: glbArtifact(glbWithTopology({ schemaVersion: 1, components: [] })), issues }),
    ).toEqual({
      declared: true,
      admitted: false,
      links: 0,
      joints: 0,
      couplings: 0,
      animations: [],
      issues: [{ code: 'UNKNOWN_JOINT', path: '/couplings/0/joint' }],
    });
  });

  it('should report a mechanism diagnostic even when the view did not render', () => {
    expect(
      reportModelMechanism({
        artifact: undefined,
        issues: [mechanismIssue('INVALID_VALUE', '', 'mechanism() threw "boom".')],
      }),
    ).toMatchObject({ declared: true, admitted: false, issues: [{ code: 'INVALID_VALUE', path: '' }] });
  });

  it('should report nothing for a view without topology and no mechanism diagnostic', () => {
    expect(reportModelMechanism({ artifact: glbArtifact(plainGlb()), issues: [] })).toBeUndefined();
    expect(
      reportModelMechanism({ artifact: { mimeType: 'image/svg+xml', content: '<svg/>' }, issues: [] }),
    ).toBeUndefined();
  });
});
