// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FileSystemManager } from '#filesystem-manager.js';
import { KclUtilities } from '#kcl-utils.js';
import type { KernelFileSystem } from '@taucad/runtime/kernel';

const memoryFs = (files: Map<string, string>): KernelFileSystem =>
  ({
    async readFile(path: string) {
      const hit = files.get(path);
      if (hit === undefined) {
        throw new Error(`ENOENT ${path}`);
      }

      return new TextEncoder().encode(hit);
    },
    async exists(path: string) {
      return files.has(path);
    },
    async readdir() {
      return ['main.kcl'];
    },
  }) as unknown as KernelFileSystem;

describe('KclUtilities execution normalization', () => {
  it.each(['1.0', '2.0', '3.0'])('should execute stable KCL %s with explicit units', async (version) => {
    const source = `@settings(defaultLengthUnit = mm, kclVersion = ${version})
length = 12mm
derived = length + 2cm
angle = 30deg
`;
    const fs = new FileSystemManager(memoryFs(new Map([['/main.kcl', source]])));
    const utils = new KclUtilities({ baseUrl: 'ws://fake.example/modeling-commands', fileSystemManager: fs });
    try {
      await utils.initializeWasm();
      const { program, errors } = await utils.parseKcl(source);
      expect(errors).toEqual([]);
      const outcome = await utils.executeMockKcl(program, '/main.kcl');

      expect(outcome.errors).toEqual([]);
      expect(outcome.variables['derived']).toMatchObject({
        value: 32,
        ty: { type: 'Known', value: { type: 'Length', value: 'mm' } },
      });
      expect(outcome.variables['angle']).toMatchObject({
        value: 30,
        ty: { type: 'Known', value: { type: 'Angle', value: 'degrees' } },
      });
    } finally {
      await utils.cleanup();
    }
  });

  it('should apply stable KCL 3.0 early-return semantics', async () => {
    const source = `@settings(defaultLengthUnit = mm, kclVersion = 3.0)
fn dimension() {
  return 12mm
  fail("Execution continued after return")
}
length = dimension()
`;
    const fs = new FileSystemManager(memoryFs(new Map([['/main.kcl', source]])));
    const utils = new KclUtilities({ baseUrl: 'ws://fake.example/modeling-commands', fileSystemManager: fs });
    try {
      await utils.initializeWasm();
      const { program, errors } = await utils.parseKcl(source);
      expect(errors).toEqual([]);
      const outcome = await utils.executeMockKcl(program, '/main.kcl');

      expect(outcome.errors).toEqual([]);
      expect(outcome.variables['length']).toMatchObject({
        value: 12,
        ty: { type: 'Known', value: { type: 'Length', value: 'mm' } },
      });
    } finally {
      await utils.cleanup();
    }
  });

  it('partitions issues into errors vs warnings on executeMockKcl', async () => {
    const fs = new FileSystemManager(memoryFs(new Map([['/main.kcl', 'x = 1\n']])));
    const utils = new KclUtilities({ baseUrl: 'ws://fake.example/modeling-commands', fileSystemManager: fs });
    await utils.initializeWasm();
    const { program } = await utils.parseKcl('x = 1\n');
    const outcome = await utils.executeMockKcl(program, '/main.kcl');

    expect(outcome.warnings).toBeDefined();
    expect(Array.isArray(outcome.errors)).toBe(true);
    expect(Array.isArray(outcome.warnings)).toBe(true);
  });

  it('preserves KCL numeric unit types in mock execution variables', async () => {
    const source = `@settings(defaultLengthUnit = mm, kclVersion = 1.0)
length = 12mm
angle = 30deg
count = 3_
derived = length + 2cm
area = 2mm * 3mm
bare = 7
`;
    const fs = new FileSystemManager(memoryFs(new Map([['/main.kcl', source]])));
    const utils = new KclUtilities({ baseUrl: 'ws://fake.example/modeling-commands', fileSystemManager: fs });
    await utils.initializeWasm();
    const { program } = await utils.parseKcl(source);
    const { variables } = await utils.executeMockKcl(program, '/main.kcl');

    expect(variables['length']).toMatchObject({ ty: { type: 'Known', value: { type: 'Length', value: 'mm' } } });
    expect(variables['angle']).toMatchObject({ ty: { type: 'Known', value: { type: 'Angle', value: 'degrees' } } });
    expect(variables['count']).toMatchObject({ ty: { type: 'Known', value: { type: 'Count' } } });
    expect(variables['derived']).toMatchObject({
      value: 32,
      ty: { type: 'Known', value: { type: 'Length', value: 'mm' } },
    });
    expect(variables['area']).toMatchObject({ ty: { type: 'Unknown' } });
    expect(variables['bare']).toMatchObject({ ty: { type: 'Default', value: { len: 'mm', angle: 'degrees' } } });
  });
});

describe.each(['1.0', '2.0', '3.0'])('KclUtilities.injectParametersIntoProgram in KCL %s', (version) => {
  const executeWithParameters = async (source: string, parameters: Record<string, unknown>) => {
    const fs = new FileSystemManager(memoryFs(new Map([['/main.kcl', source]])));
    const utils = new KclUtilities({ baseUrl: 'ws://fake.example/modeling-commands', fileSystemManager: fs });
    await utils.initializeWasm();
    const { program } = await utils.parseKcl(source);
    const { variables } = await utils.executeMockKcl(
      KclUtilities.injectParametersIntoProgram(program, parameters),
      '/main.kcl',
    );
    return variables;
  };

  const source = `@settings(defaultLengthUnit = mm, kclVersion = ${version})
thickness = 0.25in
angle = 30deg
bare = 7
label = "a"
enabled = true
`;

  it('should keep the declared unit suffix when the unchanged value is written back', async () => {
    const variables = await executeWithParameters(source, { thickness: 0.25, angle: 30, bare: 7 });

    expect(variables['thickness']).toMatchObject({
      value: 0.25,
      ty: { type: 'Known', value: { type: 'Length', value: 'in' } },
    });
    expect(variables['angle']).toMatchObject({
      value: 30,
      ty: { type: 'Known', value: { type: 'Angle', value: 'degrees' } },
    });
    expect(variables['bare']).toMatchObject({ value: 7, ty: { type: 'Default', value: { len: 'mm' } } });
  });

  it('should keep the declared unit suffix when a value is overridden', async () => {
    const variables = await executeWithParameters(source, {
      thickness: 0.5,
      angle: 45,
      bare: 9,
      label: 'b "quoted"',
      enabled: false,
    });

    expect(variables['thickness']).toMatchObject({
      value: 0.5,
      ty: { type: 'Known', value: { type: 'Length', value: 'in' } },
    });
    expect(variables['angle']).toMatchObject({
      value: 45,
      ty: { type: 'Known', value: { type: 'Angle', value: 'degrees' } },
    });
    expect(variables['bare']).toMatchObject({ value: 9, ty: { type: 'Default', value: { len: 'mm' } } });
    expect(variables['label']).toMatchObject({ type: 'String', value: 'b "quoted"' });
    expect(variables['enabled']).toMatchObject({ type: 'Bool', value: false });
  });
});
