import { describe, it, expect } from 'vitest';
import { completionLanguages } from '#lib/monaco.lib.client.js';
import { monacoLanguages } from '#lib/monaco.constants.js';

describe('completionLanguages', () => {
  it('should contain exactly the JS/TS and JSON languages', () => {
    expect(completionLanguages).toEqual([
      monacoLanguages.typescript,
      monacoLanguages.typescriptreact,
      monacoLanguages.javascript,
      monacoLanguages.javascriptreact,
      monacoLanguages.json,
    ]);
  });

  it('should not include KCL (registers its own completion provider)', () => {
    expect(completionLanguages).not.toContain(monacoLanguages.kcl);
  });

  it('should not include OpenSCAD (registers its own completion provider)', () => {
    expect(completionLanguages).not.toContain(monacoLanguages.openscad);
  });

  it('should not include binary/non-code formats', () => {
    expect(completionLanguages).not.toContain(monacoLanguages.stepfile);
    expect(completionLanguages).not.toContain(monacoLanguages.stl);
    expect(completionLanguages).not.toContain(monacoLanguages.usd);
  });
});
