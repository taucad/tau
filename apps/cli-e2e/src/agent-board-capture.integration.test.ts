import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { createHostToolRegistry } from '@taucad/host/agent-tools';
import { createNodeClient } from '@taucad/runtime/node';
import { defineRuntime } from '@taucad/runtime/worker';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';

const board = `export default function Board() {
  return <board width='30mm' height='20mm'>
    <schematicsheet name='Power'><resistor name='R1' resistance='1k' footprint='0402' /></schematicsheet>
    <schematicsheet name='Signals'><led name='LED1' footprint='0603' /></schematicsheet>
  </board>;
}`;

const capturedImage = z.object({
  view: z.string(),
  instance: z.string().optional(),
  angle: z.string().optional(),
  dataUrl: z.string().startsWith('data:image/png;base64,'),
});
const captured = z.object({
  success: z.literal(true),
  images: z.array(capturedImage).min(1),
  sourceRevision: z.object({ entry: z.literal('main.tsx'), files: z.record(z.string(), z.string()) }),
});
const exported = z.object({
  success: z.literal(true),
  sourceRevision: captured.shape.sourceRevision,
  files: z.array(z.object({ artifactPath: z.string() })).min(1),
});
const readText = z.object({ success: z.literal(true), content: z.string() });

const expectNonblankPng = (dataUrl: string): void => {
  const encoded = dataUrl.split(',')[1];
  if (!encoded) {
    throw new Error('Expected a base64-encoded PNG data URL.');
  }
  const png = Buffer.from(encoded, 'base64');
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect(width * height).toBeGreaterThan(1);
  expect(png[24]).toBe(8);
  expect(png[25]).toBe(6); // RGBA8; fail if the producer changes format rather than misread pixels.
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  for (let offset = 8; offset + 12 <= png.byteLength; ) {
    const size = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      chunks.push(png.subarray(offset + 8, offset + 8 + size));
    }
    offset += size + 12;
  }
  expect(chunks.length).toBeGreaterThan(0);
  const rows = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  expect(rows.length).toBe(height * (stride + 1));
  let previous = Buffer.alloc(stride);
  const colors = new Set<string>();
  for (let y = 0; y < height; y++) {
    const filter = rows[y * (stride + 1)];
    const row = Buffer.from(rows.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const left = x < 4 ? 0 : row[x - 4]!;
      const up = previous[x]!;
      const upperLeft = x < 4 ? 0 : previous[x - 4]!;
      const prediction = left + up - upperLeft;
      const leftDistance = Math.abs(prediction - left);
      const upDistance = Math.abs(prediction - up);
      const upperLeftDistance = Math.abs(prediction - upperLeft);
      const paeth =
        leftDistance <= upDistance && leftDistance <= upperLeftDistance
          ? left
          : upDistance <= upperLeftDistance
            ? up
            : upperLeft;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? Math.floor((left + up) / 2)
                : filter === 4
                  ? paeth
                  : undefined;
      if (predictor === undefined) {
        throw new Error(`Unsupported PNG filter ${filter}`);
      }
      row[x] = (row[x]! + predictor) % 256;
    }
    for (let x = 0; x < stride; x += 4) {
      colors.add(row.subarray(x, x + 4).toString('hex'));
      if (colors.size > 1) {
        return;
      }
    }
    previous = row;
  }
  expect(colors.size).toBeGreaterThan(1);
};

it('captures named schematic and PCB SVG views as one PNG each, then reads the pinned BOM', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-agent-board-capture-'));
  await writeFile(join(workspaceRoot, 'main.tsx'), board);
  const [{ tscircuit }, { esbuild }, { image }] = await Promise.all([
    import('@taucad/tscircuit'),
    import('@taucad/esbuild'),
    import('@taucad/image'),
  ]);
  const runtime: AnyRuntimeDefinition = defineRuntime({ plugins: [tscircuit(), esbuild(), image()] });
  const client = await createNodeClient({ runtime, projectPath: workspaceRoot });
  const registry = createHostToolRegistry({ workspaceRoot, runtimeClient: async () => client });
  const invoke = async (toolName: string, input: Parameters<typeof registry.invoke>[0]['input']) =>
    registry.invoke({ toolCallId: `capture-${toolName}`, toolName, input, signal: new AbortController().signal });

  try {
    const schematicResult = await invoke('screenshot', {
      targetFile: 'main.tsx',
      mode: 'single',
      view: 'schematic',
      instance: 'sheet:Power',
    });
    const pcbResult = await invoke('screenshot', { targetFile: 'main.tsx', mode: 'multi_angle', view: 'pcb' });
    if (schematicResult.isError) {
      throw new TypeError(JSON.stringify(schematicResult.content));
    }
    expect(schematicResult).toMatchObject({ isError: false, content: { success: true } });
    expect(pcbResult).toMatchObject({ isError: false, content: { success: true } });
    const schematic = captured.parse(schematicResult.content);
    const pcb = captured.parse(pcbResult.content);
    expect(schematic.sourceRevision.files['main.tsx']).toBe(
      `sha256:${createHash('sha256').update(board).digest('hex')}`,
    );
    expect(schematic.images).toHaveLength(1);
    expect(pcb.images).toHaveLength(1);
    const [schematicImage] = schematic.images;
    const [pcbImage] = pcb.images;
    if (!schematicImage || !pcbImage) {
      throw new TypeError('Expected one image for each declared SVG view.');
    }
    expect(schematicImage).toMatchObject({ view: 'schematic', instance: 'sheet:Power' });
    expect(pcbImage).toMatchObject({ view: 'pcb' });
    expect(schematicImage.angle).toBeUndefined();
    expect(pcbImage.angle).toBeUndefined();
    expectNonblankPng(schematicImage.dataUrl);
    expectNonblankPng(pcbImage.dataUrl);
    expect(pcb.sourceRevision).toEqual(schematic.sourceRevision);

    const bomResult = await invoke('export_model', { targetFile: 'main.tsx', to: 'bom' });
    const bom = exported.parse(bomResult.content);
    expect(bom.sourceRevision).toEqual(schematic.sourceRevision);
    const [file] = bom.files;
    if (!file) {
      throw new Error('Expected the real BOM primary file.');
    }
    const textResult = await invoke('read_file', { targetFile: file.artifactPath });
    const text = readText.parse(textResult.content).content;
    expect(text).toContain('"R1","1k","1k","res0402"');
    expect(text).toContain('"LED1","","","0603"');
  } finally {
    try {
      await client.shutdown();
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  }
}, 120_000);
