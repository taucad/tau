import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vite plugin test lives outside app aliases.
import { createCsharpLanguageAssets } from './csharp-language-assets.vite-plugin.js';

const hash = (bytes: string): string => createHash('sha256').update(bytes).digest('hex');

/** Emit the plugin's bundle, where a build finds out its stage is unusable. */
const emitBundle = (stage: string): void => {
  const { generateBundle, buildStart } = createCsharpLanguageAssets(stage).plugin;
  if (typeof generateBundle !== 'function') {
    throw new TypeError('The C# language assets plugin has no generateBundle hook.');
  }
  // React Router's child compiler runs buildStart while Nx resolves the config, so the plugin must not fail there.
  expect(buildStart).toBeUndefined();
  // A failing stage throws before the hook touches its plugin context or arguments.
  Reflect.apply(generateBundle, undefined, []);
};

describe('C# language server assets', () => {
  it('carries no C# language service in a test run, which passes no stage', () => {
    expect(createCsharpLanguageAssets(undefined).assets).toBeUndefined();
  });

  it('fails a build whose stage is missing, but still loads the config for the Nx project graph', () => {
    const stage = mkdtempSync(path.join(tmpdir(), 'csharp-language-ui-'));
    try {
      expect(createCsharpLanguageAssets(stage).assets).toBeUndefined();
      expect(() => {
        emitBundle(stage);
      }).toThrow(/csharp-language:prepare/u);
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  });

  it('addresses a verified stage by its manifest and refuses changed bytes', () => {
    const stage = mkdtempSync(path.join(tmpdir(), 'csharp-language-ui-'));
    const files = { 'dotnet.js': 'export const dotnet = {};', 'references.bin': 'reference bundle' };
    const manifest = JSON.stringify({
      format: 'tau-csharp-language-v1',
      bootstrap: 'dotnet.js',
      references: 'references.bin',
      files: Object.entries(files).map(([name, value]) => ({
        path: name,
        sha256: hash(value),
        byteLength: value.length,
      })),
    });
    try {
      for (const [name, value] of Object.entries(files)) {
        writeFileSync(path.join(stage, name), value);
      }
      writeFileSync(path.join(stage, 'assets-manifest.json'), manifest);
      const identity = hash(manifest);
      expect(createCsharpLanguageAssets(stage).assets).toEqual({
        url: `/csharp-language/${identity}/assets-manifest.json`,
        sha256: identity,
      });

      writeFileSync(path.join(stage, 'references.bin'), 'changed bundle!!');
      expect(() => {
        emitBundle(stage);
      }).toThrow(/does not match its manifest: references\.bin/u);
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  });
});
