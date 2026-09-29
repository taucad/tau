// @vitest-environment node

import { NodeIO } from '@gltf-transform/core';
import { esbuildBundler } from '@taucad/esbuild';
import { middleware } from '@taucad/middleware';
import { defineRuntime } from '@taucad/runtime';
import { isRecordObject } from '@taucad/runtime/kernel';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { GeometryResponse, HashedGeometryResult } from '@taucad/runtime/types';
import {
  createMockKernelRuntime,
  createTestRuntimeClient,
  expectKernelProjectionOrder,
  getTestParameters,
  readCoordinateEvidence,
  validateGlbData,
} from '@taucad/runtime-testing';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { tscircuitDetectPattern, tscircuitKernel } from '#tscircuit.kernel.js';

// =============================================================================
// Fixtures
// =============================================================================

/** Two resistors, an LED and a SOIC-8 chip with explicit traces and one shared net. */
const fixtureBoard = `
  export default () => (
    <board width="30mm" height="20mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-8} pcbY={4} />
      <resistor name="R2" resistance="10k" footprint="0402" pcbX={-8} pcbY={-4} />
      <led name="LED1" footprint="0603" pcbX={0} pcbY={6} />
      <chip name="U1" footprint="soic8" pcbX={6} pcbY={0} />
      <net name="VCC" />
      <trace from=".R1 > .pin1" to="net.VCC" />
      <trace from=".R2 > .pin2" to="net.VCC" />
      <trace from=".R1 > .pin2" to=".LED1 > .anode" />
      <trace from=".LED1 > .cathode" to=".U1 > .pin1" />
      <trace from=".R2 > .pin1" to=".U1 > .pin2" />
    </board>
  );
`;

const fixtureBoardCounts: ReadonlyArray<[type: string, count: number]> = [
  ['source_component', 4],
  ['pcb_component', 4],
  ['schematic_component', 4],
  ['source_trace', 5],
  ['pcb_trace', 4],
  ['pcb_board', 1],
];

// =============================================================================
// Test utilities
// =============================================================================

const fetchGuard = vi.fn((): never => {
  throw new Error('network access is not allowed during a tscircuit render');
});

const createRuntime = () =>
  defineRuntime({ plugins: [middleware()], kernels: [tscircuitKernel()], bundlers: [esbuildBundler()] });

type TestClient = ReturnType<typeof createTestRuntimeClient<ReturnType<typeof createRuntime>>>;
const clients = new Set<TestClient>();
const createClient = (files: Record<string, string>): TestClient => {
  const client = createTestRuntimeClient({ runtime: createRuntime(), files });
  clients.add(client);
  return client;
};

const render = async (client: TestClient, path: string): Promise<HashedGeometryResult> => {
  const outcome = await client.render({ source: { path } });
  if (outcome.superseded) {
    throw new Error('Test render was superseded');
  }
  return outcome.geometry;
};

const expectGeometry = (result: HashedGeometryResult): GeometryResponse & { hash: string } => {
  expect(result.success, result.success ? undefined : result.issues.map((issue) => issue.message).join('\n')).toBe(
    true,
  );
  if (!result.success) {
    throw new Error('unreachable');
  }
  return result.data;
};

const expectGlb = (result: HashedGeometryResult): Uint8Array<ArrayBuffer> => {
  const data = expectGeometry(result);
  expect(data.format).toBe('gltf');
  if (data.format !== 'gltf') {
    throw new Error('unreachable');
  }
  return data.content;
};

/* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- Vitest asymmetric matchers are typed as any in structured assertions. */
/** The warning the kernel records for one URL its offline fetch trap refused. */
const expectNetworkWarning = (url: string) =>
  expect.objectContaining({
    code: 'RUNTIME',
    severity: 'warning',
    message: expect.stringContaining(url),
    details: expect.objectContaining({ producer: 'tscircuit', url }),
  });
/* oxlint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */

type CircuitElementLike = { type: string };

const isCircuitElementArray = (value: unknown): value is CircuitElementLike[] =>
  Array.isArray(value) && value.every((element) => isRecordObject(element) && typeof element['type'] === 'string');

