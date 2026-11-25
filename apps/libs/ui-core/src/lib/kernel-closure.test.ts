// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { closureHasPending, kernelClosure } from '#lib/kernel-closure.js';

describe('kernel closure', () => {
  it('is the manifest and the entry for a kernel that reads only what it opens', () => {
    expect(kernelClosure('main.scad')).toStrictEqual(['tau.json', 'main.scad']);
    expect(kernelClosure('main.ts')).toStrictEqual(['tau.json', 'main.ts']);
    expect(kernelClosure('')).toStrictEqual(['tau.json']);
  });
  /* An agent's `targetFile` may carry a leading `/` or `./`; the facet's paths are checkout-relative. */
  it('names its entry as the facet does, whatever spelling the caller used', () => {
    expect(kernelClosure('/main.scad')).toStrictEqual(['tau.json', 'main.scad']);
    expect(kernelClosure('./lib/gear.ts')).toStrictEqual(['tau.json', 'lib/gear.ts']);
    expect(kernelClosure('/')).toStrictEqual(['tau.json']);
    expect(kernelClosure('../outside.scad')).toStrictEqual(['tau.json', '../outside.scad']);
    expect(closureHasPending(kernelClosure('/models/part.step'), ['models/part.step'])).toBe(true);
  });
  it('is the manifest and the entry for a kernel that mirrors the workspace too', () => {
    expect(kernelClosure('main.py')).toStrictEqual(['tau.json', 'main.py']);
    expect(kernelClosure('main.cs')).toStrictEqual(['tau.json', 'main.cs']);
  });
  it('is pending when a closure path is, or for a workspace closure when anything is', () => {
    expect(closureHasPending(['tau.json', 'main.ts'], ['assets/a.png'])).toBe(false);
    expect(closureHasPending(['tau.json', 'main.ts'], ['main.ts'])).toBe(true);
    expect(closureHasPending('workspace', ['assets/a.png'])).toBe(true);
    expect(closureHasPending('workspace', [])).toBe(false);
  });
});
