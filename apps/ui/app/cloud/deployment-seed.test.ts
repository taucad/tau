/**
 * The server-supplied first snapshot's carrier (adaptive app deployment mode charter W11): only an explicit answer's
 * snapshot is a seed, and the document's script cannot be closed by a value.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildDeploymentSeedScript,
  deploymentSeedGlobal,
  parseDeploymentSeed,
  readDocumentDeploymentSeed,
} from '#cloud/deployment-seed.js';

afterEach(() => {
  Reflect.deleteProperty(globalThis, deploymentSeedGlobal);
});

describe('deployment seed (W11)', () => {
  it('should accept only the snapshots an explicit answer gives', () => {
    for (const seed of [
      { state: 'funded', basis: 'confirmed', environment: 'staging' },
      { state: 'unfunded', basis: 'confirmed' },
      { state: 'unknown', problem: 'unsupported' },
      { state: 'unknown', problem: 'misconfigured' },
    ]) {
      expect(parseDeploymentSeed(seed)).toEqual(seed);
    }
    for (const value of [
      undefined,
      null,
      'funded',
      { state: 'funded', basis: 'remembered', environment: 'staging' },
      { state: 'funded', basis: 'pinned', environment: undefined },
      { state: 'funded', basis: 'confirmed', environment: '' },
      { state: 'unfunded', basis: 'absent' },
      { state: 'unknown', problem: 'pending' },
      { state: 'unknown', problem: 'safe-mode' },
    ]) {
      expect(parseDeploymentSeed(value)).toBeUndefined();
    }
  });

  it('should publish the seed in a script no value can close, and read it back', () => {
    const script = buildDeploymentSeedScript({ state: 'funded', basis: 'confirmed', environment: '</script>' });
    expect(script).not.toContain('</script>');
    expect(script.startsWith(`window.${deploymentSeedGlobal} = `)).toBe(true);
    Reflect.set(globalThis, deploymentSeedGlobal, JSON.parse(script.slice(script.indexOf('=') + 1)) as unknown);
    expect(readDocumentDeploymentSeed()).toEqual({ state: 'funded', basis: 'confirmed', environment: '</script>' });
  });
});
