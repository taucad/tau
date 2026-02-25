// @vitest-environment node
/* eslint-disable max-lines -- comprehensive kernel integration coverage */
import { describe, it, expect } from 'vitest';
import manifoldKernel from '#kernels/manifold/manifold.kernel.js';
import { createGeometryTestHelpers } from '#testing/kernel-geometry-testing.utils.js';
import {
  createGeometryFile,
  createTestGeometry,
  createTestWorker,
  getTestParameters,
} from '#testing/kernel-testing.utils.js';

const manifoldExtensions = ['tsx', 'jsx', 'ts', 'js'];

const createWorker = async (
  files: Record<string, string>,
  options?: { includeModels?: boolean; partsEngineDisabled?: boolean },
): ReturnType<typeof createTestWorker> =>
  createTestWorker(manifoldKernel, files, {
    extensions: manifoldExtensions,
    workerOptions: {
      includeModels: options?.includeModels ?? false,
      partsEngineDisabled: options?.partsEngineDisabled ?? true,
    },
  });

const getParameters = async (
  files: Record<string, string>,
  mainFile: string,
): Promise<{ jsonSchema: unknown; defaultParameters: Record<string, unknown> }> =>
  getTestParameters(manifoldKernel, files, mainFile);

const createGeometry = async (
  files: Record<string, string>,
  mainFile: string,
): ReturnType<typeof createTestGeometry> =>
  createTestGeometry({
    definition: manifoldKernel,
    files,
    mainFile,
    options: {
      extensions: manifoldExtensions,
      workerOptions: {
        includeModels: false,
        partsEngineDisabled: true,
      },
    },
  });

const geometryHelpers = createGeometryTestHelpers();

