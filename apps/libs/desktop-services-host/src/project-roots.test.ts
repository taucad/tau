/* eslint-disable @typescript-eslint/naming-convention -- environment names are SCREAMING_SNAKE */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import type * as FileSystem from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createKernelForkResolver, createProjectRootRegistry, sanitizeServicesContext } from '#project-roots.js';

/* Lets a case make one root's canonicalisation hang-equivalent (it throws) without touching the others. */
const realpathOverride = vi.hoisted(() => ({ refuse: undefined as undefined | ((path: string) => boolean) }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  const native = (path: FileSystem.PathLike): string => {
    if (realpathOverride.refuse?.(String(path))) {
      throw Object.assign(new Error(`stalled mount: ${String(path)}`), { code: 'ETIMEDOUT' });
    }
    return actual.realpathSync.native(path);
  };
  const realpath = Object.assign(
    (path: FileSystem.PathLike, options?: FileSystem.EncodingOption) => actual.realpathSync(path, options),
    { native },
  );
  return { ...actual, default: { ...actual, realpathSync: realpath }, realpathSync: realpath };
});

afterEach(() => {
  realpathOverride.refuse = undefined;
});

const homeRoot = '/Users/tester/Library/Application Support/Tau/home';

describe('createProjectRootRegistry', () => {
  it('should revoke a saved grant across restart without deleting any files or other grants', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-disconnect-'));
    try {
      const downloads = join(directory, 'Downloads');
      const documents = join(directory, 'Documents');
      mkdirSync(downloads);
      mkdirSync(documents);
      writeFileSync(join(downloads, 'part.step'), 'keep this model');
      const storePath = join(directory, 'grants.json');
      const registry = createProjectRootRegistry({ storePath });
      registry.admit(downloads);
      registry.admit(documents);
      expect(registry.revoke(downloads)).toBe(true);
      expect(registry.revoke(downloads)).toBe(false);
      const reopened = createProjectRootRegistry({ storePath });
      expect(reopened.isTrusted(join(downloads, 'part.step'))).toBe(false);
      expect(reopened.isTrusted(documents)).toBe(true);
      expect(readFileSync(join(downloads, 'part.step'), 'utf8')).toBe('keep this model');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('should retain live authority when persisting revocation fails', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-disconnect-'));
    try {
      const storePath = join(directory, 'grants.json');
      const registry = createProjectRootRegistry({ storePath });
      registry.admit(homeRoot);
      mkdirSync(`${storePath}.tmp`);
      expect(() => registry.revoke(homeRoot)).toThrow();
      expect(registry.isTrusted(homeRoot)).toBe(true);
      expect(createProjectRootRegistry({ storePath }).isTrusted(homeRoot)).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('admits an admitted root and its descendants', () => {
    const registry = createProjectRootRegistry();
    registry.admit(homeRoot);
    expect(registry.isTrusted(homeRoot)).toBe(true);
    expect(registry.isTrusted(`${homeRoot}/widget`)).toBe(true);
    expect(registry.isTrusted(`${homeRoot}/widget/nested/deep`)).toBe(true);
  });

  it('returns the canonical spelling of a trusted project without collapsing it to Home', () => {
    const registry = createProjectRootRegistry();
    registry.admit(homeRoot);
    expect(registry.canonical(`${homeRoot}/widget/.`)).toBe(`${homeRoot}/widget`);
    expect(registry.canonical(`${homeRoot}/other`)).toBe(`${homeRoot}/other`);
    expect(registry.canonical('/etc')).toBeUndefined();
  });

  it('refuses a sibling whose name merely starts with an admitted root', () => {
    const registry = createProjectRootRegistry();
    registry.admit(homeRoot);
    expect(registry.isTrusted(`${homeRoot}-evil`)).toBe(false);
    expect(registry.isTrusted('/')).toBe(false);
    expect(registry.isTrusted('/etc/passwd')).toBe(false);
  });

  it('admits descendants of a filesystem root, which already ends in a separator', () => {
    const registry = createProjectRootRegistry();
    registry.admit('/');
    expect(registry.isTrusted('/')).toBe(true);
    expect(registry.isTrusted('/projects/widget')).toBe(true);
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

  it('should quarantine a damaged store, report it once and keep the copy past the next admission', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-roots-'));
    const storePath = join(directory, 'granted-roots.json');
    writeFileSync(storePath, '["/Volumes/Work/parts", trun');
    const onQuarantine = vi.fn();
    const registry = createProjectRootRegistry({ storePath, onQuarantine });
    expect(registry.roots()).toEqual([]);
    const quarantined = readdirSync(directory).filter((name) => /^granted-roots\.corrupt-.+\.json$/u.test(name));
    expect(quarantined).toHaveLength(1);
    expect(onQuarantine).toHaveBeenCalledOnce();
    expect(onQuarantine).toHaveBeenCalledWith(join(directory, quarantined[0]!));
    registry.admit(homeRoot);
    expect(readFileSync(join(directory, quarantined[0]!), 'utf8')).toBe('["/Volumes/Work/parts", trun');
    expect(JSON.parse(readFileSync(storePath, 'utf8'))).toEqual([homeRoot]);
  });

  it('should neither quarantine nor report a store that does not exist yet', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-roots-'));
    const onQuarantine = vi.fn();
    createProjectRootRegistry({ storePath: join(directory, 'granted-roots.json'), onQuarantine });
    expect(onQuarantine).not.toHaveBeenCalled();
    expect(existsSync(directory) && readdirSync(directory)).toEqual([]);
  });

  it('should answer for a path under one root without canonicalising another root', () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'tau-roots-')));
    const rootA = join(base, 'a');
    const rootB = join(base, 'b');
    mkdirSync(join(rootA, 'project'), { recursive: true });
    mkdirSync(rootB);
    try {
      const registry = createProjectRootRegistry();
      registry.admit(rootB);
      registry.admit(rootA);
      const touched: string[] = [];
      realpathOverride.refuse = (path) => {
        touched.push(path);
        return path === rootB || path.startsWith(`${rootB}/`);
      };
      expect(registry.isTrusted(join(rootA, 'project'))).toBe(true);
      expect(registry.canonical(join(rootA, 'project'))).toBe(join(rootA, 'project'));
      expect(touched.filter((path) => path === rootB || path.startsWith(`${rootB}/`))).toEqual([]);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('refuses a relative path outright', () => {
    const registry = createProjectRootRegistry();
    registry.admit(homeRoot);
    /* A relative root would resolve against main's cwd, which is not a
     * directory any user chose. */
    expect(registry.isTrusted('home/widget')).toBe(false);
    expect(registry.isTrusted('../../etc')).toBe(false);
  });

  it('should trust the real spelling of an admitted path alias', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'tau-roots-alias-'));
    try {
      const actual = join(temporary, 'actual');
      const alias = join(temporary, 'alias');
      mkdirSync(actual);
      symlinkSync(actual, alias, 'dir');

      const registry = createProjectRootRegistry();
      registry.admit(alias);
      const canonical = realpathSync.native(actual);

      expect(registry.roots()).toEqual([alias]);
      expect(registry.isTrusted(join(canonical, 'project'))).toBe(true);
      expect(registry.canonical(join(alias, 'project'))).toBe(join(canonical, 'project'));
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it('should refuse a symlink that escapes an admitted root', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'tau-roots-escape-'));
    try {
      const admitted = join(temporary, 'admitted');
      const outside = join(temporary, 'outside');
      mkdirSync(admitted);
      mkdirSync(outside);
      symlinkSync(outside, join(admitted, 'escape'), 'dir');

      const registry = createProjectRootRegistry();
      registry.admit(admitted);

      expect(registry.isTrusted(join(admitted, 'escape'))).toBe(false);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
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

  it('selects memory-backed ephemeral purpose without falling back to Home', () => {
    expect(resolverFor()({ purpose: 'ephemeral', definition: 'default' })).toEqual({
      env: { TAU_RUNTIME_EPHEMERAL: '1' },
    });
  });

  it('refuses a root combined with ephemeral purpose', () => {
    expect(() => resolverFor()({ purpose: 'ephemeral', projectRoot: homeRoot })).toThrow(/rooted ephemeral/u);
  });

  it('refuses unknown purposes and definitions instead of selecting a fallback', () => {
    expect(() => resolverFor()({ purpose: 'temporary' })).toThrow(/unknown runtime purpose/u);
    expect(() => resolverFor()({ definition: 'developer' })).toThrow(/unknown runtime definition/u);
  });

  it('refuses an untrusted root instead of silently substituting the default', () => {
    /* Substituting would hand the renderer a working kernel over the wrong
     * directory; throwing makes the broker fork nothing and report. */
    expect(() => resolverFor()({ projectRoot: '/etc' })).toThrow(/untrusted project root/u);
  });

  it('accepts a main-attested candidate root without persisting it as a user grant', () => {
    const registry = createProjectRootRegistry();
    registry.admit(homeRoot);
    const candidate = '/var/tau/checkouts/project-a/run-1';
    const resolver = createKernelForkResolver({
      registry,
      defaultRoot: homeRoot,
      isTrustedRoot: (root) => registry.isTrusted(root) || root === candidate,
    });

    expect(resolver({ projectRoot: candidate })).toEqual({ env: { TAU_PROJECT_ROOT: candidate } });
    expect(registry.roots()).toEqual([homeRoot]);
    expect(() => resolver({ projectRoot: '/etc' })).toThrow(/untrusted project root/u);
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
