import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { TauSkillsManifest } from '#bundle/bundle.types.js';
import { skillsManifestFile } from '#bundle/bundle.types.js';
import { bundleOwners, generateBundles } from '#bundle/generate.js';
import { maxSkillBodyTokens, maxSkillDescriptionChars } from '#render/render-skill.js';
import { addressableEntries, estimateTokens, planShards, shardIndexById } from '#render/shard-plan.js';

const workspaceRoot = join(import.meta.dirname, '../../../..');

/** Operating-system temporary storage, per `tool-output-location-policy.md` §5. */
const scratch = mkdtempSync(join(tmpdir(), 'tau-bundle-regen-'));

afterAll(() => {
  rmSync(scratch, { force: true, recursive: true });
});

const filesUnder = (directory: string): readonly string[] =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)))
    .sort();

const readManifest = (agentDirectory: string): TauSkillsManifest =>
  JSON.parse(readFileSync(join(agentDirectory, skillsManifestFile), 'utf8')) as TauSkillsManifest;

type ResourceModule = {
  readonly default: readonly [
    {
      readonly slug: string;
      readonly fingerprint: string;
      readonly files: ReadonlyArray<{
        readonly path: string;
        readonly url: string;
        readonly byteLength: number;
        readonly lineCount: number;
        readonly contentKind: 'text';
        readonly mediaType: 'text/markdown';
        readonly sha256: string;
      }>;
    },
  ];
};

const digest = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

/** The `.md` files a rendered body points at. Every one must exist beside it. */
const referencedFiles = (body: string): readonly string[] =>
  [...body.matchAll(/`([\w.-]+\.md)`/gu)].map(([, file]) => file ?? '');

describe('generateBundles', () => {
  beforeAll(async () => {
    await generateBundles({ outputRoot: scratch });
  }, 300_000);

  it.each(bundleOwners.map((owner) => [owner.slug, owner.packageDirectory] as const))(
    '%s is committed exactly as it regenerates',
    (_slug, packageDirectory) => {
      const committed = join(workspaceRoot, packageDirectory, 'agent');
      const regenerated = join(scratch, packageDirectory, 'agent');

      // `doctrine.md` is authored, so it is read from the workspace and never written.
      const expected = filesUnder(committed).filter((file) => file !== 'doctrine.md');
      expect(filesUnder(regenerated)).toStrictEqual(expected);

      for (const file of expected) {
        expect(readFileSync(join(regenerated, file), 'utf8'), `${packageDirectory}/agent/${file} is stale`).toBe(
          readFileSync(join(committed, file), 'utf8'),
        );
      }
    },
    120_000,
  );
});

