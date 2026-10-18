/**
 * The skill bundles of the plugins a runtime lists. A plugin package declares its bundles the way every Tau owner does
 * (`package.json` `tau.skills` naming its `skills.json`, documented in `@taucad/skills`); a host that serves a runtime
 * with `--plugin` or `--config` offers the bundles of every plugin it lists, not only the first-party ones
 * `@taucad/skills` ships. Reading a bundle runs no plugin code.
 *
 * @module
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { HostSystemSkillBundle } from '@taucad/host/agent-tools';
import { z } from 'zod';

const manifestSchema = z.object({
  bundles: z.array(
    z.object({
      slug: z.string().regex(/^[\da-z-]+$/u),
      name: z.string().min(1),
      description: z.string().min(1),
      version: z.string().min(1),
      whenToUse: z.string(),
      directory: z.string().min(1),
      files: z.array(z.string().min(1)).min(1),
      body: z.string().optional(),
    }),
  ),
});

/** A package-relative path that stays inside the package, or `undefined`. */
const inside = (path: string): string | undefined => {
  const normalized = posix.normalize(path).replace(/^\.\//u, '');
  return path === '' || path.includes('\\') || posix.isAbsolute(normalized) || normalized.startsWith('..')
    ? undefined
    : normalized;
};

const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

const lineCount = (bytes: Uint8Array<ArrayBuffer>): number =>
  bytes.reduce((count, byte) => count + Number(byte === 0x0a), 1);

/**
 * One plugin package's declared bundles, read from its installed files.
 * @param packageJson - The package's `package.json` path.
 * @returns Its bundles; none when it declares no `tau.skills`.
 * @throws {Error} When a declared manifest or file cannot be read, or leaves the package.
 */
const bundlesOf = async (packageJson: string): Promise<HostSystemSkillBundle[]> => {
  const root = dirname(packageJson);
  const manifest = JSON.parse(await readFile(packageJson, 'utf8')) as { readonly tau?: { readonly skills?: unknown } };
  const declared = manifest.tau?.skills;
  const manifestPath = typeof declared === 'string' ? inside(declared) : undefined;
  if (manifestPath === undefined) {
    return [];
  }
  const { bundles } = manifestSchema.parse(JSON.parse(await readFile(join(root, manifestPath), 'utf8')));
  return Promise.all(
    bundles.map(async (bundle) => {
      const files = await Promise.all(
        bundle.files.map(async (file) => {
          const path = inside(posix.join(posix.dirname(manifestPath), bundle.directory, file));
          if (path === undefined || !file.endsWith('.md')) {
            throw new Error(`${packageJson}: skill file ${file} must be Markdown inside the package.`);
          }
          const bytes = new Uint8Array(await readFile(join(root, path)));
          return {
            path: file,
            url: pathToFileURL(join(root, path)).href,
            byteLength: bytes.byteLength,
            lineCount: lineCount(bytes),
            contentKind: 'text',
            mediaType: 'text/markdown',
            sha256: sha256(bytes),
            text: new TextDecoder().decode(bytes),
          } as const;
        }),
      );
      const fingerprint = sha256(
        new TextEncoder().encode(JSON.stringify(files.map(({ path, sha256: digest }) => ({ path, sha256: digest })))),
      );
      return {
        slug: bundle.slug,
        name: bundle.name,
        description: bundle.description,
        version: bundle.version,
        whenToUse: bundle.whenToUse,
        body: bundle.body ?? files.find(({ path }) => path === 'SKILL.md')?.text ?? '',
        fingerprint,
        files: files.map(({ text: _text, ...file }) => file),
      };
    }),
  );
};

/**
 * The skill bundles the listed plugins' packages declare, resolved from the project root. A plugin whose package
 * cannot be resolved there (a plugin defined in a local module) or declares no bundle contributes none.
 * @param input - The project root, each listed plugin's `meta.name`, and the slugs already offered.
 * @returns The bundles, in plugin order, without a slug already offered or offered twice.
 * @throws {Error} When a package declares a bundle that cannot be read.
 */
export const pluginSkillBundles = async (input: {
  readonly projectRoot: string;
  readonly plugins: readonly string[];
  readonly exclude?: ReadonlySet<string>;
}): Promise<readonly HostSystemSkillBundle[]> => {
  const { resolve } = createRequire(join(input.projectRoot, 'package.json'));
  const packageJsons = input.plugins.flatMap((name) => {
    try {
      return [resolve(`${name}/package.json`)];
    } catch {
      return [];
    }
  });
  const seen = new Set(input.exclude);
  const bundles: HostSystemSkillBundle[] = [];
  const declared = await Promise.all(packageJsons.map(async (path) => bundlesOf(path)));
  for (const bundle of declared.flat()) {
    if (!seen.has(bundle.slug)) {
      seen.add(bundle.slug);
      bundles.push(bundle);
    }
  }
  return bundles;
};
