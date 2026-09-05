/**
 * Scans the example fixture directories and generates:
 *   - src/manifest.json  — machine-readable manifest of all examples
 *   - src/manifest.ts    — TypeScript types derived from the manifest
 *   - src/builtin.ts     — strict public manifests and lazy byte-exact Vite assets
 *   - src/test-fixtures.ts — explicit test-only manifests and lazy assets
 *
 * Run via:  pnpm nx generate-manifest tau-examples
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectManifestSchema } from '@taucad/types';
import type { ProjectManifest } from '@taucad/types';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = join(rootDirectory, 'src');
const kernelsDirectory = join(sourceDirectory, 'kernels');
const check = process.argv.includes('--check');

type ManifestEntry = {
  kind: ExampleKind;
  geometry: '2d' | '3d';
  kernel: string;
  name: string;
  mainFile?: string;
  files: string[];
};

type ExampleKind = 'model' | 'test-fixture' | 'spec-fixture' | 'reference';

type BuiltinEntry = {
  readonly locator: string;
  readonly kernel: string;
  readonly name: string;
  readonly manifest: ProjectManifest;
  readonly files: readonly string[];
  readonly textFiles: ReadonlySet<string>;
};

const candidateMainFiles = ['main.ts', 'main.py', 'main.cs', 'main.scad', 'main.cpp'] as const;
const excludedDirectories = new Set(['.tau', '__pycache__']);
const excludedFiles = new Set(['example.json', 'thumbnail.webp']);

function readExampleConfig(directory: string): Pick<ManifestEntry, 'kind' | 'geometry'> {
  const path = join(directory, 'example.json');
  if (!existsSync(path)) {
    return { kind: 'model', geometry: '3d' };
  }
  const config = JSON.parse(readFileSync(path, 'utf8')) as { kind?: unknown; geometry?: unknown };
  const kind = config.kind ?? 'model';
  const geometry = config.geometry ?? '3d';
  if (
    (kind === 'model' || kind === 'test-fixture' || kind === 'spec-fixture' || kind === 'reference') &&
    (geometry === '2d' || geometry === '3d')
  ) {
    return { kind, geometry };
  }
  throw new Error(`Invalid example config in ${path}`);
}

function scanFiles(directory: string, prefix = ''): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || excludedDirectories.has(entry.name)) {
      continue;
    }

    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(directory, entry.name);
    if (relativePath === '.tau/cache' || relativePath.startsWith('.tau/cache/')) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...scanFiles(absolutePath, relativePath));
      continue;
    }

    if (entry.isFile() && !excludedFiles.has(entry.name)) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

function scanFixtures(): ManifestEntry[] {
  const entries: ManifestEntry[] = [];

  for (const kernelEntry of readdirSync(kernelsDirectory, { withFileTypes: true })) {
    // Skip dot/cache directories at the kernel level too: a `.tau/` runtime
    // cache at the kernels root would otherwise register as a kernel.
    if (!kernelEntry.isDirectory() || kernelEntry.name.startsWith('.') || excludedDirectories.has(kernelEntry.name)) {
      continue;
    }

    const kernelDirectory = join(kernelsDirectory, kernelEntry.name);

    for (const exampleEntry of readdirSync(kernelDirectory, {
      withFileTypes: true,
    })) {
      if (
        !exampleEntry.isDirectory() ||
        exampleEntry.name.startsWith('.') ||
        excludedDirectories.has(exampleEntry.name)
      ) {
        continue;
      }

      const exampleDirectory = join(kernelDirectory, exampleEntry.name);
      const files = scanFiles(exampleDirectory);

      if (files.length === 0) {
        continue;
      }

      const mainFile = candidateMainFiles.find((candidate) => files.includes(candidate));
      entries.push({
        ...readExampleConfig(exampleDirectory),
        kernel: kernelEntry.name,
        name: exampleEntry.name,
        ...(mainFile ? { mainFile } : {}),
        files,
      });
    }
  }

  return entries.sort((a, b) => a.kernel.localeCompare(b.kernel) || a.name.localeCompare(b.name));
}

function scanBuiltinFiles(directory: string, prefix = ''): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.DS_Store' || entry.name === 'example.json') {
      continue;
    }
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(directory, entry.name);
    if (relativePath === '.tau/cache' || relativePath.startsWith('.tau/cache/')) {
      continue;
    }
    if (entry.isSymbolicLink()) {
      throw new Error(`Builtin project contains a symbolic link: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...scanBuiltinFiles(absolutePath, relativePath));
      continue;
    }
    if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

function scanBuiltins(entries: readonly ManifestEntry[]): BuiltinEntry[] {
  const ids = new Set<string>();
  const locators = new Set<string>();
  const builtins: BuiltinEntry[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'model') {
      continue;
    }
    const directory = join(kernelsDirectory, entry.kernel, entry.name);
    const manifestPath = join(directory, 'tau.json');
    if (!existsSync(manifestPath)) {
      continue;
    }
    const manifest = projectManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
    const locator = `${entry.kernel}.${entry.name}`;
    if (ids.has(manifest.id)) {
      throw new Error(`Duplicate builtin project id: ${manifest.id}`);
    }
    if (locators.has(locator)) {
      throw new Error(`Duplicate builtin locator: ${locator}`);
    }
    ids.add(manifest.id);
    locators.add(locator);
    const files = scanBuiltinFiles(directory);
    const requiredPaths = [manifest.assets.main.entryPath, manifest.assets.main.thumbnail].filter(
      (path): path is string => path !== undefined,
    );
    for (const path of requiredPaths) {
      if (!files.includes(path)) {
        throw new Error(`Builtin ${locator} references missing asset: ${path}`);
      }
    }
    const textFiles = new Set(
      files.filter((path) => {
        const content = readFileSync(join(directory, path));
        if (content.includes(0)) {
          return false;
        }
        try {
          new TextDecoder('utf-8', { fatal: true }).decode(content);
          return true;
        } catch {
          return false;
        }
      }),
    );
    builtins.push({ locator, kernel: entry.kernel, name: entry.name, manifest, files, textFiles });
  }
  return builtins.sort((left, right) => left.locator.localeCompare(right.locator, 'en'));
}

const isValidIdentifier = (name: string): boolean => /^[$A-Z_a-z][\w$]*$/.test(name);

const formatKey = (name: string): string => (isValidIdentifier(name) ? name : `'${name}'`);

function generateManifestJson(entries: ManifestEntry[]): string {
  return JSON.stringify(entries, null, 2) + '\n';
}

function generateManifestTs(entries: ManifestEntry[]): string {
  const byKernel = new Map<string, string[]>();
  for (const entry of entries) {
    const list = byKernel.get(entry.kernel) ?? [];
    list.push(entry.name);
    byKernel.set(entry.kernel, list);
  }

  const lines: string[] = [
    '/* oxlint-disable prettier/prettier -- Auto-generated code. */',
    '// AUTO-GENERATED by scripts/generate-manifest.ts — DO NOT EDIT.',
    '// Run `pnpm nx generate-manifest tau-examples` to regenerate.',
    '',
    '/** Ownership class for one Tau example inventory row. */',
    "export type ExampleKind = 'model' | 'test-fixture' | 'spec-fixture' | 'reference';",
    '',
    '/** Map of kernel names to their available example fixture names. */',
    'export type ExampleManifest = {',
  ];

  for (const [kernel, examples] of [...byKernel.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const names = examples
      .sort()
      .map((n) => `'${n}'`)
      .join(' | ');
    lines.push(`  ${formatKey(kernel)}: ${names};`);
  }

  lines.push(
    '};',
    '',
    '/** Available kernel names. */',
    'export type KernelName = keyof ExampleManifest;',
    '',
    '/** Available example names for a given kernel. */',
    'export type ExampleName<K extends KernelName> = ExampleManifest[K];',
    '',
  );

  return lines.join('\n');
}

