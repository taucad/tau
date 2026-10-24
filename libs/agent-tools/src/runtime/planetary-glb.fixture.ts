/**
 * A two-joint planetary GLB for pose tests: a sun turning about +Z and a carrier coupled at a quarter of its angle,
 * with four sun turns over eight seconds, and the carrier's node under a group one metre along +X.
 */
import { tauCadTopologyExtension } from '@taucad/runtime/types';

const pad = (bytes: Uint8Array<ArrayBuffer>, fill: number): Uint8Array<ArrayBuffer> => {
  const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4).fill(fill);
  padded.set(bytes);
  return padded;
};

/** A GLB whose BIN chunk holds only the `TAU_cad_topology` payload, with the given nodes and scene. */
export const glbOf = (payload: unknown, json: Readonly<Record<string, unknown>>): Uint8Array<ArrayBuffer> => {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const bin = pad(payloadBytes, 0);
  const text = pad(
    new TextEncoder().encode(
      JSON.stringify({
        asset: { version: '2.0' },
        extensionsUsed: [tauCadTopologyExtension],
        extensions: { [tauCadTopologyExtension]: { topologyBufferView: 0 } },
        buffers: [{ byteLength: bin.byteLength }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: payloadBytes.byteLength }],
        ...json,
      }),
    ),
    0x20,
  );
  const bytes = new Uint8Array(28 + text.byteLength + bin.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46_54_6c_67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, text.byteLength, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  bytes.set(text, 20);
  view.setUint32(20 + text.byteLength, bin.byteLength, true);
  view.setUint32(24 + text.byteLength, 0x00_4e_49_42, true);
  bytes.set(bin, 28 + text.byteLength);
  return bytes;
};

const mechanism = {
  schemaVersion: 1,
  units: { length: 'm', angle: 'deg' },
  root: 'frame',
  links: {
    frame: { components: ['component:Frame'] },
    sun: { components: ['component:Sun'] },
    carrier: { components: ['component:Carrier'] },
  },
  joints: {
    sun: { type: 'revolute', parent: 'frame', child: 'sun', origin: [0, 0, 0], axis: [0, 0, 1] },
    carrier: { type: 'revolute', parent: 'frame', child: 'carrier', origin: [0, 0, 0], axis: [0, 0, 1] },
  },
  couplings: [{ driver: 'sun', follower: 'carrier', ratio: 0.25 }],
  animations: [
    {
      id: 'four-sun-turns',
      duration: 8,
      keyframes: [
        { time: 0, coordinates: { sun: 0 } },
        { time: 8, coordinates: { sun: 1440 } },
      ],
    },
  ],
};

const components = [
  { id: 'component:Frame', name: 'Frame', kind: 'solid', selector: 'Frame', nodeIndex: 0 },
  { id: 'component:Sun', name: 'Sun', kind: 'solid', selector: 'Sun', nodeIndex: 1 },
  { id: 'component:Carrier', name: 'Carrier', kind: 'solid', selector: 'Carrier', nodeIndex: 3 },
];

/** Node 2 groups the carrier (node 3) one metre along +X; node 1 is the sun under the scene root. */
export const planetaryGlb = (): Uint8Array<ArrayBuffer> =>
  glbOf(
    { schemaVersion: 1, components, mechanism },
    {
      scene: 0,
      scenes: [{ nodes: [0, 1, 2] }],
      nodes: [
        { name: 'Frame' },
        { name: 'Sun' },
        { name: 'Group', translation: [1, 0, 0], children: [3] },
        { name: 'Carrier' },
      ],
    },
  );
