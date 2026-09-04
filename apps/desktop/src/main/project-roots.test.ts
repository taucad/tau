/* eslint-disable @typescript-eslint/naming-convention -- environment names are SCREAMING_SNAKE */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createKernelForkResolver, createProjectRootRegistry, sanitizeServicesContext } from '#main/project-roots.js';

const homeRoot = '/Users/tester/Library/Application Support/Tau/home';

describe('createProjectRootRegistry', () => {
  it('admits an admitted root and its descendants', () => {
    const registry = createProjectRootRegistry();
    registry.admit(homeRoot);
    expect(registry.isTrusted(homeRoot)).toBe(true);
    expect(registry.isTrusted(`${homeRoot}/widget`)).toBe(true);
    expect(registry.isTrusted(`${homeRoot}/widget/nested/deep`)).toBe(true);
  });

  it('refuses a sibling whose name merely starts with an admitted root', () => {
    const registry = createProjectRootRegistry();
    registry.admit(homeRoot);
    expect(registry.isTrusted(`${homeRoot}-evil`)).toBe(false);
    expect(registry.isTrusted('/')).toBe(false);
    expect(registry.isTrusted('/etc/passwd')).toBe(false);
  });

  it('remembers a granted folder across launches', () => {
    /* The renderer keeps a picked folder's workspace record in IndexedDB and
     * offers it again next launch, so a grant main forgot would answer EACCES
     * for a folder the user believes is still connected. */
    const storePath = join(mkdtempSync(join(tmpdir(), 'tau-roots-')), 'granted-roots.json');
    const first = createProjectRootRegistry({ storePath });
    first.admit(homeRoot);
    first.admit('/Volumes/Work/parts');
    expect(JSON.parse(readFileSync(storePath, 'utf8'))).toEqual([homeRoot, '/Volumes/Work/parts']);

    const relaunched = createProjectRootRegistry({ storePath });
    expect(relaunched.isTrusted('/Volumes/Work/parts/bracket')).toBe(true);
    expect(relaunched.isTrusted('/Volumes/Work/other')).toBe(false);
  });

  it('starts empty rather than failing to boot on a corrupt store', () => {
    const storePath = join(mkdtempSync(join(tmpdir(), 'tau-roots-')), 'granted-roots.json');
    const registry = createProjectRootRegistry({ storePath });
    expect(registry.roots()).toEqual([]);
    /* A relative entry in the file is not a grant a dialog could have produced. */
    const seeded = createProjectRootRegistry({ storePath });
    seeded.admit(homeRoot);
    expect(createProjectRootRegistry({ storePath }).roots()).toEqual([homeRoot]);
  });

  it('refuses a relative path outright', () => {
    const registry = createProjectRootRegistry();
    registry.admit(homeRoot);
    /* A relative root would resolve against main's cwd, which is not a
     * directory any user chose. */
    expect(registry.isTrusted('home/widget')).toBe(false);
    expect(registry.isTrusted('../../etc')).toBe(false);
  });
});

describe('createKernelForkResolver', () => {
  const resolverFor = () => {
    const registry = createProjectRootRegistry();
    registry.admit(homeRoot);
    return createKernelForkResolver({ registry, defaultRoot: homeRoot });
  };

  it('passes a trusted root through as TAU_PROJECT_ROOT', () => {
    expect(resolverFor()({ projectRoot: `${homeRoot}/widget` })).toEqual({
      env: { TAU_PROJECT_ROOT: `${homeRoot}/widget` },
    });
  });

  it('falls back to the default root when the renderer names none', () => {
    expect(resolverFor()({})).toEqual({ env: { TAU_PROJECT_ROOT: homeRoot } });
  });

  it('refuses an untrusted root instead of silently substituting the default', () => {
    /* Substituting would hand the renderer a working kernel over the wrong
     * directory; throwing makes the broker fork nothing and report. */
    expect(() => resolverFor()({ projectRoot: '/etc' })).toThrow(/untrusted project root/u);
  });

  it('selects the source-mapping recipe by environment, not a second bundle', () => {
    expect(resolverFor()({ definition: 'debug' })).toEqual({
      env: { TAU_PROJECT_ROOT: homeRoot, TAU_RUNTIME_DEBUG: '1' },
    });
  });

  it('never returns a key outside the broker allowlist', () => {
    const resolved = resolverFor()({ projectRoot: homeRoot, definition: 'debug' });
    expect(Object.keys(resolved.env ?? {}).sort()).toEqual(['TAU_PROJECT_ROOT', 'TAU_RUNTIME_DEBUG']);
  });
});

describe('sanitizeServicesContext', () => {
  it('treats an absent context as an empty one', () => {
    expect(sanitizeServicesContext(undefined)).toEqual({});
    expect(sanitizeServicesContext(null)).toEqual({});
  });

  it('passes a flat string record through unchanged', () => {
    expect(sanitizeServicesContext({ workspaceRoot: `${homeRoot}/widget` })).toEqual({
      workspaceRoot: `${homeRoot}/widget`,
    });
  });

  it('refuses anything that is not a plain record of strings', () => {
    expect(() => sanitizeServicesContext(['workspaceRoot'])).toThrow(/string record/u);
    expect(() => sanitizeServicesContext('workspaceRoot')).toThrow(/string record/u);
    expect(() => sanitizeServicesContext({ workspaceRoot: 42 })).toThrow(/is not a string/u);
  });

  it('refuses the keys that would poison the record it builds', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      /* `JSON.parse` and `defineProperty` both produce an own, enumerable
       * `__proto__`, which is exactly what `Object.entries` reports here. */
      expect(() => sanitizeServicesContext(JSON.parse(`{"${key}": "x"}`))).toThrow(/is not allowed/u);
    }
  });

  it('bounds both the entry count and the total size', () => {
    const many = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`k${String(index)}`, 'v']));
    expect(() => sanitizeServicesContext(many)).toThrow(/exceeds 8 entries/u);
    expect(() => sanitizeServicesContext({ workspaceRoot: 'x'.repeat(4097) })).toThrow(/exceeds 4096 characters/u);
  });
});