function generateBuiltinTs(entries: readonly BuiltinEntry[]): string {
  const imports: string[] = [];
  const thumbnailName = new Map<string, string>();
  const textAssetPaths: string[] = [];
  const binaryAssetPaths: string[] = [];
  for (const entry of entries) {
    for (const file of entry.files) {
      const path = `./kernels/${entry.kernel}/${entry.name}/${file}`;
      (entry.textFiles.has(file) ? textAssetPaths : binaryAssetPaths).push(path);
    }
    const { thumbnail } = entry.manifest.assets.main;
    if (thumbnail) {
      const key = `${entry.kernel}/${entry.name}/${thumbnail}`;
      const name = `thumbnail${thumbnailName.size}`;
      thumbnailName.set(key, name);
      imports.push(`import ${name} from ${JSON.stringify(`./kernels/${key}?url`)};`);
    }
  }

  const lines = [
    '/* oxlint-disable prettier/prettier, eslint/no-restricted-imports -- Auto-generated Vite asset imports. */',
    '// AUTO-GENERATED by scripts/generate-manifest.mts — DO NOT EDIT.',
    '// Run `pnpm nx generate-manifest tau-examples` to regenerate.',
    "import type { ProjectManifest } from '@taucad/types';",
    ...imports,
    '',
    'const textAssetLoaders = import.meta.glob<string>(',
    `  ${JSON.stringify(textAssetPaths)},`,
    "  { query: '?raw', import: 'default' },",
    ');',
    'const binaryAssetLoaders = import.meta.glob<string>(',
    `  ${JSON.stringify(binaryAssetPaths)},`,
    "  { query: '?inline&url', import: 'default' },",
    ');',
    '',
    'const loadTextAsset = async (path: string): Promise<Uint8Array<ArrayBuffer>> => {',
    '  const load = textAssetLoaders[path];',
    '  if (!load) {',
    "    throw new Error('Builtin text asset is unavailable: ' + path);",
    '  }',
    '  return new TextEncoder().encode(await load());',
    '};',
    '',
    'const loadBinaryAsset = async (path: string): Promise<Uint8Array<ArrayBuffer>> => {',
    '  const load = binaryAssetLoaders[path];',
    '  if (!load) {',
    "    throw new Error('Builtin binary asset is unavailable: ' + path);",
    '  }',
    '  const dataUrl = await load();',
    "  const separator = dataUrl.indexOf(',');",
    "  if (separator === -1 || !dataUrl.slice(0, separator).endsWith(';base64')) {",
    "    throw new Error('Builtin binary asset encoding is invalid: ' + path);",
    '  }',
    '  const binary = globalThis.atob(dataUrl.slice(separator + 1));',
    '  const content = new Uint8Array(binary.length);',
    '  for (let index = 0; index < binary.length; index += 1) {',
    '    content[index] = binary.codePointAt(index) ?? 0;',
    '  }',
    '  return content;',
    '};',
    '',
    '/** One lazily loaded, byte-exact file in a manifest-backed builtin project. @public */',
    'export type BuiltinExampleAsset = {',
    '  readonly path: string;',
    '  readonly load: () => Promise<Uint8Array<ArrayBuffer>>;',
    '};',
    '',
    '/** Trusted metadata and lazy files for one builtin shared project. @public */',
    'export type BuiltinExample = {',
    '  readonly locator: string;',
    '  readonly kernel: string;',
    '  readonly manifest: ProjectManifest;',
    '  readonly thumbnailUrl?: string;',
    '  readonly assets: readonly BuiltinExampleAsset[];',
    '};',
    '',
    '/** Manifest-backed builtin projects available through `/s/builtin~...`. @public */',
    'export const builtinExamples = [',
  ];
  for (const entry of entries) {
    const prefix = `${entry.kernel}/${entry.name}/`;
    const { thumbnail } = entry.manifest.assets.main;
    lines.push(
      '  {',
      `    locator: ${JSON.stringify(entry.locator)},`,
      `    kernel: ${JSON.stringify(entry.kernel)},`,
      `    manifest: ${JSON.stringify(entry.manifest)},`,
      ...(thumbnail ? [`    thumbnailUrl: ${thumbnailName.get(`${prefix}${thumbnail}`)},`] : []),
      '    assets: [',
      ...entry.files.map(
        (file) =>
          `      { path: ${JSON.stringify(file)}, load: ${
            entry.textFiles.has(file) ? 'loadTextAsset' : 'loadBinaryAsset'
          }.bind(undefined, ${JSON.stringify(`./kernels/${prefix}${file}`)}) },`,
      ),
      '    ],',
      '  },',
    );
  }
  lines.push(
    '] as const satisfies readonly BuiltinExample[];',
    '',
    '/** Find one builtin without loading its source bytes. @public */',
    'export const findBuiltinExample = (locator: string): BuiltinExample | undefined =>',
    '  builtinExamples.find((example) => example.locator === locator);',
    '',
  );
  return lines.join('\n');
}

