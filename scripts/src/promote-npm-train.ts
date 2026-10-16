/**
 * Promote a verified npm train to `latest` and deprecate what it replaces (operator-run).
 *
 * The CI train publishes under the `beta` dist-tag only, so `latest` still names whatever was there
 * before: the Trusted Publishing bootstrap placeholders (`0.0.0`, a manifest-only package), the six
 * names published by hand in June 2026, and for `@taucad/replicad` an unrelated replicad fork. This
 * script plans the operator's promotion as one reviewed list of npm commands: `latest` moves to the
 * train for every publishable package, then the placeholders, the fork's versions and the packages
 * the release policy lists as superseded are deprecated with a pointer. It refuses the whole plan when
 * any package lacks the train version or its SLSA provenance attestation, so a partial or hand-made
 * publish is never promoted.
 *
 * Without `--apply` it only prints the commands. With `--apply` it runs them in order with the
 * operator's npm session (`npm login`; npm asks for a one-time password where the account requires
 * one) and stops at the first failure; every command is idempotent, so a rerun continues.
 *
 * Usage: node scripts/src/promote-npm-train.ts --version <version> [--apply]
 * Exit codes: 0 planned (or applied); 1 refused or a command failed; 2 usage.
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { publishable, workspace } from '@taucad/nx';

/** The provenance predicate a trusted publish from `publish.yml` attaches. */
export const slsaProvenanceV1 = 'https://slsa.dev/provenance/v1';

/** Tau's own repository: a version whose manifest names another repository is not Tau's. */
const tauRepository = /github\.com[/:]taucad\/tau(?:\.git)?$/u;

/**
 * Names the release policy retires, with the pointer each deprecation carries (release policy,
 * Superseded Package Deprecations). `@taucad/testing` has no one-to-one replacement and is omitted.
 */
export const supersededPackages: Readonly<Record<string, string>> = {
  '@taucad/converter@0.1.0-beta.0': 'Use @taucad/assimp, @taucad/brep, @taucad/gltf, or @taucad/rhino.',
  '@taucad/events@0.1.0-beta.0': 'Bundled into @taucad/runtime.',
  '@taucad/memory@0.1.0-beta.0': 'Bundled into @taucad/runtime.',
  '@taucad/types@0.1.0-beta.0': 'Use @taucad/runtime/types.',
  '@taucad/json-schema@0.1.0-beta.0': 'Bundled into @taucad/runtime.',
  '@taucad/utils@0.1.0-beta.0': 'Bundled into @taucad/runtime.',
  '@taucad/fs-client@0.1.0-beta.0': 'Use @taucad/runtime/filesystem.',
  '@taucad/telemetry@0.1.0-beta.0': 'Internal Tau application package; no public replacement.',
};

/** What the plan needs to know about one published version. */
export type PublishedVersion = {
  readonly predicateType?: string;
  readonly deprecated?: string;
  readonly repositoryUrl?: string;
};

/** One package's registry state: its dist-tags and every version. */
export type PackageState = {
  readonly distTags: Readonly<Record<string, string>>;
  readonly versions: Readonly<Record<string, PublishedVersion>>;
};

/**
 * Why a version other than the train is deprecated once the train is `latest`, if it is.
 * @param name - The package name.
 * @param version - The other version.
 * @param published - What the registry says about it.
 * @returns The deprecation message, or undefined to leave it alone.
 */
const deprecationFor = (name: string, version: string, published: PublishedVersion): string | undefined => {
  if (published.deprecated !== undefined) {
    return undefined;
  }
  if (version === '0.0.0') {
    return `Trusted Publishing bootstrap placeholder with no code; install ${name}@latest.`;
  }
  if (published.repositoryUrl === undefined || tauRepository.test(published.repositoryUrl)) {
    return undefined;
  }
  return name === '@taucad/replicad'
    ? 'Unrelated replicad fork; use @taulabs/replicad. @taucad/replicad is now the Tau replicad kernel plugin.'
    : `Not published from taucad/tau; install ${name}@latest.`;
};

/** The promotion as npm argument lists, or why it is refused. */
export type PromotionPlan = { readonly refusals: readonly string[]; readonly commands: readonly string[][] };

/**
 * Plan the promotion of `version` for every publishable package.
 * @param version - The train version to promote.
 * @param registry - Each publishable package's registry state, by package name.
 * @param superseded - Package versions to deprecate with their pointer, when they exist and are not yet deprecated.
 * @returns The refusals (non-empty means nothing may run) and the commands in order.
 */
