// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { createNodeIo } from '@taucad/geometry-core';
import { esbuildBundler } from '@taucad/esbuild';
import { middleware } from '@taucad/middleware';
import { asKnownArtifact, defineRuntime } from '@taucad/runtime';
import { createRuntimeClient } from '@taucad/runtime/client';
import type { Rendering } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { isRecordObject } from '@taucad/runtime/kernel';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
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

const fixtureSheets = `
  export default () => <board width="30mm" height="20mm">
    <schematicsheet name="Power"><resistor name="R1" resistance="1k" footprint="0402" /></schematicsheet>
    <schematicsheet name="Signals"><led name="LED1" footprint="0603" /></schematicsheet>
  </board>;
`;

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
const documents = new Set<ReturnType<TestClient['open']>>();
const createClient = (files: Record<string, string>) => {
  const client = createTestRuntimeClient({ runtime: createRuntime(), files });
  const path = Object.keys(files)[0];
  if (!path) {
    throw new Error('Test fixture has no source file.');
  }
  const document = client.open({ source: { path }, watch: false });
  clients.add(client);
  documents.add(document);
  return { client, document, path };
};
type TestSession = ReturnType<typeof createClient>;

const render = async (session: TestSession, path: string): Promise<Rendering<'board'>> => {
  expect(path).toBe(session.path);
  const view = session.document.view('board');
  const outcome = await view.rendering();
  view.close();
  if (outcome.superseded) {
    throw new Error('Test render was superseded');
  }
  return outcome.rendering;
};

const expectGeometry = (result: Rendering): Extract<Rendering, { success: true }> => {
  expect(result.success, result.success ? undefined : result.issues.map((issue) => issue.message).join('\n')).toBe(
    true,
  );
  if (!result.success) {
    throw new Error('unreachable');
  }
  return result;
};

