import { describe, it, expect } from 'vitest';
import { parse } from 'es-module-lexer/js';

describe('es-module-lexer integration', () => {
  it('should parse named imports', () => {
    const code = `import { draw, something } from 'replicad';`;
    const [imports] = parse(code);
    expect(imports).toHaveLength(1);
    expect(imports[0]!.n).toBe('replicad');
  });

  it('should parse default imports', () => {
    const code = `import React from 'react';`;
    const [imports] = parse(code);
    expect(imports).toHaveLength(1);
    expect(imports[0]!.n).toBe('react');
  });

  it('should parse namespace imports', () => {
    const code = `import * as R from 'replicad';`;
    const [imports] = parse(code);
    expect(imports).toHaveLength(1);
    expect(imports[0]!.n).toBe('replicad');
  });

  it('should parse dynamic imports', () => {
    const code = `const mod = await import('lodash');`;
    const [imports] = parse(code);
    expect(imports).toHaveLength(1);
    expect(imports[0]!.n).toBe('lodash');
    expect(imports[0]!.d).toBeGreaterThan(-1); // Dynamic import indicator
  });

  it('should parse export from', () => {
    const code = `export { foo } from './utils';`;
    const [imports] = parse(code);
    expect(imports).toHaveLength(1);
    expect(imports[0]!.n).toBe('./utils');
  });

  it('should parse export * from', () => {
    const code = `export * from './lib';`;
    const [imports] = parse(code);
    expect(imports).toHaveLength(1);
    expect(imports[0]!.n).toBe('./lib');
  });

  it('should return correct character offsets', () => {
    const code = `import { x } from 'test-module';`;
    const [imports] = parse(code);
    const specifier = code.slice(imports[0]!.s, imports[0]!.e);
    expect(specifier).toBe('test-module');
  });

  it('should parse relative imports', () => {
    const code = `import { helper } from './utils/helper';`;
    const [imports] = parse(code);
    expect(imports).toHaveLength(1);
    expect(imports[0]!.n).toBe('./utils/helper');
  });

  it('should parse scoped package imports', () => {
    const code = `import { modeling } from '@jscad/modeling';`;
    const [imports] = parse(code);
    expect(imports).toHaveLength(1);
    expect(imports[0]!.n).toBe('@jscad/modeling');
  });

  it('should parse CDN URL imports', () => {
    const code = `import _ from 'https://esm.sh/lodash';`;
    const [imports] = parse(code);
    expect(imports).toHaveLength(1);
    expect(imports[0]!.n).toBe('https://esm.sh/lodash');
  });

  it('should handle multiple imports', () => {
    const code = `
      import { draw } from 'replicad';
      import { z } from 'zod';
      import { helper } from './utils';
    `;
    const [imports] = parse(code);
    expect(imports).toHaveLength(3);
    expect(imports[0]!.n).toBe('replicad');
    expect(imports[1]!.n).toBe('zod');
    expect(imports[2]!.n).toBe('./utils');
  });

  it('should correctly identify cursor position within specifier', () => {
    const code = `import { x } from 'replicad';`;
    const [imports] = parse(code);

    // Cursor at start of 'replicad'
    const specifierStart = imports[0]!.s;
    const specifierEnd = imports[0]!.e;

    // Cursor position 19 should be within 'replicad' (0-indexed)
    // 'import { x } from ' = 18 chars, then 'replicad' starts
    expect(specifierStart).toBeLessThanOrEqual(19);
    expect(specifierEnd).toBeGreaterThanOrEqual(19);
  });
});

describe('import position detection', () => {
  it('should detect if cursor is on an import specifier', () => {
    const code = `import { draw } from 'replicad';`;
    const [imports] = parse(code);
    const imp = imports[0]!;

    // Check various cursor positions
    const onSpecifier = (offset: number): boolean => offset >= imp.s && offset <= imp.e;

    // Position inside 'replicad'
    expect(onSpecifier(22)).toBe(true); // 'r' of replicad
    expect(onSpecifier(28)).toBe(true); // 'd' of replicad

    // Position outside specifier
    expect(onSpecifier(0)).toBe(false); // Start of line
    expect(onSpecifier(10)).toBe(false); // 'draw'
  });
});