const countElementTypes = (circuitJson: readonly CircuitElementLike[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const element of circuitJson) {
    counts[element.type] = (counts[element.type] ?? 0) + 1;
  }
  return counts;
};

const resolveDefinition = async () => resolveRuntimePluginDefinition('kernel', tscircuitKernel());
let definition: Awaited<ReturnType<typeof resolveDefinition>>;

/** Read the settled circuit through its lossless JSON export. */
const readSettledCircuitJson = async (client: TestClient): Promise<CircuitElementLike[]> => {
  const result = await client.export('json');
  if (!result.success) {
    throw new Error(result.issues.map((issue) => issue.message).join('; '));
  }
  const file = result.data[0];
  if (!file) {
    throw new TypeError('Circuit JSON export returned no file.');
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(file.bytes));
  if (!isCircuitElementArray(parsed)) {
    throw new TypeError('Circuit JSON export is not an element array.');
  }
  return parsed;
};

/** Project one view directly from the same settled circuit while the old client exposes only its default. */
const renderSvgView = async (client: TestClient, view: 'schematic' | 'pcb'): Promise<string> => {
  const circuitJson = await readSettledCircuitJson(client);
  const runtime = createMockKernelRuntime();
  const context = await definition.initialize({}, runtime);
  const output = await definition.render!({ view, handle: { circuitJson }, options: {} }, runtime, context);
  if (typeof output.content !== 'string') {
    throw new TypeError(`${view} returned bytes instead of SVG text.`);
  }
  return output.content;
};

type ExportFormat = 'glb' | 'csv' | 'txt' | 'json';

const exportBytes = async (
  client: TestClient,
  format: ExportFormat,
  exportOptions?: Record<string, unknown>,
): Promise<{ name: string; bytes: Uint8Array<ArrayBuffer> }> => {
  const result = await client.export(format, {
    source: { path: 'main.tsx' },
    ...(exportOptions ? { exportOptions } : {}),
  });
  expect(result.success, result.success ? undefined : result.issues.map((issue) => issue.message).join('\n')).toBe(
    true,
  );
  if (!result.success) {
    throw new Error('unreachable');
  }
  expect(result.data).toHaveLength(1);
  return result.data[0]!;
};

const exportText = async (client: TestClient, format: ExportFormat): Promise<{ name: string; text: string }> => {
  const file = await exportBytes(client, format);
  return { name: file.name, text: new TextDecoder().decode(file.bytes) };
};

const glbExtent = async (glb: Uint8Array<ArrayBuffer>): Promise<{ width: number; height: number; depth: number }> => {
  const evidence = await readCoordinateEvidence({ bytes: glb });
  const positions = evidence.flatMap((primitive) => primitive.positions);
  const axis = (index: 0 | 1 | 2): number =>
    Math.max(...positions.map((point) => point[index])) - Math.min(...positions.map((point) => point[index]));
  return { width: axis(0), height: axis(1), depth: axis(2) };
};

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchGuard);
  definition = await resolveDefinition();
});

