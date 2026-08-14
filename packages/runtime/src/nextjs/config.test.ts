/* eslint-disable @typescript-eslint/naming-convention -- Next config keys intentionally mirror framework aliases. */
import type { NextConfig } from 'next';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { nextRuntimeHeaders, withTauRuntime } from '#nextjs/config.js';
import * as nextConfigIntegration from '#nextjs/config.js';

describe('withTauRuntime', () => {
  it('should return framework-conformant config and headers types', () => {
    const config = withTauRuntime();
    expectTypeOf(config).toExtend<NextConfig>();
    expectTypeOf(config.headers).toExtend<NextConfig['headers']>();
  });

  it('should expose the ecosystem-shaped composer without the retired config name', () => {
    expect(withTauRuntime).toBeTypeOf('function');
    expect(nextConfigIntegration).not.toHaveProperty('nextRuntimeConfig');
  });

  it('should return COI headers and Turbopack settings for runtime workers', async () => {
    const config = withTauRuntime({}, { document: '/workspace/:path*' });

    await expect(config.headers()).resolves.toEqual(nextRuntimeHeaders({ document: '/workspace/:path*' }));
    expect(config.turbopack).not.toHaveProperty('rules');
    expect(config.turbopack.resolveAlias).toEqual({
      fs: '@taucad/runtime/nextjs/browser-node-builtins',
      'node:fs': '@taucad/runtime/nextjs/browser-node-builtins',
      'node:fs/promises': '@taucad/runtime/nextjs/browser-node-builtins',
      'node:url': '@taucad/runtime/nextjs/browser-node-builtins',
    });
  });

  it('should compose application config without replacing sibling Turbopack or header settings', async () => {
    const appHeader = { source: '/api/:path*', headers: [{ key: 'X-App', value: 'true' }] };
    const config = withTauRuntime(
      {
        distDir: '.next-custom',
        headers: async () => [appHeader],
        turbopack: {
          root: '/workspace',
          resolveAlias: { app: './src/app.ts' },
          rules: { '*.svg': { loaders: ['svg-loader'], as: '*.js' } },
        },
      },
      { document: '/workspace/:path*' },
    );

    expect(config.distDir).toBe('.next-custom');
    expect(config.turbopack.root).toBe('/workspace');
    expect(config.turbopack.resolveAlias).toMatchObject({
      app: './src/app.ts',
      fs: '@taucad/runtime/nextjs/browser-node-builtins',
    });
    expect(config.turbopack.rules).toMatchObject({
      '*.svg': { loaders: ['svg-loader'], as: '*.js' },
    });
    await expect(config.headers()).resolves.toEqual([
      appHeader,
      ...nextRuntimeHeaders({ document: '/workspace/:path*' }),
    ]);
  });

  it('should preserve the input config without mutating nested Turbopack values', () => {
    const input: NextConfig = {
      distDir: '.next-input',
      turbopack: {
        root: '/workspace',
        resolveAlias: { app: './src/app.ts' },
        rules: { '*.svg': { loaders: ['svg-loader'], as: '*.js' } },
      },
    };

    const config = withTauRuntime(input);

    expect(config).not.toBe(input);
    expect(config.turbopack).not.toBe(input.turbopack);
    expect(input).toEqual({
      distDir: '.next-input',
      turbopack: {
        root: '/workspace',
        resolveAlias: { app: './src/app.ts' },
        rules: { '*.svg': { loaders: ['svg-loader'], as: '*.js' } },
      },
    });
  });

  it('should keep runtime-owned aliases authoritative without replacing consumer rules', () => {
    const config = withTauRuntime({
      turbopack: {
        resolveAlias: {
          fs: './consumer-fs.ts',
          'node:fs': './consumer-node-fs.ts',
        },
        rules: { '*.wasm': { loaders: ['consumer-wasm-loader'] } },
      },
    });

    expect(config.turbopack.resolveAlias).toMatchObject({
      fs: '@taucad/runtime/nextjs/browser-node-builtins',
      'node:fs': '@taucad/runtime/nextjs/browser-node-builtins',
    });
    expect(config.turbopack.rules?.['*.wasm']).toEqual({ loaders: ['consumer-wasm-loader'] });
  });

  it('should compose the application Webpack hook before browser runtime invariants', () => {
    type TestWebpackConfig = {
      plugins?: unknown[];
      resolve?: { alias?: Record<string, unknown> };
    };
    type TestWebpackContext = {
      isServer: boolean;
      webpack: {
        NormalModuleReplacementPlugin: new (
          pattern: RegExp,
          replace: (resource: { request: string }) => void,
        ) => unknown;
      };
    };

    class ReplacementPlugin {
      // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties.
      public readonly pattern: RegExp;
      // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties.
      public readonly replace: (resource: { request: string }) => void;

      public constructor(pattern: RegExp, replace: (resource: { request: string }) => void) {
        this.pattern = pattern;
        this.replace = replace;
      }
    }

    const appWebpack = (webpackConfig: TestWebpackConfig, _context: TestWebpackContext): TestWebpackConfig => ({
      ...webpackConfig,
      plugins: [...(webpackConfig.plugins ?? []), 'application-plugin'],
      resolve: { alias: { application: './application.ts' } },
    });
    const config = withTauRuntime({ webpack: appWebpack });
    const context: TestWebpackContext = {
      isServer: false,
      webpack: { NormalModuleReplacementPlugin: ReplacementPlugin },
    };

    const browserConfig = config.webpack({ plugins: ['next-plugin'] }, context);
    const replacement = browserConfig.plugins?.at(-1) as ReplacementPlugin;
    const resource = { request: 'node:fs/promises' };
    replacement.replace(resource);

    expect(browserConfig.plugins).toEqual(['next-plugin', 'application-plugin', replacement]);
    expect(browserConfig.resolve?.alias).toEqual({
      application: './application.ts',
      fs$: '@taucad/runtime/nextjs/browser-node-builtins',
      'fs/promises$': '@taucad/runtime/nextjs/browser-node-builtins',
      url$: '@taucad/runtime/nextjs/browser-node-builtins',
    });
    expect(replacement.pattern.test('node:url')).toBe(true);
    expect(resource.request).toBe('fs/promises');

    const serverConfig = config.webpack({ plugins: ['server-plugin'] }, { ...context, isServer: true });
    expect(serverConfig).toEqual({
      plugins: ['server-plugin', 'application-plugin'],
      resolve: { alias: { application: './application.ts' } },
    });
  });

  it('should propagate application header failures unchanged', async () => {
    const failure = new TypeError('application headers failed');
    const config = withTauRuntime({
      headers: async () => {
        throw failure;
      },
    });

    await expect(config.headers()).rejects.toBe(failure);
  });
});
