// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- test fixtures use file paths as object keys */
/* eslint-disable import-x/first -- vi.mock must run before importing kernel module */
/* eslint-disable import-x/order -- grouped mock bootstrap for vi.hoisted */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type WorkerMockState = {
  hasCircuit: boolean;
  entrypoint?: string;
  fsMap: Record<string, string>;
};

type WorkerMockApi = {
  executeWithFsMap: ReturnType<typeof vi.fn>;
  renderUntilSettled: ReturnType<typeof vi.fn>;
  getCircuitJson: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
};

const hoisted = vi.hoisted(() => {
  const workerStates: WorkerMockState[] = [];

  const createCircuitWebWorker = vi.fn(async () => {
    const state: WorkerMockState = {
      hasCircuit: false,
      fsMap: {},
    };
    workerStates.push(state);

    const worker: WorkerMockApi = {
      executeWithFsMap: vi.fn(async (options: { entrypoint?: string; fsMap: Record<string, string> }) => {
        state.entrypoint = options.entrypoint;
        state.fsMap = options.fsMap;

        const entrypoint = options.entrypoint ?? '';
        const entryCode = options.fsMap[entrypoint] ?? '';
        if (entryCode.includes('SYNTAX_ERROR_MARKER')) {
          throw new Error('Unexpected token');
        }

        state.hasCircuit = entryCode.includes('circuit.add');
      }),
      renderUntilSettled: vi.fn(async () => {
        if (!state.hasCircuit) {
          throw new Error('Root circuit has no children');
        }
      }),
      getCircuitJson: vi.fn(async () => [{ type: 'pcb_board', sourceFile: state.entrypoint ?? 'main.tsx' }]),
      kill: vi.fn(async () => undefined),
    };

    return worker;
  });

  const convertCircuitJsonToGltf = vi.fn(async () => new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x01, 0x00, 0x00, 0x00]));

  return {
    workerStates,
    createCircuitWebWorker,
    convertCircuitJsonToGltf,
  };
});

vi.mock('@tscircuit/eval/worker', () => ({
  createCircuitWebWorker: hoisted.createCircuitWebWorker,
}));

vi.mock('circuit-json-to-gltf', () => ({
  convertCircuitJsonToGltf: hoisted.convertCircuitJsonToGltf,
}));

import tscircuitKernel from '#kernels/tscircuit/tscircuit.kernel.js';
import { createGeometryFile, createTestGeometry, createTestWorker } from '#testing/kernel-testing.utils.js';

const tscircuitExtensions = ['tsx', 'jsx', 'ts', 'js'];

const createWorker = async (
  files: Record<string, string>,
  options?: { includeModels?: boolean; partsEngineDisabled?: boolean },
): ReturnType<typeof createTestWorker> =>
  createTestWorker(tscircuitKernel, files, {
    extensions: tscircuitExtensions,
    workerOptions: {
      includeModels: options?.includeModels ?? false,
      partsEngineDisabled: options?.partsEngineDisabled ?? true,
    },
  });

const getParameters = async (
  files: Record<string, string>,
  mainFile: string,
): Promise<{ jsonSchema: unknown; defaultParameters: Record<string, unknown> }> => {
  const worker = await createWorker(files);
  const result = await worker.getParameters(createGeometryFile(mainFile));
  expect(result.success).toBe(true);
  if (!result.success) {
    throw new Error('Parameter extraction failed');
  }

  return result.data;
};

const createGeometry = async (files: Record<string, string>, mainFile: string): ReturnType<typeof createTestGeometry> =>
  createTestGeometry({
    definition: tscircuitKernel,
    files,
    mainFile,
    options: {
      extensions: tscircuitExtensions,
      workerOptions: {
        includeModels: false,
        partsEngineDisabled: true,
      },
    },
  });

beforeEach(() => {
  hoisted.workerStates.length = 0;
  hoisted.createCircuitWebWorker.mockClear();
  hoisted.convertCircuitJsonToGltf.mockClear();
});

