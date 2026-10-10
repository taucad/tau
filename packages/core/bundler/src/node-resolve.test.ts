import { describe, expect, it } from 'vitest';

import { resolveNodeModule } from '#node-resolve.js';
import type { NodeResolution } from '#node-resolve.js';

import { createTestFileSystem } from '#testing.fixture.js';

const manifest = (fields: Record<string, unknown>): string => JSON.stringify({ version: '1.0.0', ...fields });

const resolveIn = async (
  files: Readonly<Record<string, string>>,
  specifier: string,
  importer = 'main.ts',
): Promise<NodeResolution> => resolveNodeModule({ filesystem: createTestFileSystem(files), specifier, importer });

const file = (path: string, packageName: string, packageVersion = '1.0.0'): NodeResolution => ({
  kind: 'file',
  path,
  packageName,
  packageVersion,
});

const rejection = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
  }
  return expect.fail('should have thrown an Error');
};

describe('resolveNodeModule', () => {
  describe('legacy entry fields', () => {
    it('should resolve main of a CommonJS package with extension probing', async () => {
      const result = await resolveIn(
        {
          'node_modules/cjs/package.json': manifest({ name: 'cjs', main: 'lib/index' }),
          'node_modules/cjs/lib/index.js': 'module.exports = 1;',
        },
        'cjs',
      );

      expect(result).toEqual(file('node_modules/cjs/lib/index.js', 'cjs'));
    });

    it('should prefer module over main', async () => {
      const result = await resolveIn(
        {
          'node_modules/dual/package.json': manifest({ main: './dist/index.cjs', module: './dist/index.mjs' }),
          'node_modules/dual/dist/index.cjs': '',
          'node_modules/dual/dist/index.mjs': '',
        },
        'dual',
      );

      expect(result).toEqual(file('node_modules/dual/dist/index.mjs', 'dual'));
    });

    it('should ignore an object-form browser field and fall through to module', async () => {
      const result = await resolveIn(
        {
          'node_modules/shim/package.json': manifest({ browser: { './node.js': './web.js' }, module: './esm.js' }),
          'node_modules/shim/esm.js': '',
        },
        'shim',
      );

      expect(result).toEqual(file('node_modules/shim/esm.js', 'shim'));
    });

    it('should resolve a directory subpath to its index file', async () => {
      const result = await resolveIn(
        {
          'node_modules/lib/package.json': manifest({}),
          'node_modules/lib/index.js': '',
          'node_modules/lib/utils/index.js': '',
        },
        'lib/utils',
      );

      expect(result).toEqual(file('node_modules/lib/utils/index.js', 'lib'));
    });

    it('should probe .js before .ts for packages shipping TypeScript source', async () => {
      const result = await resolveIn(
        {
          'node_modules/src-pkg/package.json': manifest({ main: 'index' }),
          'node_modules/src-pkg/index.ts': '',
          'node_modules/src-pkg/index.js': '',
        },
        'src-pkg',
      );

      expect(result).toEqual(file('node_modules/src-pkg/index.js', 'src-pkg'));
    });
  });

  describe('exports', () => {
    it('should resolve an exports string as the package root', async () => {
      const result = await resolveIn(
        {
          'node_modules/str/package.json': manifest({ main: './main.js', exports: './entry.js' }),
          'node_modules/str/main.js': '',
          'node_modules/str/entry.js': '',
        },
        'str',
      );

      expect(result).toEqual(file('node_modules/str/entry.js', 'str'));
    });

    it('should pick browser over import when the condition object lists browser first', async () => {
      const result = await resolveIn(
        {
          'node_modules/cond/package.json': manifest({
            exports: { node: './node.js', browser: './browser.js', import: './import.js', default: './default.js' },
          }),
          'node_modules/cond/browser.js': '',
          'node_modules/cond/import.js': '',
        },
        'cond',
      );

      expect(result).toEqual(file('node_modules/cond/browser.js', 'cond'));
    });

    it('should follow condition key order rather than caller condition order', async () => {
      const result = await resolveIn(
        {
          'node_modules/order/package.json': manifest({ exports: { import: './import.js', browser: './browser.js' } }),
          'node_modules/order/import.js': '',
          'node_modules/order/browser.js': '',
        },
        'order',
      );

      expect(result).toEqual(file('node_modules/order/import.js', 'order'));
    });

    it('should never match the development condition', async () => {
      const result = await resolveNodeModule({
        filesystem: createTestFileSystem({
          'node_modules/dev/package.json': manifest({ exports: { development: './dev.js', default: './prod.js' } }),
          'node_modules/dev/dev.js': '',
          'node_modules/dev/prod.js': '',
        }),
        specifier: 'dev',
        importer: 'main.ts',
        conditions: ['development', 'browser'],
      });

      expect(result).toEqual(file('node_modules/dev/prod.js', 'dev'));
    });

    it('should resolve a nested conditional subpath export', async () => {
      const result = await resolveIn(
        {
          'node_modules/react-dom/package.json': manifest({
            exports: { '.': './index.js', './client': { browser: { import: './client.mjs' }, default: './client.js' } },
          }),
          'node_modules/react-dom/client.mjs': '',
        },
        'react-dom/client',
      );

      expect(result).toEqual(file('node_modules/react-dom/client.mjs', 'react-dom'));
    });

    it('should expand the longest matching subpath pattern', async () => {
      const result = await resolveIn(
        {
          'node_modules/feat/package.json': manifest({
            exports: { './*': './root/*.js', './features/*': './dist/features/*.js', './features/*.css': null },
          }),
          'node_modules/feat/dist/features/a/b.js': '',
        },
        'feat/features/a/b',
      );

      expect(result).toEqual(file('node_modules/feat/dist/features/a/b.js', 'feat'));
    });

    it('should throw when a subpath is not exported', async () => {
      const files = {
        'node_modules/closed/package.json': manifest({ exports: { '.': './index.js', './internal/*': null } }),
        'node_modules/closed/index.js': '',
        'node_modules/closed/secret.js': '',
        'node_modules/closed/internal/x.js': '',
      };

      const unexported = await rejection(resolveIn(files, 'closed/secret'));
      const nulled = await rejection(resolveIn(files, 'closed/internal/x.js'));

      expect(unexported.name).toBe('Error');
      expect(unexported.message).toBe("'closed/secret' is not exported by closed@1.0.0 (exports map).");
      expect(nulled.message).toBe("'closed/internal/x.js' is not exported by closed@1.0.0 (exports map).");
    });

    it('should refuse an exports target that escapes the package directory', async () => {
      const error = await rejection(
        resolveIn(
          {
            'node_modules/escape/package.json': manifest({ exports: './../other/index.js' }),
            'node_modules/other/index.js': '',
          },
          'escape',
        ),
      );

      expect(error.message).toBe("Invalid package target './../other/index.js' in 'node_modules/escape/package.json'.");
    });
  });

  describe('imports', () => {
    it('should resolve #imports relative to the importing package', async () => {
      const files = {
        'node_modules/priv/package.json': manifest({
          name: 'priv',
          version: '2.1.0',
          imports: { '#internal/*': './src/internal/*.js', '#dep': 'cjs' },
        }),
        'node_modules/priv/src/internal/util.js': '',
        'node_modules/cjs/package.json': manifest({ main: 'index.js' }),
        'node_modules/cjs/index.js': '',
      };

      const local = await resolveIn(files, '#internal/util', 'node_modules/priv/src/index.js');
      const bare = await resolveIn(files, '#dep', 'node_modules/priv/src/index.js');

      expect(local).toEqual(file('node_modules/priv/src/internal/util.js', 'priv', '2.1.0'));
      expect(bare).toEqual(file('node_modules/cjs/index.js', 'cjs'));
    });

    it('should throw when the package scope does not define the #import', async () => {
      const error = await rejection(
        resolveIn({ 'node_modules/priv/package.json': manifest({}) }, '#missing', 'node_modules/priv/index.js'),
      );

      expect(error.message).toBe(
        `'#missing' is not defined by the "imports" of the package that contains 'node_modules/priv/index.js'.`,
      );
    });
  });

  describe('node_modules lookup', () => {
    it('should resolve the nearest nested duplicate from an importer inside its parent package', async () => {
      const files = {
        'node_modules/a/package.json': manifest({ main: 'index.js' }),
        'node_modules/a/index.js': '',
        'node_modules/a/node_modules/b/package.json': manifest({ version: '1.0.0', main: 'index.js' }),
        'node_modules/a/node_modules/b/index.js': '',
        'node_modules/b/package.json': manifest({ version: '2.0.0', main: 'index.js' }),
        'node_modules/b/index.js': '',
      };

      const fromA = await resolveIn(files, 'b', 'node_modules/a/lib/deep/file.js');
      const fromProject = await resolveIn(files, 'b', 'src/main.ts');

      expect(fromA).toEqual(file('node_modules/a/node_modules/b/index.js', 'b', '1.0.0'));
      expect(fromProject).toEqual(file('node_modules/b/index.js', 'b', '2.0.0'));
    });

    it('should resolve a scoped package subpath', async () => {
      const result = await resolveIn(
        {
          'node_modules/@scope/pkg/package.json': manifest({ exports: { './tools': './dist/tools.js' } }),
          'node_modules/@scope/pkg/dist/tools.js': '',
        },
        '@scope/pkg/tools',
      );

      expect(result).toEqual(file('node_modules/@scope/pkg/dist/tools.js', '@scope/pkg'));
    });

    it('should report package-not-installed when no ancestor node_modules has the package', async () => {
      const result = await resolveIn(
        { 'node_modules/other/package.json': manifest({}) },
        '@scope/absent/sub',
        'a/b.ts',
      );

      expect(result).toEqual({
        kind: 'issue',
        issue: {
          code: 'package-not-installed',
          message:
            "Package '@scope/absent' is not installed in node_modules. Run Install (or `npm ci`) to install package-lock.json.",
          name: '@scope/absent',
          path: 'node_modules/@scope/absent',
        },
      });
    });
  });
});
