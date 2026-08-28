// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  KERNEL_MODULES_KEY,
  isRecordObject,
  getModuleRegistry,
  createKernelModuleShim,
  extractDefaultParameters,
  toVmEntryPath,
  convertRawIssuesToKernelIssues,
  enrichIssueLocation,
  loadBinaryFile,
} from '#kernels/kernel-module-helpers.js';
import type { KernelIssue } from '#types/runtime.types.js';

describe('isRecordObject', () => {
  it('should return true for plain objects', () => {
    expect(isRecordObject({})).toBe(true);
    expect(isRecordObject({ a: 1 })).toBe(true);
  });

  it('should return false for arrays', () => {
    expect(isRecordObject([])).toBe(false);
    expect(isRecordObject([1, 2])).toBe(false);
  });

  it('should return false for null and primitives', () => {
    expect(isRecordObject(null)).toBe(false);
    expect(isRecordObject(undefined)).toBe(false);
    expect(isRecordObject(42)).toBe(false);
    expect(isRecordObject('string')).toBe(false);
  });
});

describe('getModuleRegistry', () => {
  it('should return a Map', () => {
    const registry = getModuleRegistry();
    expect(registry).toBeInstanceOf(Map);
  });

  it('should return the same instance on repeated calls', () => {
    const a = getModuleRegistry();
    const b = getModuleRegistry();
    expect(a).toBe(b);
  });

  it('should store the registry on globalThis', () => {
    const registry = getModuleRegistry();
    expect((globalThis as Record<string, unknown>)[KERNEL_MODULES_KEY]).toBe(registry);
  });
});

describe('createKernelModuleShim', () => {
  it('preserves public export names as local bindings for readable runtime diagnostics', () => {
    const code = createKernelModuleShim({
      moduleExpression: 'globalThis.__testModule',
      exports: {
        primitives: {},
        transforms: {},
      },
    });

    expect(code).toContain('const primitives = __mod["primitives"];');
    expect(code).toContain('export { primitives };');
    expect(code).toContain('const transforms = __mod["transforms"];');
    expect(code).toContain('export { transforms };');
    expect(code).not.toContain('__kernel_export');
  });

  it('uses a generated local binding when the export name cannot be a safe local identifier', () => {
    const code = createKernelModuleShim({
      moduleExpression: 'globalThis.__testModule',
      exports: {
        class: {},
      },
    });

    expect(code).toContain('const __kernel_export_0 = __mod["class"];');
    expect(code).toContain('export { __kernel_export_0 as class };');
  });
});

describe('extractDefaultParameters', () => {
  it('should extract defaultParams from a module', () => {
    const result = extractDefaultParameters({ defaultParams: { width: 10 } });
    expect(result).toEqual({ width: 10 });
  });

  it('should extract defaultParameters from a module', () => {
    const result = extractDefaultParameters({ defaultParameters: { height: 20 } });
    expect(result).toEqual({ height: 20 });
  });

  it('should prefer defaultParams over defaultParameters', () => {
    const result = extractDefaultParameters({
      defaultParams: { a: 1 },
      defaultParameters: { b: 2 },
    });
    expect(result).toEqual({ a: 1 });
  });

  it('should return empty object for non-record module', () => {
    expect(extractDefaultParameters(null)).toEqual({});
    expect(extractDefaultParameters(undefined)).toEqual({});
    expect(extractDefaultParameters(42)).toEqual({});
  });

  it('should return empty object when params are not a record', () => {
    expect(extractDefaultParameters({ defaultParams: 'not-a-record' })).toEqual({});
    expect(extractDefaultParameters({ defaultParams: [1, 2] })).toEqual({});
  });
});

describe('toVmEntryPath', () => {
  it('converts a canonical local path to the VM entry spelling', () => {
    expect(toVmEntryPath('src/main.ts')).toBe('src/main.ts');
  });

  it('rejects traversal above the virtual root', () => {
    expect(() => toVmEntryPath('../secret.ts')).toThrow('escapes');
  });
});

describe('convertRawIssuesToKernelIssues', () => {
  it('should convert raw issues to KernelIssue with fallback location', () => {
    const raw = [{ message: 'syntax error', severity: 'error' }];
    const result = convertRawIssuesToKernelIssues(raw, 'main.ts');
    expect(result).toEqual([
      {
        code: 'UNKNOWN',
        message: 'syntax error',
        severity: 'error',
        type: 'runtime',
        location: { fileName: 'main.ts', startLineNumber: 1, startColumn: 1 },
      },
    ]);
  });

  it('should normalize warning severity', () => {
    const raw = [{ message: 'deprecated', severity: 'warning' }];
    const result = convertRawIssuesToKernelIssues(raw, 'main.ts');
    expect(result[0]!.severity).toBe('warning');
  });

  it('should preserve existing location', () => {
    const location = { fileName: 'other.ts', startLineNumber: 5, startColumn: 3 };
    const raw = [{ message: 'error', severity: 'error', location }];
    const result = convertRawIssuesToKernelIssues(raw, 'main.ts');
    expect(result[0]!.location).toEqual(location);
  });

  it('should validate issue codes without legacy alias rewriting', () => {
    const legacyGeometryCode = `JSCAD_${'GEOMETRY'}_INVALID`;
    const result = convertRawIssuesToKernelIssues(
      [
        { message: 'generic geometry issue', severity: 'warning', code: 'GEOMETRY_INVALID' },
        { message: 'legacy provider-specific issue', severity: 'warning', code: legacyGeometryCode },
      ],
      'main.ts',
    );

    expect(result.map((issue) => issue.code)).toEqual(['GEOMETRY_INVALID', 'UNKNOWN']);
  });
});

describe('enrichIssueLocation', () => {
  it('should add fallback location when missing', () => {
    const issues: KernelIssue[] = [{ message: 'oops', code: 'RUNTIME', type: 'runtime', severity: 'error' }];
    const result = enrichIssueLocation(issues, 'fallback.ts');
    expect(result[0]!.location).toEqual({
      fileName: 'fallback.ts',
      startLineNumber: 1,
      startColumn: 1,
    });
  });

  it('should preserve existing location', () => {
    const location = { fileName: 'original.ts', startLineNumber: 10, startColumn: 5 };
    const issues: KernelIssue[] = [{ message: 'oops', code: 'RUNTIME', type: 'runtime', severity: 'error', location }];
    const result = enrichIssueLocation(issues, 'fallback.ts');
    expect(result[0]!.location).toEqual(location);
  });
});

describe('loadBinaryFile', () => {
  it('should load a file via file: URL in Node.js', async () => {
    const result = await loadBinaryFile(new URL('kernel-module-helpers.test.ts', import.meta.url).href);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result!.byteLength).toBeGreaterThan(0);
  });

  it('should return undefined for a non-existent file: URL', async () => {
    const result = await loadBinaryFile('file:///nonexistent/path/font.ttf');
    expect(result).toBeUndefined();
  });

  it('should return undefined for an unreachable HTTP URL', async () => {
    const result = await loadBinaryFile('http://127.0.0.1:1/nonexistent.ttf');
    expect(result).toBeUndefined();
  });
});
