import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { createHostToolRegistry } from '@taucad/host/agent-tools';
import { createNodeClient } from '@taucad/runtime/node';
import { defineRuntime } from '@taucad/runtime/worker';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';

const board = `export default function Board() {
  return <board width='30mm' height='20mm'>
    <resistor name='R1' resistance='1k' footprint='0402' pcbX={-8} pcbY={4} />
    <resistor name='R2' resistance='10k' footprint='0402' pcbX={-8} pcbY={-4} />
    <led name='LED1' footprint='0603' pcbX={0} pcbY={6} />
    <chip name='U1' footprint='soic8' pcbX={6} pcbY={0} pinAttributes={{ pin8: { requiresPower: true }, pin4: { requiresGround: true } }} />
    <net name='VCC' /><net name='GND' />
    <trace name='R1_VCC' from='.R1 > .pin1' to='net.VCC' />
    <trace name='U1_VCC' from='.U1 > .pin8' to='net.VCC' />
    <trace name='R2_GND' from='.R2 > .pin2' to='net.GND' />
    <trace name='U1_GND' from='.U1 > .pin4' to='net.GND' />
    <trace name='R1_LED1' from='.R1 > .pin2' to='.LED1 > .anode' />
    <trace name='LED1_U1' from='.LED1 > .cathode' to='.U1 > .pin1' />
  </board>;
}`;

const revision = z.object({ entry: z.literal('main.tsx'), files: z.record(z.string(), z.string()) });
const evaluation = z.object({
  success: z.literal(true),
  status: z.literal('ready'),
  sourceRevision: revision,
  kernelIssues: z.array(z.object({ message: z.string(), severity: z.string() })),
  views: z.array(z.string()),
  exports: z.record(z.string(), z.string()),
});
const exported = z.object({
  success: z.literal(true),
  exportId: z.string(),
  sourceRevision: revision,
  files: z.array(z.object({ name: z.string(), artifactPath: z.string(), mimeType: z.string() })).min(1),
});
const readText = z.object({ success: z.literal(true), content: z.string() });

it('serves real board issues and pinned BOM/netlist through the current host tools', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-agent-board-'));
  await writeFile(join(workspaceRoot, 'main.tsx'), board);
  const [{ tscircuit }, { esbuild }] = await Promise.all([import('@taucad/tscircuit'), import('@taucad/esbuild')]);
  const runtime: AnyRuntimeDefinition = defineRuntime({ plugins: [tscircuit(), esbuild()] });
  const client = await createNodeClient({ runtime, projectPath: workspaceRoot });
  const registry = createHostToolRegistry({ workspaceRoot, runtimeClient: async () => client });
  const invoke = async (toolName: string, input: Record<string, string>) =>
    registry.invoke({ toolCallId: `board-${toolName}`, toolName, input, signal: new AbortController().signal });

  try {
    const rawEvaluation = await invoke('evaluate_model', { targetFile: 'main.tsx' });
    expect(rawEvaluation).toMatchObject({ isError: false, content: { success: true, status: 'ready' } });
    const evaluated = evaluation.parse(rawEvaluation.content);
    expect(evaluated.views).toContain('board');
    expect(evaluated.exports).toMatchObject({ bom: 'csv', netlist: 'txt' });
    expect(evaluated.kernelIssues.some(({ message }) => message.includes('R2 is missing a trace'))).toBe(true);
    expect(evaluated.sourceRevision.files['main.tsx']).toBe(
      `sha256:${createHash('sha256').update(board).digest('hex')}`,
    );

    const bomResult = await invoke('export_model', { targetFile: 'main.tsx', to: 'bom' });
    const netlistResult = await invoke('export_model', { targetFile: 'main.tsx', to: 'netlist' });
    const bom = exported.parse(bomResult.content);
    const netlist = exported.parse(netlistResult.content);
    const [bomFile] = bom.files;
    const [netlistFile] = netlist.files;
    if (!bomFile || !netlistFile) {
      throw new Error('Expected the BOM and netlist to include primary files.');
    }
    expect(bom.sourceRevision).toEqual(evaluated.sourceRevision);
    expect(netlist.sourceRevision).toEqual(evaluated.sourceRevision);
    const bomRead = await invoke('read_file', { targetFile: bomFile.artifactPath });
    const netlistRead = await invoke('read_file', { targetFile: netlistFile.artifactPath });
    const bomText = readText.parse(bomRead.content).content;
    const netlistText = readText.parse(netlistRead.content).content;
    expect(bomText).toContain('"R1","1k","1k","res0402"');
    expect(bomText).toContain('"R2","10k","10k","res0402"');
    expect(bomText).toContain('"LED1","","","0603"');
    expect(bomText).toContain('"U1","","","soic8"');
    const r2Pins = netlistText.split('COMPONENT_PINS:\n')[1]?.split('R2 (10kΩ res0402)\n')[1]?.split('\nLED1\n')[0];
    expect(r2Pins).toContain('- pin1(anode, pos, left): NOT_CONNECTED');
    expect(await readFile(join(workspaceRoot, bomFile.artifactPath), 'utf8')).toBe(bomText);
  } finally {
    await client.shutdown();
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
