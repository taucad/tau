import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vite plugin test lives outside app aliases.
import { createOpenscadLanguageAssets } from './openscad-language-assets.vite-plugin.js';

const hash = (bytes: string): string => createHash('sha256').update(bytes).digest('hex');

describe('OpenSCAD language client assets', () => {
  it('defines no assets without a stage', () => {
    expect(createOpenscadLanguageAssets(path.join(tmpdir(), 'no-openscad-stage')).assets).toBeUndefined();
  });

  it('addresses the staged manifest by its hash and refuses a module that does not match it', () => {
    const stage = mkdtempSync(path.join(tmpdir(), 'openscad-language-ui-'));
    try {
      const module = 'wasm bytes';
      const manifest = JSON.stringify({
        format: 'tau-openscad-language-v1',
        module: { path: 'tau_openscad_language.wasm', sha256: hash(module), byteLength: module.length },
      });
      writeFileSync(path.join(stage, 'assets-manifest.json'), manifest);
      writeFileSync(path.join(stage, 'tau_openscad_language.wasm'), module);
      expect(createOpenscadLanguageAssets(stage).assets).toEqual({
        url: `/openscad-language/${hash(manifest).slice(0, 16)}/assets-manifest.json`,
        sha256: hash(manifest),
      });
      writeFileSync(path.join(stage, 'tau_openscad_language.wasm'), 'other bytes');
      expect(() => createOpenscadLanguageAssets(stage)).toThrow('does not match its manifest');
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  });
});