function generateTestFixtureTs(entries: readonly BuiltinEntry[]): string {
  return generateBuiltinTs(entries)
    .replaceAll('BuiltinExampleAsset', 'TestFixtureAsset')
    .replaceAll('BuiltinExample', 'TestFixture')
    .replaceAll('builtinExamples', 'testFixtures')
    .replaceAll('findBuiltinExample', 'findTestFixture')
    .replaceAll('Builtin project', 'Test fixture')
    .replaceAll('Builtin text asset', 'Test fixture text asset')
    .replaceAll('Builtin binary asset', 'Test fixture binary asset')
    .replace('builtin shared project', 'test fixture project')
    .replace('builtin project', 'test fixture project')
    .replace(
      'Manifest-backed builtin projects available through `/s/builtin~...`.',
      'Manifest-backed projects available only to test seed routes.',
    )
    .replace(
      'Find one builtin without loading its source bytes.',
      'Find one test fixture without loading its source bytes.',
    );
}

function writeGenerated(path: string, content: string): void {
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content) {
      throw new Error(`Generated output is stale: ${path}`);
    }
    return;
  }
  writeFileSync(path, content);
}

const entries = scanFixtures();
const builtins = scanBuiltins(entries);
const testFixtures = scanBuiltins(
  entries.filter((entry) => entry.kind === 'test-fixture').map((entry) => ({ ...entry, kind: 'model' })),
);

writeGenerated(join(sourceDirectory, 'manifest.json'), generateManifestJson(entries));
writeGenerated(join(sourceDirectory, 'manifest.ts'), generateManifestTs(entries));
writeGenerated(join(sourceDirectory, 'builtin.ts'), generateBuiltinTs(builtins));
writeGenerated(join(sourceDirectory, 'test-fixtures.ts'), generateTestFixtureTs(testFixtures));

const kernelCount = new Set(entries.map((entry) => entry.kernel)).size;
console.log(
  `${check ? 'Checked' : 'Generated'} manifest: ${entries.length} entries, ${entries.filter(({ kind }) => kind === 'model').length} models (${builtins.length} public builtins), ${testFixtures.length} test fixtures across ${kernelCount} kernels`,
);