describe('ManifoldKernel', () => {
  describe('canHandle', () => {
    it('handles TSX with global circuit usage', async () => {
      const worker = await createWorker({
        'main.tsx': `
          circuit.add(
            <board width="30mm" height="20mm" />
          );
        `,
      });

      const result = await worker.canHandle(createGeometryFile('main.tsx'));
      expect(result).toBe(true);
    });

    it('handles TS with @tscircuit/core imports', async () => {
      const worker = await createWorker({
        'main.ts': `
          import { RootCircuit } from '@tscircuit/core';
          const rootCircuit = new RootCircuit();
          export default rootCircuit;
        `,
      });

      const result = await worker.canHandle(createGeometryFile('main.ts'));
      expect(result).toBe(true);
    });

    it('handles TS with @tsci namespace imports', async () => {
      const worker = await createWorker({
        'main.ts': `
          import Example from '@tsci/example.package';
          export default Example;
        `,
      });

      const result = await worker.canHandle(createGeometryFile('main.ts'));
      expect(result).toBe(true);
    });

    it('does not handle unrelated TSX code', async () => {
      const worker = await createWorker({
        'main.tsx': `
          export default function App() {
            return <div>Hello</div>;
          }
        `,
      });

      const result = await worker.canHandle(createGeometryFile('main.tsx'));
      expect(result).toBe(false);
    });

    it('does not handle non JS/TS extensions', async () => {
      const worker = await createWorker({
        'model.scad': 'cube([10, 10, 10]);',
      });

      const result = await worker.canHandle(createGeometryFile('model.scad'));
      expect(result).toBe(false);
    });
  });

  describe('getDependencies', () => {
    it('resolves transitive dependencies for local TSX imports', async () => {
      const worker = await createWorker({
        'main.tsx': `
          import { BoardShell } from './lib/board-shell';
          circuit.add(<BoardShell />);
        `,
        'lib/board-shell.tsx': `
          import { BoardShape } from './board-shape';
          export function BoardShell() {
            return <BoardShape />;
          }
        `,
        'lib/board-shape.tsx': `
          export function BoardShape() {
            return <board width="40mm" height="25mm" />;
          }
        `,
      });

      const geometryFile = createGeometryFile('main.tsx');
      await worker.canHandle(geometryFile);
      const dependencies = await worker.getDependencies(geometryFile);

      expect(dependencies).toContain('/builds/test/main.tsx');
      expect(dependencies).toContain('/builds/test/lib/board-shell.tsx');
      expect(dependencies).toContain('/builds/test/lib/board-shape.tsx');
    });
  });

  describe('getParameters', () => {
    it('returns an empty parameter schema for circuit projects', async () => {
      const { defaultParameters, jsonSchema } = await getParameters(
        {
          'main.tsx': `
            circuit.add(<board width="20mm" height="20mm" />);
          `,
        },
        'main.tsx',
      );

      expect(defaultParameters).toEqual({});
      expect(jsonSchema).toEqual({
        type: 'object',
        properties: {},
        additionalProperties: false,
      });
    });
  });

  describe('createGeometry', () => {
    it('creates GLTF geometry from a minimal board (TSX)', async () => {
      const result = await createGeometry(
        {
          'main.tsx': `
            circuit.add(
              <board width="50mm" height="35mm" />
            );
          `,
        },
        'main.tsx',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      if (result.success) {
        expect(result.data.length).toBeGreaterThan(0);
      }
    });

    it('creates geometry from a multi-file TSX project', async () => {
      const result = await createGeometry(
        {
          'main.tsx': `
            import { SensorBoard } from './src/sensor-board';
            circuit.add(<SensorBoard />);
          `,
          'src/sensor-board.tsx': `
            export function SensorBoard() {
              return (
                <board width="44mm" height="28mm">
                  <hole name="H1" diameter="2.4mm" pcbX={-16} pcbY={10} />
                  <hole name="H2" diameter="2.4mm" pcbX={16} pcbY={10} />
                </board>
              );
            }
          `,
        },
        'main.tsx',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
    });

    it('creates geometry from plain TS using React global APIs', async () => {
      const result = await createGeometry(
        {
          'main.ts': `
            const boardElement = React.createElement('board', {
              width: '30mm',
              height: '22mm',
            });
            circuit.add(boardElement);
          `,
        },
        'main.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
    });

    it('returns errors for syntax failures', async () => {
      const result = await createGeometry(
        {
          'main.tsx': `
            circuit.add(
              <board width="20mm" height="20mm">
            );
          `,
        },
        'main.tsx',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.issues[0]?.severity).toBe('error');
      }
    });

    it('returns errors when no circuit is defined', async () => {
      const result = await createGeometry(
        {
          'main.tsx': `
            export const note = 'No circuit added';
          `,
        },
        'main.tsx',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0]?.message).toMatch(/circuit|root|children/i);
      }
    });
  });

  describe('exportGeometry', () => {
    it('exports GLB after geometry computation', async () => {
      const worker = await createWorker({
        'main.tsx': `
          circuit.add(
            <board width="40mm" height="25mm" />
          );
        `,
      });

      await worker.createGeometry({ file: createGeometryFile('main.tsx'), parameters: {} });
      const exportResult = await worker.exportGeometry('glb');

      expect(exportResult.success).toBe(true);
      if (exportResult.success) {
        expect(exportResult.data).toHaveLength(1);
        expect(exportResult.data[0]?.name).toBe('model.glb');
        expect(exportResult.data[0]?.bytes.length).toBeGreaterThan(0);
      }
    });

    it('exports GLTF payloads for the gltf format', async () => {
      const worker = await createWorker({
        'main.tsx': `
          circuit.add(
            <board width="38mm" height="20mm" />
          );
        `,
      });

      await worker.createGeometry({ file: createGeometryFile('main.tsx'), parameters: {} });
      const exportResult = await worker.exportGeometry('gltf');

      expect(exportResult.success).toBe(true);
      if (exportResult.success) {
        expect(exportResult.data[0]?.name).toBe('model.gltf');
        expect(exportResult.data[0]?.bytes.length).toBeGreaterThan(0);
      }
    });

    it('returns an error for unsupported export formats', async () => {
      const worker = await createWorker({
        'main.tsx': `
          circuit.add(
            <board width="40mm" height="25mm" />
          );
        `,
      });

      await worker.createGeometry({ file: createGeometryFile('main.tsx'), parameters: {} });
      const exportResult = await worker.exportGeometry('step');

      expect(exportResult.success).toBe(false);
      if (!exportResult.success) {
        expect(exportResult.issues[0]?.message).toContain("Use 'glb' or 'gltf'");
      }
    });
  });
});