describe('TscircuitKernel', () => {
  describe('initialize', () => {
    it('creates a CircuitWebWorker with configured runtime options', async () => {
      const worker = await createWorker(
        {
          'main.tsx': 'circuit.add(<board width="20mm" height="10mm" />);',
        },
        { partsEngineDisabled: false, includeModels: true },
      );
      await worker.canHandle(createGeometryFile('main.tsx'));

      expect(hoisted.createCircuitWebWorker).toHaveBeenCalledWith(
        expect.objectContaining({
          enableFetchProxy: true,
          verbose: false,
          projectConfig: { partsEngineDisabled: false },
        }),
      );
    });
  });

  describe('canHandle', () => {
    it('handles TSX with global circuit usage', async () => {
      const worker = await createWorker({
        'main.tsx': 'circuit.add(<board width="30mm" height="20mm" />);',
      });

      const result = await worker.canHandle(createGeometryFile('main.tsx'));
      expect(result).toBe(true);
    });

    it('handles TS with @tscircuit/core imports', async () => {
      const worker = await createWorker({
        'main.ts': `import { RootCircuit } from '@tscircuit/core'; export default new RootCircuit();`,
      });

      const result = await worker.canHandle(createGeometryFile('main.ts'));
      expect(result).toBe(true);
    });

    it('handles TS with @tsci namespace imports', async () => {
      const worker = await createWorker({
        'main.ts': `import Example from '@tsci/example.package'; export default Example;`,
      });

      const result = await worker.canHandle(createGeometryFile('main.ts'));
      expect(result).toBe(true);
    });

    it('does not handle unrelated TSX code', async () => {
      const worker = await createWorker({
        'main.tsx': `export default function App() { return <div>Hello</div>; }`,
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

  describe('getParameters', () => {
    it('returns an empty parameter schema for circuit projects', async () => {
      const { defaultParameters, jsonSchema } = await getParameters(
        {
          'main.tsx': 'circuit.add(<board width="20mm" height="20mm" />);',
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
    it('creates geometry from a minimal TSX board', async () => {
      const result = await createGeometry(
        {
          'main.tsx': 'circuit.add(<board width="50mm" height="35mm" />);',
        },
        'main.tsx',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.format).toBe('gltf');
        expect(result.data[0]?.content.length).toBeGreaterThan(0);
      }
    });

    it('passes multi-file fsMap and relative entrypoint to the worker runtime', async () => {
      await createGeometry(
        {
          'main.tsx': `import { SensorBoard } from './src/sensor-board'; circuit.add(<SensorBoard />);`,
          'src/sensor-board.tsx': `export function SensorBoard() { return <board width="44mm" height="28mm" />; }`,
        },
        'main.tsx',
      );

      expect(hoisted.workerStates).toHaveLength(1);
      const workerState = hoisted.workerStates[0];
      expect(workerState?.entrypoint).toBe('main.tsx');
      expect(workerState?.fsMap['main.tsx']).toContain('SensorBoard');
      expect(workerState?.fsMap['src/sensor-board.tsx']).toContain('board width');
    });

    it('returns errors for syntax failures', async () => {
      const result = await createGeometry(
        {
          'main.tsx': 'SYNTAX_ERROR_MARKER',
        },
        'main.tsx',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.issues[0]?.message).toContain('Unexpected token');
      }
    });

    it('returns errors when no circuit is defined', async () => {
      const result = await createGeometry(
        {
          'main.tsx': `export const note = 'No circuit added';`,
        },
        'main.tsx',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0]?.message).toMatch(/root circuit has no children/i);
      }
    });
  });

  describe('exportGeometry', () => {
    it('exports GLB after geometry computation', async () => {
      const worker = await createWorker({
        'main.tsx': 'circuit.add(<board width="40mm" height="25mm" />);',
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
        'main.tsx': 'circuit.add(<board width="38mm" height="20mm" />);',
      });

      await worker.createGeometry({ file: createGeometryFile('main.tsx'), parameters: {} });
      const exportResult = await worker.exportGeometry('gltf');

      expect(exportResult.success).toBe(true);
      if (exportResult.success) {
        expect(exportResult.data[0]?.name).toBe('model.gltf');
        expect(exportResult.data[0]?.bytes.length).toBeGreaterThan(0);
      }

      expect(hoisted.convertCircuitJsonToGltf).toHaveBeenCalled();
    });

    it('returns an error for unsupported export formats', async () => {
      const worker = await createWorker({
        'main.tsx': 'circuit.add(<board width="40mm" height="25mm" />);',
      });

      await worker.createGeometry({ file: createGeometryFile('main.tsx'), parameters: {} });
      const exportResult = await worker.exportGeometry('step');

      expect(exportResult.success).toBe(false);
      if (!exportResult.success) {
        expect(exportResult.issues[0]?.message).toContain("supported by tscircuit");
      }
    });
  });
});
