// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- this test exercises the application-owned alias rule.
import { ceilingSpecifier, cloudCoreModulePattern } from './vite.config.js';

/*
 * The ceiling as a module (adaptive app deployment mode charter D1, I12, T-BA15): every ceiling resolves each
 * boundary to a file that exists, an adaptive build falls back to the self-host file until a facade lands, and the
 * unaliased ceiling (a bare test runner, a browser config) is `self-host`. No `tauCloudBuildEnabled` define is left.
 */

const app = join(import.meta.dirname, 'app');

describe('ceilingSpecifier', () => {
  it('should resolve a boundary to its ceiling file', () => {
    expect(ceilingSpecifier('#cloud/deployment-ceiling.js', 'cloud')).toBe('#cloud/deployment-ceiling.cloud.js');
    expect(ceilingSpecifier('#cloud/deployment-ceiling.js', 'self-host')).toBe(
      '#cloud/deployment-ceiling.self-host.js',
    );
    expect(ceilingSpecifier('#cloud/deployment-ceiling.js', 'adaptive')).toBe('#cloud/deployment-ceiling.adaptive.js');
  });

  it('should fall back to the self-host file when a boundary has no adaptive facade yet', () => {
    expect(ceilingSpecifier('#cloud/environment-billing.js', 'adaptive')).toBe(
      '#cloud/environment-billing.self-host.js',
    );
    expect(ceilingSpecifier('#offline/offline-shell.js', 'adaptive')).toBe('#offline/offline-shell.self-host.js');
  });

  it('should apply a self-host override under self-host and its adaptive facade under adaptive, never under cloud', () => {
    expect(ceilingSpecifier('#hooks/use-credit-preflight.js', 'cloud')).toBe('#hooks/use-credit-preflight.js');
    expect(ceilingSpecifier('#hooks/use-credit-preflight.js', 'self-host')).toBe(
      '#hooks/use-credit-preflight.self-host.js',
    );
    expect(ceilingSpecifier('#hooks/use-credit-preflight.js', 'adaptive')).toBe(
      '#hooks/use-credit-preflight.adaptive.js',
    );
    expect(ceilingSpecifier('#lib/build-identity.js', 'adaptive')).toBe('#lib/build-identity.js');
  });

  it('should keep the unaliased ceiling self-host (I12)', () => {
    expect(readFileSync(join(app, 'cloud', 'deployment-ceiling.ts'), 'utf8')).toContain(
      "from '#cloud/deployment-ceiling.self-host.js'",
    );
    expect(readFileSync(join(app, 'cloud', 'deployment-mode.ts'), 'utf8')).toContain(
      "from '#cloud/deployment-mode.self-host.js'",
    );
  });

  it('should leave no ambient declaration of the deleted define (T-BA15)', () => {
    expect(readFileSync(join(import.meta.dirname, 'vite-environment.d.ts'), 'utf8')).not.toContain(
      'tauCloudBuildEnabled',
    );
  });
});

describe('cloudCoreModulePattern', () => {
  it('should hold the display-mode owner and its utilities only', () => {
    const root = '/repo/apps/ui/app';
    expect(cloudCoreModulePattern.test(`${root}/runtime/deployment.machine.ts`)).toBe(true);
    expect(cloudCoreModulePattern.test(`${root}/runtime/deployment.ts`)).toBe(true);
    expect(cloudCoreModulePattern.test(`${root}/cloud/deployment-mode.adaptive.ts`)).toBe(true);
    expect(cloudCoreModulePattern.test('/repo/libs/utils/src/origin-answer.utils.ts')).toBe(true);
    expect(cloudCoreModulePattern.test('/repo/libs/types/src/deployment.ts')).toBe(true);
    expect(cloudCoreModulePattern.test(`${root}/runtime/app-runtime.ts`)).toBe(false);
    expect(cloudCoreModulePattern.test(`${root}/cloud/root-billing.adaptive.tsx`)).toBe(false);
    expect(cloudCoreModulePattern.test('/repo/apps/libs/billing-ui/src/db/billing-snapshot-database.ts')).toBe(false);
  });
});
