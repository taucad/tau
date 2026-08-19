import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/publish.yml'), 'utf8');

describe('release publish workflow', () => {
  it('runs the complete runtime suite without exhausting the Replicad WASM heap', () => {
    expect(workflow).toContain(
      'vitest run --no-file-parallelism --exclude src/kernels/replicad/replicad.kernel.test.ts',
    );
    expect(workflow).toContain(
      "-t 'getParameters|defaultName extraction via geometry output|createGeometry|exportGeometry|Named shapes and colors|TypeScript bundling'",
    );
    expect(workflow).toContain(
      "-t '^(?!.*(getParameters|defaultName extraction via geometry output|createGeometry|exportGeometry|Named shapes and colors|TypeScript bundling)).*$'",
    );
  });

  it('publishes the fixed-version train in dependency order without publishing bundled libraries', () => {
    const steps = [
      'Verify live registry dependencies',
      'Prove npm-local TGZs for the release train',
      'Dry-run dependency-ordered publish',
      'Publish runtime',
      'Publish runtime veneers and GeoSpec',
      'Publish GeoSpec engine',
    ].map((name) => workflow.indexOf(`name: ${name}`));

    expect(steps.every((position) => position >= 0)).toBe(true);
    expect(steps).toEqual([...steps].sort((left, right) => left - right));
    expect(workflow).not.toContain('Publish registry substrate');
    expect(workflow).not.toContain('nx-release-publish -p types,json-schema,units');
    expect(workflow).toContain('nx-release-publish -p runtime --excludeTaskDependencies --tag=beta');
    expect(workflow).toContain(
      'nx-release-publish -p react,cli,openrscad,geospec --excludeTaskDependencies --tag=beta',
    );
    expect(workflow).toContain('nx-release-publish -p geospec-engine --excludeTaskDependencies --tag=beta');
    expect(workflow).not.toContain('nx release publish');
    expect(workflow).toContain('node scripts/src/check-pack-install.ts');
    expect(workflow).not.toContain('pnpm runtime:npm-local-smoke');
    expect(workflow).not.toContain('runtime:pack-smoke');
  });

  it('asserts pnpm is the publisher before anything is published', () => {
    expect(workflow).toContain("packageManager.startsWith('pnpm@')");
    expect(workflow.indexOf('name: Assert pnpm is the publisher')).toBeGreaterThanOrEqual(0);
    expect(workflow.indexOf('name: Assert pnpm is the publisher')).toBeLessThan(
      workflow.indexOf('name: Dry-run dependency-ordered publish'),
    );
  });

  it('asserts the release project selectors before anything runs under them', () => {
    expect(workflow).toContain('pnpm release:check-projects');
    expect(workflow.indexOf('name: Assert release project selectors')).toBeGreaterThanOrEqual(0);
    expect(workflow.indexOf('name: Assert release project selectors')).toBeLessThan(
      workflow.indexOf('name: Build release train'),
    );
  });

  it('gates every private bundle member and the telemetry application boundary before dry-run', () => {
    expect(workflow).toContain(
      '--projects=converter,events,filesystem,fs-bridge,gltf-extensions,json-schema,memory,rpc,types,units,utils,vm,geospec,geospec-engine,react,cli,openrscad,telemetry',
    );
    expect(workflow).toContain('src/telemetry-release-partition.test.ts');
    expect(workflow.indexOf('src/telemetry-release-partition.test.ts')).toBeLessThan(
      workflow.indexOf('name: Dry-run dependency-ordered publish'),
    );
  });
});