afterEach(async () => {
  await Promise.all([...clients].map(async (client) => client.shutdown()));
  clients.clear();
  vi.restoreAllMocks();
  expect(fetchGuard).not.toHaveBeenCalled();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// =============================================================================
// Tests
// =============================================================================

describe('TscircuitKernel', () => {
  describe('evaluate', () => {
    it('should offer only supported views and exports for board, schematic-only, and empty circuits', async () => {
      const runtime = createMockKernelRuntime();
      vi.spyOn(runtime.bundler, 'bundle').mockResolvedValue({
        code: '',
        issues: [],
        success: true,
        dependencies: [],
        unresolvedPaths: [],
      });
      vi.spyOn(runtime, 'execute').mockResolvedValue({ success: true, value: { default: () => undefined } });
      const context = { renderCircuit: vi.fn(async (): Promise<CircuitElementLike[]> => []) };
      const input = { entryPath: 'main.tsx', parameters: {}, options: {} };

      context.renderCircuit.mockResolvedValueOnce([{ type: 'pcb_board' }]);
      const board = await definition.evaluate(input, runtime, context);
      expect(board.views).toBeUndefined();
      expect(board.exports).toBeUndefined();

      context.renderCircuit.mockResolvedValueOnce([{ type: 'schematic_component' }]);
      const schematic = await definition.evaluate(input, runtime, context);
      expect(schematic.views).toEqual(['schematic']);
      expect(schematic.exports).toEqual(['bom', 'netlist', 'circuit']);

      const empty = await definition.evaluate(input, runtime, context);
      expect(empty.views).toEqual([]);
      expect(empty.exports).toEqual(['bom', 'netlist', 'circuit']);
    });

    it('should evaluate the fixture board to circuit JSON with the expected element counts', async () => {
      const client = createClient({ 'main.tsx': fixtureBoard });

      expectGlb(await render(client, 'main.tsx'));

      const counts = countElementTypes(await readSettledCircuitJson(client));
      for (const [type, count] of fixtureBoardCounts) {
        expect(counts[type], type).toBe(count);
      }
    });

    it('should apply render parameters through the component props', async () => {
      const files = {
        'main.tsx': `
          export const defaultParameters = { extraResistor: false };
          export default ({ extraResistor = false }) => (
            <board width="20mm" height="20mm">
              <resistor name="R1" resistance="1k" footprint="0402" />
              {extraResistor ? <resistor name="R2" resistance="1k" footprint="0402" /> : null}
            </board>
          );
        `,
      };

      const parameters = await getTestParameters({ runtime: createRuntime(), files, mainFile: 'main.tsx' });
      expect(parameters.defaults).toEqual({ extraResistor: false });
      expect(parameters.schema).toMatchObject({ properties: { extraResistor: { type: 'boolean' } } });

      const client = createClient(files);
      const outcome = await client.render({ source: { path: 'main.tsx' }, parameters: { extraResistor: true } });
      expect(outcome.superseded).toBe(false);
      expect(countElementTypes(await readSettledCircuitJson(client))['source_component']).toBe(2);
    });

    it('should surface an unresolved library footprint as a warning issue and still render', async () => {
      // Core reports the failed async footprint effect on console.error before recording the element.
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const client = createClient({
        'main.tsx': `
          export default () => (
            <board width="20mm" height="20mm">
              <chip name="U1" footprint="kicad:Package_SO:SOIC-8_3.9x4.9mm_P1.27mm" />
            </board>
          );
        `,
      });

      const result = await render(client, 'main.tsx');
      const pcb = await renderSvgView(client, 'pcb');
      expect(pcb.startsWith('<svg')).toBe(true);
      /* oxlint-disable @typescript-eslint/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any in structured assertions. */
      expect(result.success && result.issues).toContainEqual(
        expect.objectContaining({
          code: 'RUNTIME',
          severity: 'warning',
          message: expect.stringContaining('kicad'),
          details: expect.objectContaining({ producer: 'tscircuit' }),
        }),
      );
      /* oxlint-enable @typescript-eslint/no-unsafe-assignment */
      expect(result.success && result.issues.some((issue) => issue.severity === 'error')).toBe(false);
    });

    it('should not fetch an http footprint: the render completes with a warning naming the URL', async () => {
      // Core logs the rejected `load-footprint-url` effect on console.error.
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const url = 'http://example.invalid/r.json';
      const client = createClient({
        'main.tsx': `
          export default () => (
            <board width="20mm" height="20mm">
              <resistor name="R1" resistance="1k" footprint="${url}" pcbX={0} pcbY={0} />
            </board>
          );
        `,
      });

      const result = await render(client, 'main.tsx');
      const pcb = await renderSvgView(client, 'pcb');
      expect(pcb.startsWith('<svg')).toBe(true);
      expect(result.success && result.issues).toContainEqual(expectNetworkWarning(url));
      // The kernel's trap intercepted the request in place of the module-level guard and handed it back.
      expect(globalThis.fetch).toBe(fetchGuard);
    });

    it('should not fetch a cadModel URL: the 3d output is a valid GLB with a warning naming the URL', async () => {
      // `circuit-json-to-gltf` logs the rejected model download on console.error.
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const url = 'https://example.invalid/part.glb';
      const client = createClient({
        'main.tsx': `
          export default () => (
            <board width="20mm" height="20mm">
              <chip name="U1" footprint="soic8" cadModel={{ glbUrl: '${url}' }} pcbX={0} pcbY={0} />
            </board>
          );
        `,
      });

      const result = await render(client, 'main.tsx');
      validateGlbData(expectGlb(result));
      expect(result.success && result.issues).toContainEqual(expectNetworkWarning(url));
      expect(globalThis.fetch).toBe(fetchGuard);
    });

    it('should report a bundle failure with the entry location', async () => {
      const client = createClient({ 'main.tsx': 'export default () => (<board width="10mm" height="10mm"' });

      const result = await render(client, 'main.tsx');
      expect(result.success).toBe(false);
      if (result.success) {
        return;
      }
      expect(result.issues[0]).toMatchObject({ severity: 'error', location: { fileName: 'main.tsx' } });
    });

    it('should reject an entry without a component export', async () => {
      const client = createClient({ 'main.tsx': 'export const answer = 42;' });

      const result = await render(client, 'main.tsx');
      expect(result.success).toBe(false);
      if (result.success) {
        return;
      }
      expect(result.issues[0]?.message).toContain('must export a board component');
    });
  });

  describe('meshGeometry', () => {
    it('should render the 3d output as a GLB in metres with one mesh per body', async () => {
      const client = createClient({ 'main.tsx': fixtureBoard });

      const glb = expectGlb(await render(client, 'main.tsx'));

      expect(new TextDecoder().decode(glb.subarray(0, 4))).toBe('glTF');
      const document = await new NodeIO().readBinary(glb);
      expect(document.getRoot().listMeshes().length).toBeGreaterThanOrEqual(1);
      expect(
        document
          .getRoot()
          .listNodes()
          .map((node) => node.getName()),
      ).toEqual(expect.arrayContaining(['R1', 'R2', 'LED1', 'U1']));
      // 30 mm x 20 mm board in Y-up metres: components sit on top, the board spans X and Z.
      const extent = await glbExtent(glb);
      expect(extent.width).toBeCloseTo(0.03, 3);
      expect(extent.depth).toBeCloseTo(0.02, 3);
      expect(extent.height).toBeLessThan(0.01);
    });

    it('should strip the converter texture coordinates so untextured rasterizers accept the GLB', async () => {
      const client = createClient({ 'main.tsx': fixtureBoard });

      const glb = expectGlb(await render(client, 'main.tsx'));

      validateGlbData(glb);
      const document = await new NodeIO().readBinary(glb);
      const root = document.getRoot();
      const semantics = root
        .listMeshes()
        .flatMap((mesh) => mesh.listPrimitives().flatMap((primitive) => primitive.listSemantics()));
      expect(semantics.length).toBeGreaterThan(0);
      expect(semantics.filter((semantic) => semantic.startsWith('TEXCOORD_'))).toEqual([]);
      expect(semantics).toContain('POSITION');
      expect(root.listTextures()).toEqual([]);
      // No orphaned UV accessor survives in the written file.
      expect(root.listAccessors().every((accessor) => accessor.listParents().length > 1)).toBe(true);
    });

    it('should render the schematic output as an SVG with a viewBox and schematic elements', async () => {
      const client = createClient({ 'main.tsx': fixtureBoard });

      expectGlb(await render(client, 'main.tsx'));
      const svg = await renderSvgView(client, 'schematic');

      expect(svg.startsWith('<svg ')).toBe(true);
      expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 \d+(?:\.\d+)? \d+(?:\.\d+)?"/);
      expect(svg).toContain('class="tscircuit-schematic"');
      expect(svg).toContain('sch-component');
      expect(svg).toContain('sch-trace');
    });

    it('should render the pcb output as an SVG with a viewBox and pcb elements', async () => {
      const client = createClient({ 'main.tsx': fixtureBoard });

      expectGlb(await render(client, 'main.tsx'));
      const svg = await renderSvgView(client, 'pcb');

      expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 \d+(?:\.\d+)? \d+(?:\.\d+)?"/);
      expect(svg).toContain('pcb-board');
      expect(svg).toContain('pcb-pad');
      expect(svg).toContain('pcb-trace');
    });

    it('should project the schematic from the same settled circuit as the repeated default board render', async () => {
      const client = createClient({ 'main.tsx': fixtureBoard });

      const first = expectGeometry(await render(client, 'main.tsx'));

      const second = expectGeometry(await render(client, 'main.tsx'));
      expect(second.hash).toBe(first.hash);
      const schematic = await renderSvgView(client, 'schematic');
      expect(schematic).toContain('class="tscircuit-schematic"');
    });

    it('keeps board, schematic, and circuit export projections stable on one settled handle', async () => {
      const client = createClient({ 'main.tsx': fixtureBoard });
      expectGlb(await render(client, 'main.tsx'));
      const handle = { circuitJson: await readSettledCircuitJson(client) };
      const runtime = createMockKernelRuntime();
      const context = await definition.initialize({}, runtime);
      const fresh = definition.deserializeHandle!(
        { serialized: definition.serializeHandle!({ handle }, runtime, context) },
        runtime,
        context,
      );
      const project = async (view: 'board' | 'schematic', source = handle) => {
        const result = await definition.render!({ view, handle: source, options: {} }, runtime, context);
        return result.content;
      };
      const write = async () => {
        const result = await definition.write!({ exportId: 'circuit', handle, options: {} }, runtime, context);
        return result.files[0].bytes;
      };
      await expectKernelProjectionOrder({
        renderA: async () => project('board'),
        renderB: async () => project('schematic'),
        freshB: async () => project('schematic', fresh),
        write,
      });
    });
  });

  describe('kernel selection', () => {
    it('should route a .tsx file without any import by extension', async () => {
      const client = createClient({
        'board.tsx': 'export default () => <board width="10mm" height="10mm" />;',
      });

      expectGlb(await render(client, 'board.tsx'));
    });

    it('should route a .ts file importing tscircuit through the builtin module', async () => {
      const client = createClient({
        'board.ts': `
          import { createElement } from 'tscircuit';
          export default () =>
            createElement('board', { width: '10mm', height: '10mm' },
              createElement('resistor', { name: 'R1', resistance: '1k', footprint: '0402' }));
        `,
      });

      expectGlb(await render(client, 'board.ts'));
    });

    it('should accept an explicit React import beside the injected global', async () => {
      const client = createClient({
        'board.tsx': `
          import React from 'react';
          import { Circuit } from '@tscircuit/core';
          export default () => <board width="10mm" height="10mm" />;
          export const kind = typeof Circuit;
        `,
      });

      expectGlb(await render(client, 'board.tsx'));
    });

    it('should match tscircuit and @tscircuit/core imports with the detect pattern', () => {
      expect(tscircuitDetectPattern.test(`import { Circuit } from 'tscircuit';`)).toBe(true);
      expect(tscircuitDetectPattern.test(`import * as core from "@tscircuit/core";`)).toBe(true);
      expect(tscircuitDetectPattern.test(`const core = require('@tscircuit/core');`)).toBe(true);
      expect(tscircuitDetectPattern.test(`import React from 'react';`)).toBe(false);
    });
  });

  describe('exportGeometry', () => {
    it('should list exactly the glb, csv, txt and json export routes for the kernel', async () => {
      const client = createClient({ 'main.tsx': fixtureBoard });
      // Kernel routes join the manifest once the kernel module has loaded.
      expectGlb(await render(client, 'main.tsx'));

      // The test runtime hosts only this kernel and no transcoder, so every route is a tscircuit direct export.
      const routes = client.capabilities?.routes ?? [];
      expect(routes.every((route) => route.transcoderId === undefined)).toBe(true);
      const formats = routes.map((route) => route.targetFormat).sort((left, right) => left.localeCompare(right));
      expect(formats).toEqual(['csv', 'glb', 'json', 'txt']);
    });

    it('should export a bill of materials CSV with one row per fixture part', async () => {
      const client = createClient({ 'main.tsx': fixtureBoard });

      const { name, text } = await exportText(client, 'csv');

      expect(name).toBe('bom.csv');
      // Every fixture cell is quoted and comma-free, so a split per line reads the RFC-4180 rows.
      const [header, ...rows] = text
        .trim()
        .split(/\r?\n/)
        .map((line) => line.split(',').map((cell) => cell.replaceAll('"', '')));
      expect(header?.slice(0, 4)).toEqual(['Designator', 'Comment', 'Value', 'Footprint']);
      const cells = rows;
      expect(cells.map((row) => row[0])).toEqual(['R1', 'R2', 'LED1', 'U1']);
      expect(cells.map((row) => row[2])).toEqual(['1k', '10k', '', '']);
      expect(cells.map((row) => row[3])).toEqual(['res0402', 'res0402', '0603', 'soic8']);
    });

    it('should export a readable netlist naming each net and component', async () => {
      const client = createClient({ 'main.tsx': fixtureBoard });

      const { name, text } = await exportText(client, 'txt');

      expect(name).toBe('netlist.txt');
      expect(text).toContain('COMPONENTS:');
      for (const token of ['VCC', 'R1', 'R2', 'LED1', 'U1']) {
        expect(text, token).toContain(token);
      }
    });

    it('should export the circuit JSON handle pretty-printed with every element', async () => {
      const client = createClient({ 'main.tsx': fixtureBoard });

      const { name, text } = await exportText(client, 'json');

      expect(name).toBe('circuit.json');
      expect(text.startsWith('[\n  {')).toBe(true);
      const parsed: unknown = JSON.parse(text);
      if (!isCircuitElementArray(parsed)) {
        throw new TypeError('circuit.json is not a circuit JSON array.');
      }
      const counts = countElementTypes(parsed);
      for (const [type, count] of fixtureBoardCounts) {
        expect(counts[type], type).toBe(count);
      }
    });

    it('should export a valid GLB in Y-up metres by default and Z-up millimetres on request', async () => {
      const client = createClient({ 'main.tsx': fixtureBoard });

      const yUp = await exportBytes(client, 'glb');
      expect(yUp.name).toBe('model.glb');
      validateGlbData(yUp.bytes);
      const yUpExtent = await glbExtent(yUp.bytes);
      expect(yUpExtent.width).toBeCloseTo(0.03, 3);
      expect(yUpExtent.depth).toBeCloseTo(0.02, 3);
      expect(yUpExtent.height).toBeLessThan(0.01);

      const zUp = await exportBytes(client, 'glb', { coordinateSystem: 'z-up', unit: { length: 'millimeter' } });
      validateGlbData(zUp.bytes);
      const zUpExtent = await glbExtent(zUp.bytes);
      expect(zUpExtent.width).toBeCloseTo(30, 3);
      expect(zUpExtent.height).toBeCloseTo(20, 3);
      expect(zUpExtent.depth).toBeLessThan(10);
    });

    it('should reject an undeclared export format on the wire', async () => {
      const client = createClient({ 'main.tsx': fixtureBoard });

      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- deliberately bypasses the typed format union to test wire rejection.
      const result = await client.export('step' as 'glb', { source: { path: 'main.tsx' } });
      expect(result.success).toBe(false);
    });
  });

  describe('native handle snapshots', () => {
    it('should round-trip circuit JSON as UTF-8 JSON bytes', async () => {
      const runtime = createMockKernelRuntime();
      const context = await definition.initialize({}, runtime);
      const circuitJson = [{ type: 'source_project_metadata', name: 'snapshot' }];
      const nativeHandle = definition.deserializeHandle!(
        {
          serialized: definition.serializeHandle!({ handle: { circuitJson } }, runtime, context),
        },
        runtime,
        context,
      );

      expect(nativeHandle).toEqual({ circuitJson });
    });

    it('should reject a snapshot that is not a circuit JSON array', async () => {
      const runtime = createMockKernelRuntime();
      const context = await definition.initialize({}, runtime);

      expect(() =>
        definition.deserializeHandle!(
          { serialized: new TextEncoder().encode('{"type":"pcb_board"}') },
          runtime,
          context,
        ),
      ).toThrow(TypeError);
    });
  });
});
