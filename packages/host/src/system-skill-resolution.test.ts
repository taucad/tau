/**
 * R19 — every declared system skill resolves at the composition boundary.
 *
 * The defect this pins was reported as "the resolver uses `createRequire`
 * instead of `import.meta.resolve`". Measured, that is not the cause: both
 * calls resolve from the *same* base, so swapping them moves nothing. The
 * cause is the base itself. `@taucad/host` declares `geospec` and the GeoSpec
 * engine; the eight kernel plugins are declared by the app that composes it.
 * From the host alone 1 of 9 resolved; from `apps/desktop` alone 8 of 9 do.
 *
 * So the assertion is about the pair, which is what `resolveSkillSubpath`
 * chains — and the two negative cases below are what makes it an assertion
 * about the chain rather than about one lucky base.
 *
 * @module
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { systemSkillCatalog } from '@taucad/agent-tools/skills';
import { describe, expect, it } from 'vitest';

/** `apps/desktop`'s base: the app that declares every kernel plugin. */
const appRequire = createRequire(new URL('../../../apps/desktop/package.json', import.meta.url));

/** The chain `createHostToolRegistry` installs, reproduced over the same two bases. */
const resolveChained = (subpath: string): string => {
  try {
    return appRequire.resolve(subpath);
  } catch {
    return fileURLToPath(import.meta.resolve(subpath));
  }
};

describe('system-skill resolution', () => {
  it('resolves every catalogue entry through the two chained bases', () => {
    const resolved = systemSkillCatalog.map((entry) => {
      try {
        return { slug: entry.slug, path: resolveChained(entry.subpath) };
      } catch {
        return { slug: entry.slug, path: undefined };
      }
    });

    expect(resolved.filter((entry) => entry.path === undefined)).toStrictEqual([]);
    expect(resolved).toHaveLength(systemSkillCatalog.length);
  });

  it('needs the chain: this package alone sees one owner in nine', () => {
    const resolved = systemSkillCatalog.filter((entry) => {
      try {
        fileURLToPath(import.meta.resolve(entry.subpath));
        return true;
      } catch {
        return false;
      }
    });

    /* The whole of R19 in one number. If this ever equals the catalogue length,
     * `resolveSkillSubpath`'s chain has become dead code and should be deleted
     * rather than kept "just in case". */
    expect(resolved.map((entry) => entry.slug)).toStrictEqual(['geospec-authoring']);
    expect(systemSkillCatalog.length).toBeGreaterThan(1);
  });

  it('resolves the GeoSpec guide out of its own package, not middleware', () => {
    const geospec = systemSkillCatalog.find((entry) => entry.slug === 'geospec-authoring');

    expect(geospec?.subpath).toBe('geospec/agent/skills.json');
    expect(resolveChained(geospec?.subpath ?? '')).toContain('/packages/geospec/agent/');
  });
});
