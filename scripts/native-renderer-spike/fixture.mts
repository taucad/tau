// Deterministic synthetic CAD-like block assembly. Geometry is identical in every backend.
export const makeFixture = (side = 16) => {
  if (!Number.isInteger(side) || side < 1 || side > 32) throw new Error('side must be 1..32');
  const positions = [];
  const faces = [
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    [
      [-1, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
    ],
    [
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 0],
    ],
    [
      [0, -1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ],
    [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
    ],
    [
      [0, 0, -1],
      [0, 1, 0],
      [1, 0, 0],
    ],
  ];
  for (let x = 0; x < side; x++)
    for (let y = 0; y < side; y++) {
      const center = [
        ((x - (side - 1) / 2) * 12) / side,
        ((y - (side - 1) / 2) * 12) / side,
        Math.sin(x * 0.7) * Math.cos(y * 0.5),
      ];
      for (const [n, u, v] of faces)
        for (const [a, b] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          for (let k = 0; k < 3; k++) positions.push(center[k] + ((n[k] + a * u[k] + b * v[k]) * 4.5) / side);
        }
    }
  const binary = Buffer.from(new Float32Array(positions).buffer);
  const doc = {
    asset: { version: '2.0', generator: 'Tau native renderer spike' },
    extensionsUsed: ['KHR_materials_unlit'],
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ mesh: 0 }],
    // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF defines the POSITION semantic.
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Khronos extension identifier.
      { extensions: { KHR_materials_unlit: {} }, pbrMetallicRoughness: { baseColorFactor: [0.12, 0.55, 0.8, 1] } },
    ],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteLength: binary.length }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: 'VEC3',
        min: [-7, -7, -2],
        max: [7, 7, 2],
      },
    ],
  };
  let json = Buffer.from(JSON.stringify(doc));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + binary.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const chunk = Buffer.alloc(8);
  chunk.writeUInt32LE(binary.length, 0);
  chunk.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, chunk, binary]);
};
