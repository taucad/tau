import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type PackageJson = {
  license?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, unknown>;
  files?: string[];
  exports?: Record<string, Record<string, string>>;
  publishConfig?: { exports?: Record<string, Record<string, string>> };
};

const nativeSubpath = './native/opencascade/single';

const readPackageJson = async (): Promise<PackageJson> =>
  JSON.parse(await readFile(resolve(import.meta.dirname, '../package.json'), 'utf8')) as PackageJson;

describe('@taucad/geospec-engine package metadata', () => {
  it('depends on the substrate it registers into', async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.dependencies?.['geospec']).toBe('workspace:*');
  });

  it('keeps @taucad/runtime a direct dependency once it is declared', async () => {
    const packageJson = await readPackageJson();

    // PE2 adds the runtime as a value dependency (createNodeClient). Whenever it
    // is present it must be direct, never an optional peer.
    if (packageJson.dependencies?.['@taucad/runtime'] !== undefined) {
      expect(packageJson.dependencies['@taucad/runtime']).toBe('workspace:*');
    }
    expect(packageJson.peerDependencies?.['@taucad/runtime']).toBeUndefined();
    expect(packageJson.peerDependenciesMeta?.['@taucad/runtime']).toBeUndefined();
  });

  it('does not expose source kernels as optional production peers', async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.peerDependencies?.['@taucad/openrscad']).toBeUndefined();
    expect(packageJson.peerDependencies?.['replicad']).toBeUndefined();
    expect(packageJson.peerDependenciesMeta?.['@taucad/openrscad']).toBeUndefined();
    expect(packageJson.peerDependenciesMeta?.['replicad']).toBeUndefined();
  });

  it('generates its gitignored provenance record before pkgcheck reads it', async () => {
    // F3: `provenance.json` is gitignored and written only by `prepack`, so in a
    // fresh checkout pkgcheck's files-entry assertion fails unless the target
    // chain regenerates it first.
    const packageJson = await readPackageJson();
    const projectJson = JSON.parse(await readFile(resolve(import.meta.dirname, '../project.json'), 'utf8')) as {
      targets: Record<string, { dependsOn?: string[] }>;
    };

    expect(packageJson.files).toContain('provenance.json');
    expect(projectJson.targets['generate-provenance']?.dependsOn).toContain('build');
    expect(projectJson.targets['pkgcheck']?.dependsOn).toContain('generate-provenance');
  });

  it('ships the single-only assembly through its one generated initialiser', async () => {
    // The assembly declares exactly one variant (closeout C1), so `init.js` has
    // nothing to select: no capability probe, one glue URL. It is also the only
    // initialiser `libcascade assemble` still generates — pinned `init.<name>.*`
    // entries and the `./<name>/init` export are emitted solely when there is
    // more than one variant (`@libcascade/toolchain` dist/assemble/index.js:711),
    // so targeting `init.single.js` would ship an orphan that the next
    // `build-wasm` silently stops maintaining.
    const packageJson = await readPackageJson();

    for (const map of [packageJson.exports, packageJson.publishConfig?.exports]) {
      const entry = Object.entries(map?.[nativeSubpath] ?? {});
      expect(entry.length).toBeGreaterThan(0);
      for (const [condition, target] of entry) {
        expect(target).toMatch(condition === 'types' ? /\/init\.d\.ts$/u : /\/init\.js$/u);
      }
    }

    const { default: build } = (await import('../native/opencascade/libcascade.config.js')) as {
      default: { variants: Array<{ name: string }> };
    };
    expect(build.variants.map(({ name }) => name)).toStrictEqual(['single']);

    const assembled = JSON.parse(
      await readFile(resolve(import.meta.dirname, '../native/opencascade/dist/exports.json'), 'utf8'),
    ) as { exports: Record<string, unknown> };
    expect(Object.keys(assembled.exports)).toStrictEqual(['.', './init', './single', './single/wasm']);

    // The eager `index` root and the raw-glue `variant.d.ts` stay unpublished:
    // nothing shipped imports them, and `init.d.ts` reaches only `types.d.ts`.
    const config = await readFile(resolve(import.meta.dirname, '../tsdown.config.ts'), 'utf8');
    const artifacts = [
      ...(/nativeOpenCascadeArtifacts = \[(?<list>[^\]]*)\]/u.exec(config)?.groups?.['list'] ?? '').matchAll(
        /'(?<file>[^']+)'/gu,
      ),
    ].map((match) => match.groups?.['file'] ?? '');

    expect(artifacts).toContain('init.js');
    expect(artifacts).toContain('init.d.ts');
    expect(artifacts.filter((file) => /^index\.|^variant\.d\.ts$|_multi|^init\.single\./u.test(file))).toStrictEqual(
      [],
    );
  });

  it('ships its fair-source licence in the tarball', async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.license).toBe('FSL-1.1-Apache-2.0');
    expect(packageJson.files).toContain('LICENSE');
  });
});
