// @vitest-environment node
/**
 * PoC tests for minification-resilient stack trace function names.
 *
 * Validates that V8 reads `Function.prototype.name` (set via `named()` helper)
 * for anonymous function expressions and arrow functions in `Error.stack` traces.
 * Named function declarations use the parsed name instead, which minifiers mangle.
 *
 * This is the mechanism behind esbuild's `__name` helper and the basis for
 * our bundler-agnostic fix: convert key framework functions to anonymous expressions
 * and pin their `.name` via `named()` -- a string literal that survives any minifier.
 */

import { describe, it, expect } from 'vitest';
import { SourceMapGenerator } from 'source-map-js';
import {
  parseStackTrace,
  preserveExportNames,
  demangleStackFrames,
  createFrameClassifier,
  classifyLibraryFrames,
} from '#framework/error-enrichment.js';
import { named } from '#framework/named.js';

describe('Minification-resilient function naming', () => {
  it('source-maps Node stack paths when the executor reports a file URL', () => {
    const sourceMap = new SourceMapGenerator();
    sourceMap.addMapping({
      generated: { line: 10, column: 2 },
      original: { line: 6, column: 4 },
      source: 'vfs:main.ts',
      name: 'main',
    });
    const error = new Error('test');
    error.stack = 'Error: test\n    at main (/tmp/taucad-exec.mjs:10:3)';

    expect(
      parseStackTrace(error, {
        sourceMap: sourceMap.toString(),
        lastEntryName: 'file:///tmp/taucad-exec.mjs',
      }),
    ).toEqual([
      {
        functionName: 'main',
        fileName: 'main.ts',
        lineNumber: 6,
        columnNumber: 5,
        context: 'user',
      },
    ]);
  });

  describe('named() preserves .name for anonymous expressions', () => {
    it('should use the annotated name in stack traces for anonymous function expressions', () => {
      const a = named('runMainRaw', function () {
        throw new Error('test');
      });

      try {
        a();
      } catch (error) {
        const frames = parseStackTrace(error);
        const frame = frames.find((f) => f.functionName === 'runMainRaw');
        expect(frame, 'Expected "runMainRaw" in stack trace after named()').toBeDefined();
      }
    });

    it('should show the variable-inferred name without annotation (simulates mangling)', () => {
      const a = function () {
        throw new Error('test');
      };

      try {
        a();
      } catch (error) {
        const frames = parseStackTrace(error);
        const frame = frames.find((f) => f.functionName === 'a');
        expect(frame, 'Expected "a" (mangled-like name) in stack trace without annotation').toBeDefined();
      }
    });

    it('should use the annotated name for arrow functions', () => {
      const b = named('kernelHandler', () => {
        throw new Error('test');
      });

      try {
        b();
      } catch (error) {
        const frames = parseStackTrace(error);
        const frame = frames.find((f) => f.functionName === 'kernelHandler');
        expect(frame, 'Expected "kernelHandler" in stack trace for annotated arrow function').toBeDefined();
      }
    });

    it('should use the annotated name for async function expressions', async () => {
      const c = named('runMain', async function () {
        throw new Error('test');
      });

      try {
        await c();
      } catch (error) {
        const frames = parseStackTrace(error);
        const frame = frames.find((f) => f.functionName === 'runMain');
        expect(frame, 'Expected "runMain" in stack trace for annotated async expression').toBeDefined();
      }
    });
  });

  describe('Async middleware chain simulation', () => {
    it('should preserve annotated names through an async middleware chain', async () => {
      type Handler = (input: string) => Promise<string>;

      const innerHandler: Handler = named('kernelHandler', async function (_input: string) {
        throw new Error('kernel error');
      });

      let chain: Handler = innerHandler;

      const middlewareNames = ['gltf-coordinate-transform', 'gltf-edge-detection'];

      for (const name of middlewareNames) {
        const inner = chain;
        chain = named(`middleware(${name})`, async function (input: string) {
          return inner(input);
        });
      }

      try {
        await chain('test');
      } catch (error) {
        const frames = parseStackTrace(error);
        const names = frames.map((f) => f.functionName);

        expect(names).toContain('kernelHandler');
        expect(names).toContain('middleware(gltf-edge-detection)');
        expect(names).toContain('middleware(gltf-coordinate-transform)');
      }
    });
  });

  describe('preserveExportNames restores function .name and builds name map + export set', () => {
    it('should set .name on exported functions and return mangled → original map + export names', () => {
      const mr = function () {
        throw new Error('test');
      };

      expect(mr.name).toBe('mr');
      const { mangledToOriginal, exportNames } = preserveExportNames({
        basicFaceExtrusion: mr,
      } as Record<string, unknown>);
      expect(mr.name).toBe('basicFaceExtrusion');
      expect(mangledToOriginal.get('mr')).toBe('basicFaceExtrusion');
      expect(exportNames.has('basicFaceExtrusion')).toBe(true);
    });

    it('should restore standalone function names in V8 stack traces via .name', () => {
      const mr = function () {
        throw new Error('test');
      };

      preserveExportNames({ basicFaceExtrusion: mr } as Record<string, unknown>);

      try {
        mr();
        expect.fail('Should have thrown');
      } catch (error) {
        const frames = parseStackTrace(error);
        const frame = frames.find((f) => f.functionName === 'basicFaceExtrusion');
        expect(frame, 'Expected "basicFaceExtrusion" in stack trace').toBeDefined();
      }
    });

    it('should include unchanged names in exportNames but not in mangledToOriginal', () => {
      const myFunction = named('myFunction', () => 0);
      const { mangledToOriginal, exportNames } = preserveExportNames({ myFunction } as Record<string, unknown>);
      expect(myFunction.name).toBe('myFunction');
      expect(mangledToOriginal.size).toBe(0);
      expect(exportNames.has('myFunction')).toBe(true);
    });

    it('should skip non-function exports', () => {
      const { mangledToOriginal, exportNames } = preserveExportNames({
        value: 42,
        name: 'test',
        object: { nested: true },
      });
      expect(mangledToOriginal.size).toBe(0);
      expect(exportNames.size).toBe(0);
    });

    it('should handle multiple exports in a single call', () => {
      /* oxlint-disable @typescript-eslint/no-extraneous-class, no-empty-function, unicorn-js/prevent-abbreviations -- simulating minified exports */
      /* eslint-disable @typescript-eslint/naming-convention -- simulating minified export names */
      class a {}
      class b {}
      const c = function () {};
      /* oxlint-enable @typescript-eslint/no-extraneous-class, no-empty-function, unicorn-js/prevent-abbreviations */

      const { mangledToOriginal, exportNames } = preserveExportNames({
        Sketch: a,
        Blueprint: b,
        makeSolid: c,
      } as Record<string, unknown>);
      /* eslint-enable @typescript-eslint/naming-convention -- end minified export simulation */
      expect(a.name).toBe('Sketch');
      expect(b.name).toBe('Blueprint');
      expect(c.name).toBe('makeSolid');
      expect(mangledToOriginal.get('a')).toBe('Sketch');
      expect(mangledToOriginal.get('b')).toBe('Blueprint');
      expect(mangledToOriginal.get('c')).toBe('makeSolid');
      expect(exportNames).toEqual(new Set(['Sketch', 'Blueprint', 'makeSolid']));
    });
  });

  describe('demangleStackFrames fixes class type prefixes in parsed frames', () => {
    it('should replace mangled class type prefix with original name', () => {
      /* oxlint-disable unicorn-js/prevent-abbreviations, new-cap -- simulating minified class name */
      /* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/explicit-member-accessibility -- simulating minified class */
      class e {
        extrude() {
          throw new Error('test');
        }
      }
      /* eslint-enable @typescript-eslint/explicit-member-accessibility -- end minified class simulation */

      const { mangledToOriginal } = preserveExportNames({ Sketch: e } as Record<string, unknown>);
      /* eslint-enable @typescript-eslint/naming-convention -- end minified class simulation */
      expect(mangledToOriginal.get('e')).toBe('Sketch');

      const instance = new e();
      /* oxlint-enable unicorn-js/prevent-abbreviations, new-cap */
      try {
        instance.extrude();
        expect.fail('Should have thrown');
      } catch (error) {
        const frames = parseStackTrace(error);
        const demangled = demangleStackFrames(frames, mangledToOriginal);
        const frame = demangled.find((f) => f.functionName?.includes('extrude'));
        // V8 may or may not include the type prefix depending on calling context.
        // In production bundles it shows `e.extrude` → demangled to `Sketch.extrude`.
        // In test scope it may show just `extrude`. Either is acceptable here;
        // the synthetic test below covers the demangling path exhaustively.
        expect(frame?.functionName).toMatch(/^(Sketch\.)?extrude$/);
      }
    });

    it('should replace mangled standalone function names', () => {
      const nameMap = new Map([['mr', 'basicFaceExtrusion']]);
      const frames = [
        { functionName: 'mr', fileName: 'chunk.js', lineNumber: 1, columnNumber: 1, context: 'framework' } as const,
      ];
      const demangled = demangleStackFrames(frames, nameMap);
      expect(demangled[0]!.functionName).toBe('basicFaceExtrusion');
    });

    it('should not modify frames that are not in the name map', () => {
      const nameMap = new Map([['e', 'Sketch']]);
      const frames = [
        {
          functionName: 'main',
          fileName: 'main.ts',
          lineNumber: 10,
          columnNumber: 20,
          context: 'user',
        } as const,
        {
          functionName: 'Object.createGeometry',
          fileName: 'chunk.js',
          lineNumber: 9,
          columnNumber: 3735,
          context: 'framework',
        } as const,
      ];
      const demangled = demangleStackFrames(frames, nameMap);
      expect(demangled[0]!.functionName).toBe('main');
      expect(demangled[1]!.functionName).toBe('Object.createGeometry');
    });

    it('should handle a realistic production stack trace', () => {
      const nameMap = new Map([
        ['e', 'Sketch'],
        ['mr', 'basicFaceExtrusion'],
      ]);
      const frames = [
        {
          functionName: 'Object.construct',
          fileName: 'replicad.kernel-BsXdbiOY.js',
          lineNumber: 8,
          columnNumber: 199_345,
          context: 'framework',
        } as const,
        {
          functionName: 'mr',
          fileName: 'replicad.kernel-BsXdbiOY.js',
          lineNumber: 2,
          columnNumber: 59_809,
          context: 'framework',
        } as const,
        {
          functionName: 'e.extrude',
          fileName: 'replicad.kernel-BsXdbiOY.js',
          lineNumber: 2,
          columnNumber: 63_428,
          context: 'framework',
        } as const,
        {
          functionName: 'main',
          fileName: 'main.ts',
          lineNumber: 10,
          columnNumber: 20,
          context: 'user',
        } as const,
        {
          functionName: 'runMainRaw',
          fileName: 'replicad.kernel-BsXdbiOY.js',
          lineNumber: 9,
          columnNumber: 503,
          context: 'framework',
        } as const,
      ];

      const demangled = demangleStackFrames(frames, nameMap);
      expect(demangled[0]!.functionName).toBe('Object.construct');
      expect(demangled[1]!.functionName).toBe('basicFaceExtrusion');
      expect(demangled[2]!.functionName).toBe('Sketch.extrude');
      expect(demangled[3]!.functionName).toBe('main');
      expect(demangled[4]!.functionName).toBe('runMainRaw');
    });

    it('should return frames unchanged when name map is empty', () => {
      const frames = [
        {
          functionName: 'e.extrude',
          fileName: 'chunk.js',
          lineNumber: 1,
          columnNumber: 1,
          context: 'framework',
        } as const,
      ];
      const demangled = demangleStackFrames(frames, new Map());
      expect(demangled).toEqual(frames);
    });
  });

  describe('createFrameClassifier (URL-scheme-only, deterministic)', () => {
    const classify = createFrameClassifier();

    it('should classify blob: URLs as user', () => {
      expect(classify('blob:http://localhost:3000/abc123')).toBe('user');
    });

    it('should classify data: URLs as user', () => {
      expect(classify('data:application/javascript;base64,abc')).toBe('user');
    });

    it('should classify node: URLs as runtime', () => {
      expect(classify('node:internal/vm:218:10')).toBe('runtime');
    });

    it('should classify wasm: URLs as runtime', () => {
      expect(classify('wasm://wasm/func123')).toBe('runtime');
    });

    it('should classify V8 internal frames as runtime', () => {
      expect(classify('<anonymous>')).toBe('runtime');
    });

    it('should classify production chunk URLs as framework (not user)', () => {
      expect(classify('http://localhost:3000/assets/replicad.kernel-jR6VHr38.js')).toBe('framework');
      expect(classify('http://localhost:3000/assets/kernel-runtime-worker-C6V8PyBt.js')).toBe('framework');
      expect(classify('http://localhost:3000/assets/gltf-edge-detection.middleware-DwwYp-f5.js')).toBe('framework');
    });

    it('should classify dev Vite URLs as framework (not user)', () => {
      expect(
        classify('http://localhost:3000/@fs/Users/me/tau/packages/runtime/src/kernels/replicad/replicad.kernel.ts'),
      ).toBe('framework');
      expect(classify('http://localhost:3000/@fs/Users/me/tau/node_modules/.vite/apps/ui/deps/replicad.js')).toBe(
        'framework',
      );
    });

    it('should classify resolved user source paths as framework (source map sets context to user)', () => {
      // After source map resolution, user frames get context: 'user' explicitly.
      // Raw file paths like 'main.ts' that appear before source mapping are
      // classified as 'framework' here -- the source map pass corrects them.
      expect(classify('main.ts')).toBe('framework');
    });
  });

  describe('classifyLibraryFrames (export-name-based library detection)', () => {
    const libraryExportNames = new Set(['Sketch', 'Blueprint', 'basicFaceExtrusion', 'draw', 'makeSolid']);

    it('should reclassify framework frames with matching class names as library', () => {
      const frames = [
        {
          functionName: 'Sketch.extrude',
          fileName: 'chunk.js',
          lineNumber: 2,
          columnNumber: 1,
          context: 'framework',
        } as const,
      ];
      const classified = classifyLibraryFrames(frames, libraryExportNames);
      expect(classified[0]!.context).toBe('library');
    });

    it('should reclassify framework frames with matching standalone function names as library', () => {
      const frames = [
        {
          functionName: 'basicFaceExtrusion',
          fileName: 'chunk.js',
          lineNumber: 2,
          columnNumber: 1,
          context: 'framework',
        } as const,
      ];
      const classified = classifyLibraryFrames(frames, libraryExportNames);
      expect(classified[0]!.context).toBe('library');
    });

    it('should NOT reclassify user frames', () => {
      const frames = [
        {
          functionName: 'Sketch.extrude',
          fileName: 'main.ts',
          lineNumber: 10,
          columnNumber: 6,
          context: 'user',
        } as const,
      ];
      const classified = classifyLibraryFrames(frames, libraryExportNames);
      expect(classified[0]!.context).toBe('user');
    });

    it('should NOT reclassify runtime frames', () => {
      const frames = [
        { functionName: 'draw', fileName: 'node:vm', lineNumber: 1, columnNumber: 1, context: 'runtime' } as const,
      ];
      const classified = classifyLibraryFrames(frames, libraryExportNames);
      expect(classified[0]!.context).toBe('runtime');
    });

    it('should leave framework frames that do not match any export as framework', () => {
      const frames = [
        {
          functionName: 'runMainRaw',
          fileName: 'chunk.js',
          lineNumber: 9,
          columnNumber: 503,
          context: 'framework',
        } as const,
        {
          functionName: 'Object.createGeometry',
          fileName: 'chunk.js',
          lineNumber: 9,
          columnNumber: 3762,
          context: 'framework',
        } as const,
      ];
      const classified = classifyLibraryFrames(frames, libraryExportNames);
      expect(classified[0]!.context).toBe('framework');
      expect(classified[1]!.context).toBe('framework');
    });

    it('should handle a realistic production stack trace end-to-end', () => {
      const nameMap = new Map([
        ['e', 'Sketch'],
        ['mr', 'basicFaceExtrusion'],
      ]);

      const rawFrames = [
        {
          functionName: 'Object.construct',
          fileName: 'http://localhost:3000/assets/replicad.kernel-X.js',
          lineNumber: 8,
          columnNumber: 199_345,
          context: 'framework',
        } as const,
        {
          functionName: 'mr',
          fileName: 'http://localhost:3000/assets/replicad.kernel-X.js',
          lineNumber: 2,
          columnNumber: 59_809,
          context: 'framework',
        } as const,
        {
          functionName: 'e.extrude',
          fileName: 'http://localhost:3000/assets/replicad.kernel-X.js',
          lineNumber: 2,
          columnNumber: 63_428,
          context: 'framework',
        } as const,
        { functionName: 'main', fileName: 'main.ts', lineNumber: 10, columnNumber: 6, context: 'user' } as const,
        {
          functionName: 'runMainRaw',
          fileName: 'http://localhost:3000/assets/replicad.kernel-X.js',
          lineNumber: 9,
          columnNumber: 503,
          context: 'framework',
        } as const,
        {
          functionName: 'runMain',
          fileName: 'http://localhost:3000/assets/replicad.kernel-X.js',
          lineNumber: 9,
          columnNumber: 639,
          context: 'framework',
        } as const,
        {
          functionName: 'Object.createGeometry',
          fileName: 'http://localhost:3000/assets/replicad.kernel-X.js',
          lineNumber: 9,
          columnNumber: 3762,
          context: 'framework',
        } as const,
      ];

      // Step 1 — demangle minified frame names.
      const demangled = demangleStackFrames(rawFrames, nameMap);
      expect(demangled[1]!.functionName).toBe('basicFaceExtrusion');
      expect(demangled[2]!.functionName).toBe('Sketch.extrude');

      // Step 2 — reclassify library frames as user-visible.
      const classified = classifyLibraryFrames(demangled, libraryExportNames);

      expect(classified[0]!.context).toBe('framework'); // Object.construct
      expect(classified[1]!.context).toBe('library'); // BasicFaceExtrusion
      expect(classified[2]!.context).toBe('library'); // Sketch.extrude
      expect(classified[3]!.context).toBe('user'); // Main
      expect(classified[4]!.context).toBe('framework'); // RunMainRaw
      expect(classified[5]!.context).toBe('framework'); // RunMain
      expect(classified[6]!.context).toBe('framework'); // Object.createGeometry
    });

    it('should return frames unchanged when export set is empty', () => {
      const frames = [
        {
          functionName: 'Sketch.extrude',
          fileName: 'chunk.js',
          lineNumber: 1,
          columnNumber: 1,
          context: 'framework',
        } as const,
      ];
      const classified = classifyLibraryFrames(frames, new Set());
      expect(classified).toEqual(frames);
    });
  });

  describe('parseStackTrace correctness', () => {
    it('should parse Chrome-style stack traces with function names', () => {
      const error = new Error('test');
      error.stack = `Error: test
    at runMainRaw (blob:http://localhost:3000/abc123:10:5)
    at runMain (blob:http://localhost:3000/abc123:20:3)
    at Object.createGeometry (http://localhost:3000/assets/replicad-kernel.js:9:3588)`;

      const frames = parseStackTrace(error);
      expect(frames).toHaveLength(3);
      expect(frames[0]!.functionName).toBe('runMainRaw');
      expect(frames[1]!.functionName).toBe('runMain');
      expect(frames[2]!.functionName).toBe('Object.createGeometry');
    });

    it('should keep V8 property aliases out of parenthesized file paths', () => {
      const error = new Error('test');
      error.stack = `Error: test
    at Object.get [as badKey] (/tmp/runtime-entry.mjs:10:5)`;

      expect(parseStackTrace(error)[0]).toMatchObject({
        functionName: 'Object.get [as badKey]',
        fileName: '/tmp/runtime-entry.mjs',
        lineNumber: 10,
        columnNumber: 5,
      });
    });

    it('should classify frames deterministically using URL scheme', () => {
      const classify = createFrameClassifier();
      const error = new Error('test');
      error.stack = `Error: test
    at main (blob:http://localhost:3000/abc123:10:5)
    at Sketch.extrude (http://localhost:3000/assets/replicad.kernel-X.js:2:63428)
    at runMainRaw (http://localhost:3000/assets/replicad.kernel-X.js:9:503)`;

      const frames = parseStackTrace(error, { classifyFrame: classify });
      expect(frames[0]!.context).toBe('user');
      expect(frames[1]!.context).toBe('framework');
      expect(frames[2]!.context).toBe('framework');
    });

    it('should parse production-mangled stack traces (proving the problem)', () => {
      const error = new Error('baseProfile.sketchOnPlane is not a function');
      error.stack = `Error: baseProfile.sketchOnPlane is not a function
    at main (main.ts:45:37)
    at Tm (http://localhost:3000/assets/replicad-kernel-zjY7Rauf.js:9:499)
    at Em (http://localhost:3000/assets/replicad-kernel-zjY7Rauf.js:9:560)
    at Object.createGeometry (http://localhost:3000/assets/replicad-kernel-zjY7Rauf.js:9:3588)
    at d (http://localhost:3000/assets/kernel-runtime-worker-BezBldoC.js:1:6580)`;

      const frames = parseStackTrace(error);
      expect(frames).toHaveLength(5);

      expect(frames[0]!.functionName).toBe('main');
      expect(frames[1]!.functionName).toBe('Tm');
      expect(frames[2]!.functionName).toBe('Em');
      expect(frames[3]!.functionName).toBe('Object.createGeometry');
      expect(frames[4]!.functionName).toBe('d');
    });
  });
});
