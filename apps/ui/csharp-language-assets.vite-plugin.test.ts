import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vite plugin test lives outside app aliases.
import { createCsharpLanguageAssets } from './csharp-language-assets.vite-plugin.js';

const hash = (bytes: string): string => createHash('sha256').update(bytes).digest('hex');

describe('C# language server assets', () => {
  it('carries no C# language service without a staged bundle', () => {
    expect(createCsharpLanguageAssets(undefined).assets).toBeUndefined();
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
      expect(() => createCsharpLanguageAssets(stage)).toThrow(/does not match its manifest: references\.bin/u);
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  });
});
