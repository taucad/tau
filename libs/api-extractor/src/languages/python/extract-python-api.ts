#!/usr/bin/env node
/**
 * The Python front-end: CPython describes its own API, TypeScript shapes the corpus.
 *
 * Tau already vendors a checksum-verified CPython with `build123d` installed for
 * the desktop kernel, so the extractor borrows that interpreter rather than
 * introducing a second Python toolchain. The interpreter runs isolated (`-I`)
 * and answers on stdout in JSON; nothing Python-side reaches the model directly.
 *
 * @module
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

import type {
  ApiCorpus,
  ApiEntryKind,
  ApiLanguageSpecific,
  ApiParameter,
  ApiSignature,
} from '#model/api-corpus.types.js';
import type { ApiEntryDraft } from '#model/api-corpus.js';
import { createApiCorpus } from '#model/api-corpus.js';

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const pythonResourceRoot = join(repoRoot, 'apps/desktop/resources/python');

/** The parameter-kind map {@link ApiLanguageSpecific} allows for Python. */
type PythonParameterKinds = NonNullable<Extract<ApiLanguageSpecific, { language: 'python' }>['parameterKinds']>;

/** A parameter as the Python side reports it. Types arrive as source text. */
type RawParameter = {
  readonly name: string;
  readonly optional: boolean;
  readonly type?: string;
  readonly defaultValue?: string;
  readonly variadic?: boolean;
  readonly description?: string;
};

type RawSignature = {
  readonly parameters: readonly RawParameter[];
  readonly text: string;
  readonly returnType?: string;
};

type RawEntry = {
  readonly name: string;
  readonly kind: ApiEntryKind;
  readonly path?: string;
  readonly category?: string;
  readonly type?: string;
  readonly signatures?: readonly RawSignature[];
  readonly docs?: ApiEntryDraft['docs'];
  readonly static?: boolean;
  readonly source?: ApiEntryDraft['source'];
  readonly parameterKinds?: PythonParameterKinds;
  readonly members?: readonly RawEntry[];
};

type RawPayload = {
  readonly package: string;
  readonly version: string;
  readonly python: string;
  readonly entries: readonly RawEntry[];
};

/**
 * The vendored interpreter for this platform.
 *
 * @returns Absolute path to the CPython that has `build123d` installed.
 * @throws When the runtime has not been prepared for this target.
 */
export const resolvePythonExecutable = (): string => {
  const target = `${process.platform}-${process.arch}`;
  const executable = join(pythonResourceRoot, target, process.platform === 'win32' ? 'python.exe' : 'bin/python3');
  if (!existsSync(executable)) {
    throw new Error(
      `Vendored CPython not found for ${target} at ${executable}.\n` +
        'Run the following to download and verify it, then re-run this extractor:\n' +
        '  pnpm nx run desktop:prepare-build123d-python',
    );
  }
  return executable;
};

const typeRef = (text: string | undefined): { readonly text: string } | undefined =>
  text === undefined || text === '' ? undefined : { text };

const toSignature = (raw: RawSignature): ApiSignature => ({
  parameters: raw.parameters.map(
    (parameter) =>
      ({
        name: parameter.name,
        optional: parameter.optional,
        ...(typeRef(parameter.type) === undefined ? {} : { type: typeRef(parameter.type) }),
        ...(parameter.defaultValue === undefined ? {} : { defaultValue: parameter.defaultValue }),
        ...(parameter.variadic === true ? { variadic: true } : {}),
        ...(parameter.description === undefined ? {} : { description: parameter.description }),
      }) satisfies ApiParameter,
  ),
  text: raw.text,
  ...(typeRef(raw.returnType) === undefined ? {} : { returnType: typeRef(raw.returnType) }),
});

const toDraft = (raw: RawEntry): ApiEntryDraft => ({
  name: raw.name,
  kind: raw.kind,
  ...(raw.path === undefined ? {} : { path: raw.path }),
  ...(raw.category === undefined ? {} : { category: raw.category }),
  ...(typeRef(raw.type) === undefined ? {} : { type: typeRef(raw.type) }),
  ...(raw.signatures === undefined ? {} : { signatures: raw.signatures.map(toSignature) }),
  ...(raw.docs === undefined ? {} : { docs: raw.docs }),
  ...(raw.static === true ? { static: true } : {}),
  ...(raw.source === undefined ? {} : { source: raw.source }),
  ...(raw.members === undefined ? {} : { members: raw.members.map(toDraft) }),
  languageSpecific: {
    language: 'python',
    ...(raw.parameterKinds === undefined ? {} : { parameterKinds: raw.parameterKinds }),
  },
});

/**
 * Extract one installed Python package's public API surface.
 *
 * @param packageName - Importable package, e.g. `build123d`.
 * @returns The corpus, with ids assigned and totals derived by the model.
 * @public
 *
 * @example <caption>Extract the build123d surface</caption>
 * ```typescript
 * import { extractPythonApi } from '#languages/python/extract-python-api.js';
 *
 * const corpus = extractPythonApi('build123d');
 * console.log(corpus.metadata.totalEntries);
 * ```
 */
export const extractPythonApi = (packageName: string): ApiCorpus => {
  const script = join(import.meta.dirname, 'extract-python-api.py');
  const stdout = execFileSync(resolvePythonExecutable(), ['-I', script, packageName], {
    encoding: 'utf8',
    // The surface is megabytes of JSON; the 1 MiB default truncates it into a parse error.
    maxBuffer: 256 * 1024 * 1024,
  });
  const payload = JSON.parse(stdout) as RawPayload;
  return createApiCorpus(
    {
      language: 'python',
      packageName: payload.package,
      packageVersion: payload.version,
      extractor: `CPython ${payload.python} inspect+ast`,
      extractionDate: new Date().toISOString(),
    },
    payload.entries.map(toDraft),
  );
};

function main(): void {
  const packageName = process.argv[2] ?? 'build123d';
  const outputDirectory = join(import.meta.dirname, '../../generated', packageName);
  mkdirSync(outputDirectory, { recursive: true });
  const corpus = extractPythonApi(packageName);
  const outputPath = join(outputDirectory, `${packageName}.bundled.json`);
  writeFileSync(outputPath, JSON.stringify(corpus));
  console.log(`${packageName} corpus written to ${outputPath}`);
  console.log(`  ${String(corpus.metadata.totalEntries)} entries: ${JSON.stringify(corpus.metadata.breakdown)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