export const planPromotion = (
  version: string,
  registry: Readonly<Record<string, PackageState | undefined>>,
  superseded: Readonly<Record<string, PackageState | undefined>> = {},
): PromotionPlan => {
  const refusals: string[] = [];
  const promote: string[][] = [];
  const deprecate: string[][] = [];

  for (const [name, state] of Object.entries(registry).sort(([a], [b]) => a.localeCompare(b))) {
    const train = state?.versions[version];
    if (train === undefined) {
      refusals.push(`${name}@${version} is not on the registry`);
      continue;
    }
    if (train.predicateType !== slsaProvenanceV1) {
      refusals.push(`${name}@${version} carries no SLSA provenance attestation`);
      continue;
    }
    if (state?.distTags['latest'] !== version) {
      promote.push(['dist-tag', 'add', `${name}@${version}`, 'latest']);
    }
    for (const [other, published] of Object.entries(state?.versions ?? {})) {
      const message = deprecationFor(name, other, published);
      if (message !== undefined) {
        deprecate.push(['deprecate', `${name}@${other}`, message]);
      }
    }
  }

  for (const [spec, message] of Object.entries(supersededPackages)) {
    const at = spec.lastIndexOf('@');
    const published = superseded[spec.slice(0, at)]?.versions[spec.slice(at + 1)];
    if (published !== undefined && published.deprecated === undefined) {
      deprecate.push(['deprecate', spec, message]);
    }
  }

  return { refusals, commands: refusals.length > 0 ? [] : [...promote, ...deprecate] };
};

/**
 * Read one package's state from the public registry.
 * @param name - The package name.
 * @returns Its state, or undefined when the name does not exist.
 * @throws When the registry answers anything but 200 or 404.
 */
const readPackage = async (name: string): Promise<PackageState | undefined> => {
  const response = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}`);
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`registry answered ${String(response.status)} for ${name}`);
  }
  const packument = (await response.json()) as {
    'dist-tags'?: Record<string, string>;
    versions?: Record<
      string,
      {
        deprecated?: string;
        repository?: string | { url?: string };
        dist?: { attestations?: { provenance?: { predicateType?: string } } };
      }
    >;
  };
  return {
    distTags: packument['dist-tags'] ?? {},
    versions: Object.fromEntries(
      Object.entries(packument.versions ?? {}).map(([version, manifest]) => [
        version,
        {
          predicateType: manifest.dist?.attestations?.provenance?.predicateType,
          deprecated: manifest.deprecated,
          repositoryUrl: typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url,
        },
      ]),
    ),
  };
};

const shellQuote = (argument: string): string =>
  /^[\w@./:=-]+$/u.test(argument) ? argument : `'${argument.replaceAll("'", String.raw`'\''`)}'`;

const main = async (): Promise<number> => {
  const arguments_ = process.argv.slice(2);
  const versionIndex = arguments_.indexOf('--version');
  const version = versionIndex === -1 ? undefined : arguments_[versionIndex + 1];
  const apply = arguments_.includes('--apply');
  if (version === undefined || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/u.test(version)) {
    console.error('Usage: node scripts/src/promote-npm-train.ts --version <version> [--apply]');
    return 2;
  }

  const names = publishable(await workspace())
    .map((project) => project.manifest?.name)
    .filter((name): name is string => name !== undefined);
  const registry = Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, await readPackage(name)] as const)),
  );
  const retired = [...new Set(Object.keys(supersededPackages).map((spec) => spec.slice(0, spec.lastIndexOf('@'))))];
  const superseded = Object.fromEntries(
    await Promise.all(retired.map(async (name) => [name, await readPackage(name)] as const)),
  );

  const { refusals, commands } = planPromotion(version, registry, superseded);
  if (refusals.length > 0) {
    console.error(`Refused: ${String(refusals.length)} of ${String(names.length)} packages cannot be promoted:`);
    for (const refusal of refusals) {
      console.error(`- ${refusal}`);
    }
    return 1;
  }

  console.log(
    `${String(names.length)} packages carry ${version} with SLSA provenance; ${String(commands.length)} npm commands:`,
  );
  for (const command of commands) {
    console.log(`npm ${command.map((argument) => shellQuote(argument)).join(' ')}`);
  }
  if (!apply) {
    console.log('Dry run: nothing changed. Rerun with --apply from an npm session to run these commands.');
    return 0;
  }
  for (const command of commands) {
    console.log(`→ npm ${command.map((argument) => shellQuote(argument)).join(' ')}`);
    const result = spawnSync('npm', command, { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(`npm exited ${String(result.status)}; rerun to continue (every command is idempotent).`);
      return 1;
    }
  }
  console.log(`✓ ${version} is latest for ${String(names.length)} packages.`);
  return 0;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error('promote-npm-train failed:', error);
    process.exitCode = 1;
  }
}
