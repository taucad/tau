import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { TauSkillsManifest } from '#bundle/bundle.types.js';
import { skillsManifestFile } from '#bundle/bundle.types.js';
import { bundleOwners, generateBundles, usageRanking } from '#bundle/generate.js';
import {
  maxSkillBodyTokens,
  maxSkillDescriptionChars,
  workbenchSkillBodyTokens,
  workbenchSkillDescriptionChars,
} from '#render/render-skill.js';
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

describe('GeoSpec reference roles', () => {
  it('should retain canonical authoring and complete public host reference separately', () => {
    const owner = bundleOwners.find((entry) => entry.slug === 'geospec-authoring');
    const primary = owner?.corpus?.();
    const supplemental = owner?.supplementalApi?.corpus();
    expect(primary?.entries.some((entry) => entry.name === 'expectGeo')).toBe(true);
    expect(primary?.entries.some((entry) => entry.name === 'loadModel')).toBe(true);
    expect(primary?.entries.some((entry) => entry.name === 'GeoSpecAssertionClient')).toBe(false);
    expect(supplemental?.entries.some((entry) => entry.name === 'GeoSpecAssertionClient')).toBe(true);
    expect(supplemental?.entries.some((entry) => entry.name === 'expectGeo')).toBe(true);
    expect(owner?.supplementalApi?.prefix).toBe('public');
    expect(owner?.description).toContain('TypeScript or JavaScript');
    const [classEntry] = primary?.entries.filter((entry) => entry.kind === 'class') ?? [];
    if (classEntry === undefined || owner?.groupBy === undefined) {
      throw new Error('Expected a public class');
    }
    expect(owner.groupBy(classEntry)).toBe('Classes');
  }, 120_000);
});