const expectGlb = (result: Rendering): Uint8Array<ArrayBuffer> => {
  const artifact = asKnownArtifact(expectGeometry(result).artifact);
  if (artifact?.mimeType !== 'model/gltf-binary') {
    throw new TypeError('Board view did not return a GLB artifact.');
  }
  return artifact.content;
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
const readSettledCircuitJson = async (session: TestSession): Promise<CircuitElementLike[]> => {
  const result = await session.document.export('circuit');
  if (!result.success) {
    throw new Error(result.issues.map((issue) => issue.message).join('; '));
  }
  const file = result.files[0];
  const parsed: unknown = JSON.parse(new TextDecoder().decode(file.bytes));
  if (!isCircuitElementArray(parsed)) {
    throw new TypeError('Circuit JSON export is not an element array.');
  }
  return parsed;
};

/** Project a secondary SVG view from the same public document. */
const renderSvgView = async (session: TestSession, id: 'schematic' | 'pcb'): Promise<string> => {
  const view = session.document.view(id);
  const outcome = await view.rendering();
  view.close();
  if (outcome.superseded || !outcome.rendering.success) {
    throw new Error(`${id} view failed to render.`);
  }
  const output = asKnownArtifact(outcome.rendering.artifact);
  if (output?.mimeType !== 'image/svg+xml') {
    throw new TypeError(`${id} returned bytes instead of SVG text.`);
  }
  return output.content;
};

type ExportFormat = 'glb' | 'csv' | 'txt' | 'json';

const exportBytes = async (
  session: TestSession,
  format: ExportFormat,
  exportOptions?: { coordinateSystem: 'z-up'; unit: { length: 'millimeter' } },
): Promise<{ name: string; bytes: Uint8Array<ArrayBuffer> }> => {
  const result = exportOptions
    ? await session.document.export('glb', { options: exportOptions })
    : await session.document.export(format);
  expect(result.success, result.success ? undefined : result.issues.map((issue) => issue.message).join('\n')).toBe(
    true,
  );
  if (!result.success) {
    throw new Error('unreachable');
  }
  expect(result.files).toHaveLength(1);
  return result.files[0];
};

const exportText = async (session: TestSession, format: ExportFormat): Promise<{ name: string; text: string }> => {
  const file = await exportBytes(session, format);
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
  for (const document of documents) {
    document.close();
  }
  documents.clear();
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
      const context = {
        renderCircuit: vi.fn(async () => ({
          circuitJson: [] as CircuitElementLike[],
          authoredSheets: new Map<string, string>(),
        })),
      };
      const input = { entryPath: 'main.tsx', parameters: {}, options: {} };

      context.renderCircuit.mockResolvedValueOnce({ circuitJson: [{ type: 'pcb_board' }], authoredSheets: new Map() });
      const board = await definition.evaluate(input, runtime, context);
      expect(board.views).toBeUndefined();
      expect(board.exports).toBeUndefined();
      expect(board.instances).toBeUndefined();

      context.renderCircuit.mockResolvedValueOnce({
        circuitJson: [{ type: 'schematic_component' }],
        authoredSheets: new Map(),
      });
      const schematic = await definition.evaluate(input, runtime, context);
      expect(schematic.views).toEqual(['schematic']);
      expect(schematic.exports).toEqual(['bom', 'netlist', 'circuit']);

      const empty = await definition.evaluate(input, runtime, context);
      expect(empty.views).toEqual([]);
      expect(empty.exports).toEqual(['bom', 'netlist', 'circuit']);
    });

    it('preserves structured component, port and center evidence in issues', async () => {
      const runtime = createMockKernelRuntime();
      vi.spyOn(runtime.bundler, 'bundle').mockResolvedValue({
        code: '',
        issues: [],
        success: true,
        dependencies: [],
        unresolvedPaths: [],
      });
      vi.spyOn(runtime, 'execute').mockResolvedValue({ success: true, value: { default: () => undefined } });
      const context = {
        renderCircuit: async () => ({
          circuitJson: [
            {
              type: 'pcb_route_warning',
              message: 'Unrouted pin',
              components: ['U1'],
              ports: ['U1.pin1'],
              center: { x: 2, y: 3 },
            },
          ],
          authoredSheets: new Map<string, string>(),
        }),
      };
      const result = await definition.evaluate(
        { entryPath: 'main.tsx', parameters: {}, options: {} },
        runtime,
        context,
      );
      expect(result.issues?.[0]?.details).toEqual({
        producer: 'tscircuit',
        elementType: 'pcb_route_warning',
        components: ['U1'],
        ports: ['U1.pin1'],
        center: { x: 2, y: 3 },
      });
    });

    it('maps authored sheet names across reorder and expires duplicate or generated identities', async () => {
      const runtime = createMockKernelRuntime();
      vi.spyOn(runtime.bundler, 'bundle').mockResolvedValue({
        code: '',
        issues: [],
        success: true,
        dependencies: [],
        unresolvedPaths: [],
      });
      vi.spyOn(runtime, 'execute').mockResolvedValue({ success: true, value: { default: () => undefined } });
      const context = {
        renderCircuit: vi.fn(async () => ({
          circuitJson: [] as CircuitElementLike[],
          authoredSheets: new Map<string, string>(),
        })),
      };
      const evaluate = async (circuitJson: CircuitElementLike[]) => {
        const authoredSheets = new Map(
          circuitJson
            .filter(({ type }) => type === 'schematic_sheet')
            .map((sheet) => [String(Reflect.get(sheet, 'schematic_sheet_id')), String(Reflect.get(sheet, 'name'))]),
        );
        context.renderCircuit.mockResolvedValueOnce({ circuitJson, authoredSheets });
        return definition.evaluate({ entryPath: 'main.tsx', parameters: {}, options: {} }, runtime, context);
      };
      const sheet = (id: string, name: string) => {
        const element = { type: 'schematic_sheet', name };
        Reflect.set(element, 'schematic_sheet_id', id);
        return element;
      };
      const first = await evaluate([sheet('schematic_sheet_0', 'Power'), sheet('schematic_sheet_1', 'Signals')]);
      const second = await evaluate([sheet('schematic_sheet_0', 'Signals'), sheet('schematic_sheet_1', 'Power')]);
      expect(first.instances?.schematic?.map(({ id }) => id)).toEqual(['sheet:Power', 'sheet:Signals']);
      expect(first.instances?.schematic?.map(({ title }) => title)).toEqual(['Power', 'Signals']);
      expect(second.handle.sheets.get('sheet:Power')).toBe('schematic_sheet_1');
      const duplicates = await evaluate([
        sheet('schematic_sheet_0', 'Duplicate'),
        sheet('schematic_sheet_1', 'Duplicate'),
        sheet('schematic_sheet_2', 'Sheet 3'),
      ]);
      const repeated = await evaluate([
        sheet('schematic_sheet_0', 'Duplicate'),
        sheet('schematic_sheet_1', 'Duplicate'),
        sheet('schematic_sheet_2', 'Sheet 3'),
      ]);
      expect(duplicates.instances?.schematic?.slice(0, 2).every(({ id }) => id.startsWith('local:'))).toBe(true);
      expect(duplicates.instances?.schematic?.slice(0, 2).map(({ title }) => title)).toEqual([
        'Duplicate (current evaluation)',
        'Duplicate (current evaluation)',
      ]);
      expect(duplicates.instances?.schematic?.[2]?.id).toBe('sheet:Sheet%203');
      expect(repeated.instances?.schematic?.[0]?.id).not.toBe(duplicates.instances?.schematic?.[0]?.id);
      const restored = definition.deserializeHandle!(
        { serialized: definition.serializeHandle!({ handle: duplicates.handle }, runtime, context) },
        runtime,
        context,
      );
      expect(restored.sheets.get(duplicates.instances?.schematic?.[0]?.id ?? '')).toBe('schematic_sheet_0');
      context.renderCircuit.mockResolvedValueOnce({
        circuitJson: [sheet('schematic_sheet_0', 'Sheet 1')],
        authoredSheets: new Map(),
      });
      const generated = await definition.evaluate(
        { entryPath: 'main.tsx', parameters: {}, options: {} },
        runtime,
        context,
      );
      expect(generated.instances?.schematic?.[0]?.id).toMatch(/^local:/);
      expect(generated.instances?.schematic?.[0]?.title).toBe('Sheet 1 (current evaluation)');
    });

    it('renders two authored sheets individually and warns about an orphaned part', async () => {
      const client = createClient({ 'main.tsx': fixtureSheets });
      const circuitJson = await readSettledCircuitJson(client);
      const sheets = circuitJson.filter(({ type }) => type === 'schematic_sheet');
      expect(sheets).toHaveLength(2);
      const runtime = createMockKernelRuntime();
      const context = await definition.initialize({}, runtime);
      const handle = {
        circuitJson,
        sheets: new Map(
          sheets.map((sheet) => [
            `sheet:${encodeURIComponent(String(Reflect.get(sheet, 'name')))}`,
            String(Reflect.get(sheet, 'schematic_sheet_id')),
          ]),
        ),
      };
      await Promise.all(
        ['Power', 'Signals'].map(async (name) => {
          const result = await definition.render!(
            { view: 'schematic', handle, options: {}, instance: `sheet:${name}` },
            runtime,
            context,
          );
          expect(result.content).toContain(name === 'Power' ? 'R1' : 'LED1');
          expect(result.content).not.toContain(name === 'Power' ? 'LED1' : 'R1');
        }),
      );
      await expect(
        definition.render!({ view: 'schematic', handle, options: {}, instance: 'local:expired' }, runtime, context),
      ).rejects.toThrow('Unknown schematic sheet');
      const orphan = { type: 'schematic_component', name: 'R7' };
      vi.spyOn(runtime.bundler, 'bundle').mockResolvedValue({
        code: '',
        issues: [],
        success: true,
        dependencies: [],
        unresolvedPaths: [],
      });
      vi.spyOn(runtime, 'execute').mockResolvedValue({ success: true, value: { default: () => undefined } });
      const orphanBuild = await definition.evaluate({ entryPath: 'main.tsx', parameters: {}, options: {} }, runtime, {
        renderCircuit: async () => ({ circuitJson: [sheets[0]!, orphan], authoredSheets: new Map() }),
      });
      expect(orphanBuild.issues?.some((issue) => issue.message.includes('R7'))).toBe(true);
    }, 20_000);

    it('should evaluate the fixture board to circuit JSON with the expected element counts', async () => {
      const client = createClient({ 'main.tsx': fixtureBoard });

      const evaluated = await client.document.evaluation();
      expect(evaluated.superseded).toBe(false);
      if (!evaluated.superseded) {
        expect(evaluated.evaluation.sourceRevision?.files['.tau/parameters/main.tsx.json']).toBe('missing');
      }

      expectGlb(await render(client, 'main.tsx'));

      const counts = countElementTypes(await readSettledCircuitJson(client));
      for (const [type, count] of fixtureBoardCounts) {
        expect(counts[type], type).toBe(count);
      }
    }, 20_000);

    it('draws every part in the product template and led-board example without a stray sheet', async () => {
      const catalog = await readFile(
        new URL('../../../../libs/types/src/constants/kernel.constants.ts', import.meta.url),
        'utf8',
      );
      const template = /id: 'tscircuit',[\S\s]*?emptyCode: `([\S\s]*?)`,/.exec(catalog)?.[1];
      if (!template) {
        throw new Error('tscircuit product template was not found');
      }
      const example = await readFile(
        new URL('../../../../libs/tau-examples/src/kernels/tscircuit/led-board/main.tsx', import.meta.url),
        'utf8',
      );
      await Promise.all(
        (
          [
            [template, 2],
            [example, 4],
          ] as const
        ).map(async ([source, expected]) => {
          const client = createClient({ 'main.tsx': source });
          const circuit = await readSettledCircuitJson(client);
          expect(circuit.filter(({ type }) => type === 'schematic_sheet')).toHaveLength(0);
          expect(circuit.filter(({ type }) => type === 'schematic_component')).toHaveLength(expected);
          const svg = await renderSvgView(client, 'schematic');
          expect((svg.match(/class="sch-component"/g) ?? []).length).toBe(expected);
        }),
      );
    }, 20_000);

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
      const outcome = await client.document.update({ parameters: { extraResistor: true } });
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
      const io = await createNodeIo();
      const document = await io.readBinary(glb);
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

    it('should retain board textures and add feature-edge line primitives', async () => {
      const client = createClient({ 'main.tsx': fixtureBoard });

      const glb = expectGlb(await render(client, 'main.tsx'));

      validateGlbData(glb);
      const io = await createNodeIo();
      const document = await io.readBinary(glb);
      const root = document.getRoot();
      expect(root.listTextures().length).toBeGreaterThan(0);
      expect(
        root
          .listMeshes()
          .flatMap((mesh) => mesh.listPrimitives())
          .filter((primitive) => primitive.getMode() === 1).length,
      ).toBeGreaterThan(0);
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
      expect(svg).toContain('fill: rgb(0, 105, 0)');
      // WCAG contrast of the net-label text colour against white paper.
      const channel = 105 / 255;
      const luminance = 0.7152 * ((channel + 0.055) / 1.055) ** 2.4;
      expect(1.05 / (luminance + 0.05)).toBeGreaterThan(4.5);
      expect(/^<svg [^>]*width="[\d.]+" height="[\d.]+"/.exec(svg)).not.toBeNull();
    }, 20_000);

    it('should render the pcb output as an SVG with a viewBox and pcb elements', async () => {
      const client = createClient({ 'main.tsx': fixtureBoard });

      expectGlb(await render(client, 'main.tsx'));
      const svg = await renderSvgView(client, 'pcb');

      expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 \d+(?:\.\d+)? \d+(?:\.\d+)?"/);
      expect(svg).toContain('data-type="pcb_background"');
      expect(svg).toContain('pcb-pad');
      expect(svg).toContain('pcb-trace');
      expect(/^<svg [^>]*width="[\d.]+" height="[\d.]+"/.exec(svg)).not.toBeNull();
      const circuitJson = await readSettledCircuitJson(client);
      const runtime = createMockKernelRuntime();
      const context = await definition.initialize({}, runtime);
      const pinSvg = await definition.render!(
        { view: 'pcb', handle: { circuitJson, sheets: new Map() }, options: { pinNumbers: true } },
        runtime,
        context,
      );
      expect(pinSvg.content).toContain('class="pcb-pad-pin-number"');
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
      const handle: { circuitJson: CircuitElementLike[]; sheets: ReadonlyMap<string, string> } = {
        circuitJson: await readSettledCircuitJson(client),
        sheets: new Map(),
      };
      const runtime = createMockKernelRuntime();
      const context = await definition.initialize({}, runtime);
      const fresh = definition.deserializeHandle!(
        { serialized: definition.serializeHandle!({ handle }, runtime, context) },
        runtime,
        context,
      );
      const project = async (view: 'board' | 'schematic', source = handle) => {
        const result = await definition.render!(
          { view, handle: source, options: {}, ...(view === 'schematic' ? { instance: undefined } : {}) },
          runtime,
          context,
        );
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
      const routes = client.client.capabilities?.routes ?? [];
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
      const result = await client.document.export('step' as 'glb');
      expect(result.success).toBe(false);
    });
  });

  it('reuses one real build across board, schematic, PCB, board and exports without middleware or compute', async () => {
    const { RootCircuit: rootCircuit } = await import('#engine/core.js');
    const nativeBuild = vi.spyOn(rootCircuit.prototype, 'renderUntilSettled');
    const runtime = defineRuntime({ kernels: [tscircuitKernel()], bundlers: [esbuildBundler()] });
    const client = createRuntimeClient({
      transport: inProcessTransport({
        runtime,
        fileSystem: fromMemoryFs({ 'main.tsx': fixtureBoard }),
        compute: { mode: 'off' },
      }),
    });
    const document = client.open({ source: { path: 'main.tsx' }, watch: false });
    try {
      const evaluated = await document.evaluation();
      expect(evaluated.superseded).toBe(false);
      if (evaluated.superseded || !evaluated.evaluation.success) {
        throw new Error('The fixture board did not evaluate');
      }
      expect(evaluated.evaluation.views.map(({ id }) => id)).toEqual(['board', 'schematic', 'pcb']);
      expect(evaluated.evaluation.sourceRevision).toBeDefined();

      const durations: Record<string, number> = {};
      const project = async (viewId: 'board' | 'schematic' | 'pcb', label: string = viewId) => {
        const view = document.view(viewId);
        const start = performance.now();
        const outcome = await view.rendering();
        durations[label] = performance.now() - start;
        view.close();
        if (outcome.superseded || !outcome.rendering.success) {
          throw new Error(`${label} did not render`);
        }
        expect(outcome.rendering.evaluationId).toBe(evaluated.evaluation.id);
        expect(outcome.rendering.sourceRevision).toEqual(evaluated.evaluation.sourceRevision);
        return outcome.rendering;
      };
      const firstBoard = await project('board', 'board first');
      validateGlbData(expectGlb(firstBoard));
      for (const id of ['schematic', 'pcb'] as const) {
        // oxlint-disable-next-line no-await-in-loop -- these are ordered view switches on one document.
        const rendering = await project(id);
        const artifact = asKnownArtifact(rendering.artifact);
        expect(artifact?.mimeType).toBe('image/svg+xml');
        if (artifact?.mimeType !== 'image/svg+xml') {
          throw new Error(`${id} returned no SVG`);
        }
        expect(artifact.content).toContain('<svg');
      }
      const lastBoard = await project('board', 'board return');
      expectGlb(lastBoard);
      expect(lastBoard.hash).toBe(firstBoard.hash);
      const exported = await document.export('circuit');
      expect(exported.success).toBe(true);
      if (!exported.success) {
        throw new Error('Circuit export failed');
      }
      expect(exported.evaluationId).toBe(evaluated.evaluation.id);
      expect(exported.sourceRevision).toEqual(evaluated.evaluation.sourceRevision);
      expect(nativeBuild).toHaveBeenCalledTimes(1);
      console.info('[W4 real view latency, ms]', durations);
    } finally {
      document.close();
      await client.shutdown();
    }
  }, 30_000);

  describe('native handle snapshots', () => {
    it('should round-trip circuit JSON as UTF-8 JSON bytes', async () => {
      const runtime = createMockKernelRuntime();
      const context = await definition.initialize({}, runtime);
      const circuitJson = [{ type: 'source_project_metadata', name: 'snapshot' }];
      const nativeHandle = definition.deserializeHandle!(
        {
          serialized: definition.serializeHandle!({ handle: { circuitJson, sheets: new Map() } }, runtime, context),
        },
        runtime,
        context,
      );

      expect(nativeHandle).toEqual({ circuitJson, sheets: new Map() });
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
