#!/usr/bin/env node
/**
 * Pack a captured neutral-room PMREM for nanoraster without adding dependencies.
 * Usage: pnpm nx run ui:render-calibration-lighting -- --capture <JSON> --output <directory>
 * Inputs: "Save lighting assets" JSON from the calibration page, installed Three r184.
 * Outputs: studio.png (packed half floats), dfg.bin, provenance.json. No env vars.
 * Exit codes: 0 success; 1 invalid capture, changed upstream source or failed encoding.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '../../../..');
const requireUi = createRequire(resolve(root, 'apps/ui/package.json'));
const requireDecoder = createRequire(resolve(root, 'libs/tau-examples/package.json'));
const threeRoot = resolve(dirname(requireUi.resolve('three')), '..');
const sha = (bytes: Uint8Array<ArrayBuffer> | string): string => createHash('sha256').update(bytes).digest('hex');
const sources = {
  'src/renderers/shaders/DFGLUTData.js': '4a6e5e13121a71227524272d63e38adc9f6b3ecad9265f7bb001a0cd8b8990c4',
  'src/renderers/shaders/ShaderChunk/lights_physical_pars_fragment.glsl.js':
    '93c6fbb624f9adbc0ac6ea0b01180a980ed11eeed7686bcade07b631270e8a9b',
  'src/renderers/shaders/ShaderChunk/cube_uv_reflection_fragment.glsl.js':
    '8610f2598b998c8443c89c24f712ca8c36197f5d7152811c7176f9e0e255553c',
  'src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js':
    '447958b93d07616c83d9273829ed810eb734d02ebbe60f12fc9bdda4f7928f44',
  'src/renderers/shaders/ShaderChunk/transmission_pars_fragment.glsl.js':
    '586f774384f3442bdca1270d203b19f4cc318fd56ee522cdecc4a8b1cb9fc8fc',
  'examples/jsm/environments/RoomEnvironment.js': '55f466192cc84298755a424c5e040345006b2ee1455589b3b54126c2ea4123f4',
};

type Capture = {
  width: number;
  height: number;
  format: string;
  compression: string;
  data: string;
  threeRevision: string;
};
type Encoder = (
  pixels: Uint8Array<ArrayBuffer>,
  options: { raw: { width: number; height: number; channels: 4 } },
) => {
  png(options: { compressionLevel: number }): { toBuffer(): Promise<Uint8Array<ArrayBuffer>> };
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({ options: { capture: { type: 'string' }, output: { type: 'string' } } });
  assert.ok(values.capture && values.output, '--capture and --output are required');
  await Promise.all(
    Object.entries(sources).map(async ([file, expected]) => {
      assert.equal(
        sha(new Uint8Array(await readFile(resolve(threeRoot, file)))),
        expected,
        `Review upstream shader changes: ${file}`,
      );
    }),
  );
  const input = JSON.parse(await readFile(resolve(values.capture), 'utf8')) as {
    environmentCapture: Capture;
    lighting: { environment: string };
  };
  assert.equal(input.lighting.environment, 'room', 'Capture the neutral room, not another environment');
  const capture = input.environmentCapture;
  assert.equal(capture.threeRevision, '184');
  assert.equal(capture.width, 1536);
  assert.equal(capture.height, 2048);
  assert.equal(capture.format, 'r16float-le');
  assert.equal(capture.compression, 'gzip');
  const original = gunzipSync(Buffer.from(capture.data, 'base64'), { maxOutputLength: 1536 * 2048 * 2 });
  assert.equal(original.length, 1536 * 2048 * 2);
  const packed = Buffer.alloc(768 * 1024 * 2);
  for (let mip = -2; mip <= 8; mip++) {
    const face = 2 ** Math.max(4, mip);
    const x = Math.max(4 - mip, 0) * 48;
    for (let row = 0; row < 2 * face; row++) {
      const from = ((4 * (512 - face) + row) * 1536 + x) * 2;
      const to = ((4 * (256 - face) + row) * 768 + x) * 2;
      original.copy(packed, to, from, from + 3 * face * 2);
    }
  }
  for (let offset = 0; offset < packed.length; offset += 2) {
    const bits = packed.readUInt16LE(offset);
    assert.ok(bits < 0x7c_00, 'Room radiance must be finite and nonnegative');
    packed.writeUInt16LE(Math.round(bits / 8) * 8, offset);
  }
  const encoder: unknown = requireDecoder('sharp');
  assert.equal(typeof encoder, 'function');
  const png = await (encoder as Encoder)(new Uint8Array(packed), { raw: { width: 384, height: 1024, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  // Read only the fingerprinted upstream constants, preserving little-endian bytes.
  const lutSource = await readFile(resolve(threeRoot, 'src/renderers/shaders/DFGLUTData.js'), 'utf8');
  const constants = /const DATA = new Uint16Array\( \[([\s\S]*?)\]/u.exec(lutSource)?.[1];
  assert.ok(constants);
  const values16 = constants.match(/0x[0-9a-f]+/gu);
  assert.ok(values16 && values16.length >= 512);
  const dfg = Buffer.alloc(1024);
  for (let index = 0; index < 512; index++) {
    dfg.writeUInt16LE(Number(values16[index]), index * 2);
  }
  const output = resolve(values.output);
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'studio.png'), png);
  await writeFile(resolve(output, 'dfg.bin'), dfg);
  await writeFile(
    resolve(output, 'provenance.json'),
    `${JSON.stringify(
      {
        threeRevision: '184',
        pmrem: {
          size: 256,
          format: 'r16float little-endian packed as RGBA8 PNG',
          captureSize: 512,
          droppedMantissaBits: 3,
        },
        dfg: { width: 16, height: 16, format: 'rg16float little-endian' },
        sources,
        captureSha256: sha(new Uint8Array(original)),
        assets: { 'studio.png': sha(png), 'dfg.bin': sha(new Uint8Array(dfg)) },
        generator: 'Tau apps/ui/scripts/render-calibration/pack-lighting.mts',
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Packed ${png.length} room bytes and ${dfg.length} DFG bytes into ${output}`);
};
try {
  await main();
} catch (error) {
  console.error('Lighting pack failed:', error);
  process.exit(1);
}