describe('generateBundles', () => {
  beforeAll(async () => {
    await generateBundles({ outputRoot: scratch });
  }, 300_000);

  it.each(bundleOwners.map((owner) => [owner.slug, owner.packageDirectory] as const))(
    '%s publishes a standalone declaration for its JSON manifest',
    (_slug, packageDirectory) => {
      const declaration = readFileSync(join(scratch, packageDirectory, 'agent/skills.d.cts'), 'utf8');
      expect(declaration).toContain('readonly bundles: ReadonlyArray<{');
      expect(declaration).toContain('readonly body: string;');
      expect(declaration).toContain('export = manifest;');
      expect(declaration).not.toMatch(/\b(?:import|from)\b/u);
    },
  );

  it('ships the approved workbench content with the document API names and canonical record field', () => {
    const shipped = readFileSync(join(workspaceRoot, 'packages/workbench/agent/workbench/SKILL.md'), 'utf8');
    // The document API migration retains evaluate_model while durable records retain renderTimeout;
    // INVALID_RECORD guidance points at the project's Settings not applied action.
    expect(digest(Buffer.from(shipped))).toBe('a6bf45e64c0b5e96e44523ed13c57affec8d8a7379fe23b4e6be7b99c89e812b');
  });

  it('should expose all PicoVoxel Tau authoring types through the shipped reference index', () => {
    const agent = join(scratch, 'packages/plugins/picovoxel/agent');
    const [bundle] = readManifest(agent).bundles;
    expect(bundle?.files).toContain('tau-api-index.md');
    const directory = join(agent, 'cad-picovoxel');
    expect(readFileSync(join(directory, 'SKILL.md'), 'utf8')).toContain('tau-api-index.md');
    const index = readFileSync(join(directory, 'tau-api-index.md'), 'utf8');
    for (const name of ['PicovoxelPart', 'PicovoxelModel', 'PicovoxelResult', 'Material', 'Image', 'Resources']) {
      expect(index).toContain(`${name} (`);
    }
  });

  it('should ship PicoVoxel motion guidance and share the name vocabulary with Replicad', () => {
    const agent = join(scratch, 'packages/plugins/picovoxel/agent');
    const [bundle] = readManifest(agent).bundles;
    expect(bundle?.description).toContain('mechanisms');
    expect(bundle?.files).toContain('kinematics-reference.md');
    const body = readFileSync(join(agent, 'cad-picovoxel/SKILL.md'), 'utf8');
    expect(body).toContain('kinematics-reference.md');
    for (const kernel of ['picovoxel', 'replicad']) {
      const reference = readFileSync(
        join(scratch, `packages/plugins/${kernel}/agent/cad-${kernel}/kinematics-reference.md`),
        'utf8',
      );
      expect(reference).toContain('MechanismSource<ShapeName>');
      expect(reference).toContain('LinkSource<ShapeName>');
    }
    const reference = readFileSync(join(agent, 'cad-picovoxel/kinematics-reference.md'), 'utf8');
    expect(reference).toContain('includeTopology: true');
    expect(reference).toContain('STL carries no mechanism');
  });

  it.each(bundleOwners.map((owner) => [owner.slug, owner.packageDirectory] as const))(
    '%s is committed exactly as it regenerates',
    (_slug, packageDirectory) => {
      const committed = join(workspaceRoot, packageDirectory, 'agent');
      const regenerated = join(scratch, packageDirectory, 'agent');

      // Authored files are read from the workspace, not regenerated in the agent root.
      const expected = filesUnder(committed).filter(
        (file) =>
          file !== 'doctrine.md' &&
          !bundleOwners.some(
            (owner) => owner.packageDirectory === packageDirectory && owner.authoredReferences?.includes(file),
          ),
      );
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
    '%s contains no text that electron-vite reads as a static import',
    (_slug, entry) => {
      // Electron-vite 6 `vite:esm-shim` (ESMStaticImportRe) splices a shim after the last match, strings included.
      const esmStaticImport =
        /(?<=\s|^|;)import\s*([\s"']*(?<imports>[\p{L}\p{M}\w\t\n\r $*,/{}@.]+)from\s*)?["']\s*(?<specifier>(?<="\s*)[^"]*[^\s"](?=\s*")|(?<='\s*)[^']*[^\s'](?=\s*'))\s*["'][\s;]*/mu;
      expect(readFileSync(join(entry.agentDirectory, 'resources.js'), 'utf8')).not.toMatch(esmStaticImport);
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

      const bodyLimit = entry.owner.slug === 'workbench' ? workbenchSkillBodyTokens : maxSkillBodyTokens;
      const descriptionLimit =
        entry.owner.slug === 'workbench' ? workbenchSkillDescriptionChars : maxSkillDescriptionChars;
      expect(estimateTokens(body)).toBeLessThanOrEqual(bodyLimit);
      expect(markdown.split('\n').length).toBeLessThanOrEqual(500);
      expect(entry.declaration?.description.length ?? 0).toBeLessThanOrEqual(descriptionLimit);
      expect(entry.declaration?.body).toBe(markdown);
      for (const file of entry.declaration?.files ?? []) {
        expect(file).not.toMatch(/[/\\]/u);
      }
    },
  );

  // Doctrine-only owners (no `corpus`) have no extracted symbols to cover.
  it.each(
    declarations
      .filter(({ owner }) => owner.corpus !== undefined)
      .map((entry) => [entry.owner.slug, entry.owner] as const),
  )(
    '%s covers every extracted symbol exactly once',
    (_slug, owner) => {
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
      if (owner.supplementalApi !== undefined) {
        const { corpus: loadCorpus, groupBy } = owner.supplementalApi;
        const supplemental = loadCorpus();
        expect([...shardIndexById(planShards(supplemental, { groupBy })).keys()].sort()).toEqual(
          addressableEntries(supplemental)
            .map(({ id }) => id)
            .sort(),
        );
      }
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
    const entryPoint = join(
      workspaceRoot,
      'libs/api-extractor/src/generated/opencascade/modules/libcascade/index.d.ts',
    );
    const program = ts.createProgram([entryPoint], {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
    });
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(entryPoint);
    const moduleSymbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
    if (moduleSymbol === undefined) {
      throw new Error('Expected the shipped OpenCascade declaration module');
    }
    const exports = checker.getExportsOfModule(moduleSymbol);
    // Previously omitted object-alias/value members: both instance addresses
    // plus the two declared option records, not new roots or overload entries.
    const memberCounts = [
      ['OpenCascadeInstance', 5118],
      ['default', 5118],
      ['CreateInstanceOptions', 7],
      ['InitOpenCascadeOptions', 5],
    ] as const;
    for (const [name, count] of memberCounts) {
      const symbol = exports.find((candidate) => candidate.name === name);
      const exportedDeclaration = symbol?.getDeclarations()?.[0];
      const declaration =
        symbol !== undefined &&
        exportedDeclaration !== undefined &&
        (ts.isExportSpecifier(exportedDeclaration) || ts.isExportAssignment(exportedDeclaration))
          ? checker.getAliasedSymbol(symbol).getDeclarations()?.[0]
          : exportedDeclaration;
      if (declaration === undefined) {
        throw new Error(`Expected declaration for ${name}`);
      }
      const properties = checker.getTypeAtLocation(declaration).getProperties();
      const members = corpus?.entries.find((entry) => entry.name === name)?.members;
      expect(properties).toHaveLength(count);
      expect(members?.map(({ name }) => name).sort()).toEqual(properties.map(({ name }) => name).sort());
    }
    // 2574: the values of `type E = typeof E[keyof typeof E]` enums, read from their `const E` twins.
    expect(corpus?.metadata.totalEntries).toBe(65_053 + 5118 + 5118 + 7 + 5 + 2574);

    const serialized = JSON.stringify(corpus);
    expect(serialized).not.toContain('"docs"');
    expect(serialized).not.toContain('"description":');
    expect(serialized).not.toMatch(/"deprecated":"/u);
  }, 120_000);
});

describe('committed usage rankings', () => {
  // A re-extraction that renames ids would otherwise drop their scores without a signal.
  it.each(bundleOwners.filter((owner) => owner.core !== undefined).map((owner) => [owner.slug, owner] as const))(
    '%s names only symbols its corpora still declare',
    (slug, owner) => {
      const corpora = [owner.corpus?.(), owner.supplementalApi?.corpus()].filter((corpus) => corpus !== undefined);
      const declared = new Set(corpora.flatMap((corpus) => addressableEntries(corpus).map(({ id }) => id)));
      const missing = usageRanking(slug)
        .symbols.map(({ id }) => id)
        .filter((id) => !declared.has(id));
      expect(missing).toEqual([]);
    },
    120_000,
  );
});

describe('skill declarations', () => {
  const packageDirectories = [
    ...readdirSync(join(workspaceRoot, 'packages/plugins'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `packages/plugins/${entry.name}`),
    'packages/geospec',
    'packages/workbench',
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