describe('every committed bundle', () => {
  const declarations = bundleOwners.map((owner) => {
    const agentDirectory = join(workspaceRoot, owner.packageDirectory, 'agent');
    const [declaration] = readManifest(agentDirectory).bundles;
    return { owner, agentDirectory, declaration: declaration ?? undefined };
  });

  it.each(declarations.map((entry) => [entry.owner.slug, entry] as const))(
    '%s declares only files that exist',
    (_slug, entry) => {
      expect(entry.declaration).toBeDefined();
      const bundleDirectory = join(entry.agentDirectory, entry.declaration?.directory ?? '');
      for (const file of entry.declaration?.files ?? []) {
        expect(statSync(join(bundleDirectory, file)).isFile(), `${file} is declared but missing`).toBe(true);
      }
    },
  );

  it.each(declarations.map((entry) => [entry.owner.slug, entry] as const))(
    '%s describes every declared file with exact immutable resource metadata',
    async (_slug, entry) => {
      const module = (await import(pathToFileURL(join(entry.agentDirectory, 'resources.js')).href)) as ResourceModule;
      const [bundle] = module.default;
      expect(Object.isFrozen(module.default)).toBe(true);
      expect(Object.isFrozen(bundle)).toBe(true);
      expect(bundle.slug).toBe(entry.declaration?.slug);
      expect(bundle.files.map(({ path }) => path)).toEqual(entry.declaration?.files);

      const canonical: Array<{ path: string; sha256: string }> = [];
      for (const resource of bundle.files) {
        const bytes = new Uint8Array(readFileSync(new URL(resource.url)));
        const sha256 = digest(bytes);
        canonical.push({ path: resource.path, sha256 });
        expect(resource).toMatchObject({
          byteLength: bytes.byteLength,
          lineCount: bytes.reduce((count, byte) => count + Number(byte === 0x0a), 1),
          contentKind: 'text',
          mediaType: 'text/markdown',
          sha256,
        });
      }
      expect(bundle.fingerprint).toBe(digest(new TextEncoder().encode(JSON.stringify(canonical))));
    },
  );

  it.each(declarations.map((entry) => [entry.owner.slug, entry] as const))(
    '%s points only at files that exist',
    (_slug, entry) => {
      const bundleDirectory = join(entry.agentDirectory, entry.declaration?.directory ?? '');
      const body = readFileSync(join(bundleDirectory, 'SKILL.md'), 'utf8');
      const present = new Set(filesUnder(bundleDirectory));
      for (const file of referencedFiles(body)) {
        expect(present.has(file), `SKILL.md points at ${file}, which the bundle does not contain`).toBe(true);
      }
    },
  );

  it.each(declarations.map((entry) => [entry.owner.slug, entry] as const))(
    '%s stays inside the skill budget',
    (_slug, entry) => {
      const bundleDirectory = join(entry.agentDirectory, entry.declaration?.directory ?? '');
      const markdown = readFileSync(join(bundleDirectory, 'SKILL.md'), 'utf8');
      const body = markdown.replace(/^---\n[\S\s]*?\n---\n/u, '').trim();

      expect(estimateTokens(body)).toBeLessThanOrEqual(maxSkillBodyTokens);
      expect(markdown.split('\n').length).toBeLessThanOrEqual(500);
      expect(entry.declaration?.description.length ?? 0).toBeLessThanOrEqual(maxSkillDescriptionChars);
      expect(entry.declaration?.body).toBe(markdown);
      for (const file of entry.declaration?.files ?? []) {
        expect(file).not.toMatch(/[/\\]/u);
      }
    },
  );

  it.each(declarations.map((entry) => [entry.owner.slug, entry.owner] as const))(
    '%s covers every extracted symbol exactly once',
    (_slug, owner) => {
      expect(owner.corpus).toBeDefined();
      expect(owner.groupBy).toBeDefined();
      if (owner.corpus === undefined || owner.groupBy === undefined) {
        return;
      }

      const corpus = owner.corpus();
      const shards = planShards(corpus, {
        groupBy: owner.groupBy,
        ...(owner.eagerGroups === undefined ? {} : { eagerGroups: owner.eagerGroups() }),
      });
      expect([...shardIndexById(shards).keys()].sort()).toEqual(
        addressableEntries(corpus)
          .map(({ id }) => id)
          .sort(),
      );
    },
    120_000,
  );

  it('leaves no bundle pointing at a host path no agent can address', () => {
    for (const { agentDirectory } of declarations) {
      for (const file of filesUnder(agentDirectory).filter(
        (name) => name.endsWith('SKILL.md') || name === 'doctrine.md',
      )) {
        expect(
          readFileSync(join(agentDirectory, file), 'utf8'),
          `${file} still points into /node_modules`,
        ).not.toContain('/node_modules/');
      }
    }
  });

  it('keeps OpenCascade complete without redistributing upstream prose', () => {
    const corpus = bundleOwners.find(({ slug }) => slug === 'cad-opencascadejs')?.corpus?.();
    expect(corpus?.entries).toHaveLength(5712);
    expect(corpus?.metadata.totalEntries).toBe(65_053);

    const serialized = JSON.stringify(corpus);
    expect(serialized).not.toContain('"docs"');
    expect(serialized).not.toContain('"description":');
    expect(serialized).not.toMatch(/"deprecated":"/u);
  });
});

describe('skill declarations', () => {
  const packageDirectories = [
    ...readdirSync(join(workspaceRoot, 'packages/plugins'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `packages/plugins/${entry.name}`),
    'packages/geospec',
  ];

  it('requires every plugin and skill-bearing package to declare tau.skills or a reasoned null', () => {
    const manifestOwners: string[] = [];
    for (const packageDirectory of packageDirectories) {
      const manifest = JSON.parse(readFileSync(join(workspaceRoot, packageDirectory, 'package.json'), 'utf8')) as {
        readonly tau?: { readonly skills?: unknown; readonly reason?: string };
      };
      expect(manifest.tau, `${packageDirectory} has no tau declaration`).toBeDefined();
      expect(Object.hasOwn(manifest.tau ?? {}, 'skills'), `${packageDirectory} is silent about skills`).toBe(true);
      if (manifest.tau?.skills === null) {
        expect(manifest.tau.reason?.trim(), `${packageDirectory} needs a reason for tau.skills: null`).not.toBe('');
      } else {
        expect(manifest.tau?.skills).toBe('./agent/skills.json');
        manifestOwners.push(packageDirectory);
      }
    }

    expect(manifestOwners.sort()).toEqual(bundleOwners.map(({ packageDirectory }) => packageDirectory).sort());
  });
});
