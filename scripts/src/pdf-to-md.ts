import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { load as yamlLoad } from 'js-yaml';
import { PDFParse } from 'pdf-parse';
import { parsePdfToMdArgs, pdfToMdUsage } from '#pdf-to-md.args.js';
import type { PdfToMdOptions } from '#pdf-to-md.args.js';

// Syncs docs/reference/_index.yaml PDFs into cached PDFs and searchable Markdown.

const repoRoot = resolve(import.meta.dirname, '../..');
const indexPath = resolve(repoRoot, 'docs/reference/_index.yaml');

type Citation = {
  format: string;
  key: string;
  bibtex: string;
};

type ReferenceEntry = {
  title: string;
  authors: string[];
  year: number | string;
  venue: string;
  source_url: string;
  pdf_url: string;
  pdf: string;
  markdown: string;
  used_by?: string[];
  tags?: string[];
  description?: string;
  citation: Citation;
};

type GroupConfig = {
  description?: string;
  references: string[];
};

type ReferenceManifest = {
  version: number;
  pdf_dir: string;
  md_dir: string;
  groups: Record<string, GroupConfig>;
  references: Record<string, ReferenceEntry>;
};

type TextResult = {
  text: string;
  total?: number;
};

type ReferenceState = {
  id: string;
  pdfPath: string;
  markdownPath: string;
  pdfExists: boolean;
  markdownExists: boolean;
  markdownStale: boolean;
  reason: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRelativePath = (path: string): string => relative(repoRoot, path);

const resolveRepoPath = (path: string): string => {
  if (path.startsWith('/')) {
    throw new Error(`paths in docs/reference/_index.yaml must be repo-relative: ${path}`);
  }
  return resolve(repoRoot, path);
};

// oxlint-disable-next-line no-control-regex -- PDF extraction can emit non-whitespace ASCII control characters.
const pdfControlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;

const normalizeText = (text: string): string =>
  text
    .replaceAll(/\r\n?/gu, '\n')
    .replaceAll(pdfControlCharacters, '')
    .replaceAll(/[\t ]+\n/gu, '\n')
    .replaceAll(/\n{3,}/gu, '\n\n')
    .trim();

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

const manifestHash = (id: string, entry: ReferenceEntry): string =>
  createHash('sha256')
    .update(
      stableStringify({
        id,
        title: entry.title,
        authors: entry.authors,
        year: entry.year,
        venue: entry.venue,
        source_url: entry.source_url, // eslint-disable-line @typescript-eslint/naming-convention -- YAML field
        pdf_url: entry.pdf_url, // eslint-disable-line @typescript-eslint/naming-convention -- YAML field
        pdf: entry.pdf,
        markdown: entry.markdown,
        used_by: entry.used_by ?? [], // eslint-disable-line @typescript-eslint/naming-convention -- YAML field
        tags: entry.tags ?? [],
        description: entry.description ?? '',
        citation: entry.citation,
      }),
    )
    .digest('hex')
    .slice(0, 16);

const isUrl = (value: string): boolean => /^https?:\/\/\S+$/u.test(value);

const assertArrayOfStrings = (value: unknown, path: string, errors: string[]): string[] => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item.trim().length > 0)) {
    errors.push(`${path} must be a non-empty string array`);
    return [];
  }
  return value.map(String);
};

const validateManifest = (manifest: unknown): ReferenceManifest => {
  const errors: string[] = [];

  if (!isRecord(manifest)) {
    throw new Error('docs/reference/_index.yaml must contain a YAML object');
  }

  const candidate = manifest as Partial<ReferenceManifest>;
  if (candidate.version !== 1) {
    errors.push('version must be 1');
  }

  if (typeof candidate.pdf_dir !== 'string' || candidate.pdf_dir.length === 0) {
    errors.push('pdf_dir must be a non-empty string');
  }

  if (typeof candidate.md_dir !== 'string' || candidate.md_dir.length === 0) {
    errors.push('md_dir must be a non-empty string');
  }

  if (!isRecord(candidate.groups)) {
    errors.push('groups must be an object');
  }

  if (!isRecord(candidate.references)) {
    errors.push('references must be an object');
  }

  const groups = isRecord(candidate.groups) ? (candidate.groups as Record<string, unknown>) : {};
  const references = isRecord(candidate.references) ? (candidate.references as Record<string, unknown>) : {};
  const pdfPaths = new Map<string, string>();
  const markdownPaths = new Map<string, string>();
  const citationKeys = new Map<string, string>();

  for (const [groupName, group] of Object.entries(groups)) {
    if (!isRecord(group)) {
      errors.push(`groups.${groupName} must be an object`);
      continue;
    }

    const referenceIds = assertArrayOfStrings(group['references'], `groups.${groupName}.references`, errors);
    for (const referenceId of referenceIds) {
      if (!references[referenceId]) {
        errors.push(`groups.${groupName}.references includes unknown reference "${referenceId}"`);
      }
    }
  }

  for (const [id, value] of Object.entries(references)) {
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(id)) {
      errors.push(`references.${id} id must be lowercase letters/numbers/hyphens`);
    }

    if (!isRecord(value)) {
      errors.push(`references.${id} must be an object`);
      continue;
    }

    const entry = value as Partial<ReferenceEntry>;
    const stringFields: Array<keyof ReferenceEntry> = ['title', 'venue', 'source_url', 'pdf_url', 'pdf', 'markdown'];

    for (const field of stringFields) {
      if (typeof entry[field] !== 'string' || String(entry[field]).trim().length === 0) {
        errors.push(`references.${id}.${field} must be a non-empty string`);
      }
    }

    assertArrayOfStrings(entry.authors, `references.${id}.authors`, errors);
    if (entry.used_by !== undefined) {
      assertArrayOfStrings(entry.used_by, `references.${id}.used_by`, errors);
    }
    if (entry.tags !== undefined) {
      assertArrayOfStrings(entry.tags, `references.${id}.tags`, errors);
    }

    if (typeof entry.year !== 'number' && typeof entry.year !== 'string') {
      errors.push(`references.${id}.year must be a year number or string`);
    }

    if (typeof entry.source_url === 'string' && !isUrl(entry.source_url)) {
      errors.push(`references.${id}.source_url must be an http(s) URL`);
    }
    if (typeof entry.pdf_url === 'string' && !isUrl(entry.pdf_url)) {
      errors.push(`references.${id}.pdf_url must be an http(s) URL`);
    }

    if (typeof entry.pdf === 'string') {
      if (!entry.pdf.endsWith('.pdf')) {
        errors.push(`references.${id}.pdf must end with .pdf`);
      }
      if (typeof candidate.pdf_dir === 'string' && !entry.pdf.startsWith(`${candidate.pdf_dir}/`)) {
        errors.push(`references.${id}.pdf must be under ${candidate.pdf_dir}/`);
      }
      const owner = pdfPaths.get(entry.pdf);
      if (owner) {
        errors.push(`references.${id}.pdf duplicates references.${owner}.pdf`);
      }
      pdfPaths.set(entry.pdf, id);
    }

    if (typeof entry.markdown === 'string') {
      if (!entry.markdown.endsWith('.md')) {
        errors.push(`references.${id}.markdown must end with .md`);
      }
      if (typeof candidate.md_dir === 'string' && !entry.markdown.startsWith(`${candidate.md_dir}/`)) {
        errors.push(`references.${id}.markdown must be under ${candidate.md_dir}/`);
      }
      const owner = markdownPaths.get(entry.markdown);
      if (owner) {
        errors.push(`references.${id}.markdown duplicates references.${owner}.markdown`);
      }
      markdownPaths.set(entry.markdown, id);
    }

    if (isRecord(entry.citation)) {
      if (entry.citation.format !== 'bibtex') {
        errors.push(`references.${id}.citation.format must be "bibtex"`);
      }
      if (typeof entry.citation.key !== 'string' || entry.citation.key.trim().length === 0) {
        errors.push(`references.${id}.citation.key must be a non-empty string`);
      } else {
        const owner = citationKeys.get(entry.citation.key);
        if (owner) {
          errors.push(`references.${id}.citation.key duplicates references.${owner}.citation.key`);
        }
        citationKeys.set(entry.citation.key, id);
      }
      if (typeof entry.citation.bibtex !== 'string' || !entry.citation.bibtex.includes('@')) {
        errors.push(`references.${id}.citation.bibtex must contain a BibTeX entry`);
      } else if (typeof entry.citation.key === 'string' && !entry.citation.bibtex.includes(`{${entry.citation.key},`)) {
        errors.push(`references.${id}.citation.bibtex must contain citation key "${entry.citation.key}"`);
      }
    } else {
      errors.push(`references.${id}.citation must be an object`);
    }

    for (const usedBy of entry.used_by ?? []) {
      if (!existsSync(resolveRepoPath(usedBy))) {
        errors.push(`references.${id}.used_by path does not exist: ${usedBy}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`reference index validation failed:\n${errors.map((error) => `  - ${error}`).join('\n')}`);
  }

  return candidate as ReferenceManifest;
};

const readManifest = (): ReferenceManifest => {
  if (!existsSync(indexPath)) {
    throw new Error('docs/reference/_index.yaml does not exist');
  }

  try {
    return validateManifest(yamlLoad(readFileSync(indexPath, 'utf8')));
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(String(error));
  }
};

const selectReferences = (
  manifest: ReferenceManifest,
  options: Pick<PdfToMdOptions, 'ids' | 'group'>,
): Array<[string, ReferenceEntry]> => {
  if (options.group) {
    const group = manifest.groups[options.group];
    if (!group) {
      throw new Error(`unknown reference group "${options.group}"`);
    }

    return group.references.map((id) => [id, manifest.references[id]] as [string, ReferenceEntry]);
  }

  if (options.ids.length > 0) {
    return options.ids.map((id) => {
      const entry = manifest.references[id];
      if (!entry) {
        throw new Error(`unknown reference "${id}"`);
      }
      return [id, entry] as [string, ReferenceEntry];
    });
  }

  return Object.entries(manifest.references);
};

const isPdfFile = (path: string): boolean => {
  if (!existsSync(path)) {
    return false;
  }

  const header = readFileSync(path).subarray(0, 5).toString('latin1');
  return header === '%PDF-';
};

const extractManifestHash = (markdown: string): string | undefined => {
  const match = /^> Manifest hash: `(?<hash>[a-f0-9]+)`$/mu.exec(markdown);
  return match?.groups?.['hash'];
};

const extractPdfSha256 = (markdown: string): string | undefined => {
  const match = /^> PDF SHA-256: `(?<hash>[a-f0-9]{64})`$/mu.exec(markdown);
  return match?.groups?.['hash'];
};

/** SHA-256 of a file's bytes, matching `shasum -a 256` and the Git LFS oid. */
export const sha256File = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

/**
 * Why a generated Markdown is out of date, or undefined when it is fresh. Compares recorded content
 * hashes rather than mtimes: `git lfs checkout` and re-downloads rewrite mtimes on identical bytes.
 */
export const staleReason = (options: {
  markdown: string;
  manifestHash: string;
  pdfSha256: string | undefined;
}): string | undefined => {
  if (extractManifestHash(options.markdown) !== options.manifestHash) {
    return 'manifest changed';
  }

  if (options.pdfSha256 !== undefined && extractPdfSha256(options.markdown) !== options.pdfSha256) {
    return 'pdf changed';
  }

  return undefined;
};

const getState = (id: string, entry: ReferenceEntry): ReferenceState => {
  const pdfPath = resolveRepoPath(entry.pdf);
  const markdownPath = resolveRepoPath(entry.markdown);
  const pdfExists = existsSync(pdfPath);
  const markdownExists = existsSync(markdownPath);

  if (!markdownExists) {
    return { id, pdfPath, markdownPath, pdfExists, markdownExists, markdownStale: true, reason: 'markdown missing' };
  }

  const reason = staleReason({
    markdown: readFileSync(markdownPath, 'utf8'),
    manifestHash: manifestHash(id, entry),
    pdfSha256: pdfExists ? sha256File(pdfPath) : undefined,
  });

  return {
    id,
    pdfPath,
    markdownPath,
    pdfExists,
    markdownExists,
    markdownStale: reason !== undefined,
    reason: reason ?? 'fresh',
  };
};

export const buildMarkdown = (options: {
  id: string;
  entry: ReferenceEntry;
  pageCount: number | undefined;
  pdfSha256: string;
  text: string;
}): string => {
  const { id, entry } = options;
  const pages = options.pageCount === undefined ? 'unknown' : String(options.pageCount);

  return [
    `# ${entry.title}`,
    '',
    '> Converted from PDF text extraction. Figures, equations, and tables may be incomplete or approximate.',
    `> Reference ID: \`${id}\``,
    `> Source URL: ${entry.source_url}`,
    `> PDF URL: ${entry.pdf_url}`,
    `> Cached PDF: \`${entry.pdf}\``,
    `> PDF SHA-256: \`${options.pdfSha256}\``,
    `> Citation: \`${entry.citation.key}\` (${entry.citation.format})`,
    `> Manifest hash: \`${manifestHash(id, entry)}\``,
    `> Pages: ${pages}`,
    '',
    '---',
    '',
    options.text,
    '',
  ].join('\n');
};

const extractText = async (input: string): Promise<TextResult> => {
  const data = readFileSync(input);
  const parser = new PDFParse({ data });

  try {
    const result = (await parser.getText()) as TextResult;
    return result;
  } finally {
    await parser.destroy();
  }
};

const downloadReference = async (id: string, entry: ReferenceEntry, force: boolean): Promise<void> => {
  const pdfPath = resolveRepoPath(entry.pdf);
  if (existsSync(pdfPath) && !force) {
    console.log(`${id}: cached PDF exists (${asRelativePath(pdfPath)})`);
    return;
  }

  mkdirSync(dirname(pdfPath), { recursive: true });
  const temporaryPath = `${pdfPath}.tmp-${process.pid}`;
  if (existsSync(temporaryPath)) {
    unlinkSync(temporaryPath);
  }

  const response = await fetch(entry.pdf_url);
  if (!response.ok) {
    throw new Error(`${id}: failed to download ${entry.pdf_url} (${response.status} ${response.statusText})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error(`${id}: downloaded content is not a PDF: ${entry.pdf_url}`);
  }

  writeFileSync(temporaryPath, buffer);
  renameSync(temporaryPath, pdfPath);
  console.log(`${id}: downloaded ${asRelativePath(pdfPath)}`);
};

const convertReference = async (id: string, entry: ReferenceEntry, force: boolean): Promise<void> => {
  const state = getState(id, entry);
  if (!state.pdfExists) {
    throw new Error(`${id}: cached PDF missing; run "pnpm nx run scripts:pdf-to-md -- download ${id}"`);
  }

  if (!force && !state.markdownStale) {
    console.log(`${id}: markdown fresh (${asRelativePath(state.markdownPath)})`);
    return;
  }

  if (!isPdfFile(state.pdfPath)) {
    throw new Error(`${id}: cached file is not a valid PDF: ${asRelativePath(state.pdfPath)}`);
  }

  const result = await extractText(state.pdfPath);
  const text = normalizeText(result.text);
  if (!text) {
    throw new Error(`${id}: no extractable text found; the PDF may be scanned or image-only and may require OCR`);
  }

  mkdirSync(dirname(state.markdownPath), { recursive: true });
  writeFileSync(
    state.markdownPath,
    buildMarkdown({
      id,
      entry,
      pageCount: result.total,
      pdfSha256: sha256File(state.pdfPath),
      text,
    }),
  );
  console.log(`${id}: converted ${asRelativePath(state.markdownPath)}`);
};

const statusReference = (id: string, entry: ReferenceEntry): void => {
  const state = getState(id, entry);
  const pdf = state.pdfExists ? 'pdf:cached' : 'pdf:missing';
  const markdown = state.markdownExists
    ? state.markdownStale
      ? `md:stale(${state.reason})`
      : 'md:fresh'
    : 'md:missing';
  console.log(`${id}: ${pdf} ${markdown}`);
};

const validateGeneratedOutputs = (references: Array<[string, ReferenceEntry]>): void => {
  const errors: string[] = [];

  for (const [id, entry] of references) {
    const state = getState(id, entry);
    if (state.pdfExists && !isPdfFile(state.pdfPath)) {
      errors.push(`${id}: cached file is not a valid PDF: ${asRelativePath(state.pdfPath)}`);
    }

    if (!state.markdownExists) {
      errors.push(`${id}: markdown missing: ${asRelativePath(state.markdownPath)}`);
      continue;
    }

    const markdown = readFileSync(state.markdownPath, 'utf8');
    if (markdown.includes('\u0000')) {
      errors.push(`${id}: markdown contains NUL bytes: ${asRelativePath(state.markdownPath)}`);
    }

    if (state.markdownStale) {
      errors.push(`${id}: markdown stale (${state.reason}): ${asRelativePath(state.markdownPath)}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`reference output validation failed:\n${errors.map((error) => `  - ${error}`).join('\n')}`);
  }

  console.log(`Validated ${references.length} reference${references.length === 1 ? '' : 's'}.`);
};

/**
 * Run every reference to completion, then fail with the collected errors. Aborting on the first
 * failure would silently skip every reference after it.
 */
export const runBatch = async <T>(items: readonly T[], run: (item: T) => Promise<void>): Promise<void> => {
  const errors: string[] = [];

  for (const item of items) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Reference I/O stays sequential for deterministic logs and bounded load.
      await run(item);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `${errors.length} of ${items.length} references failed:\n${errors.map((error) => `  - ${error}`).join('\n')}`,
    );
  }
};

const main = async (): Promise<void> => {
  const parsedArgs = parsePdfToMdArgs(process.argv.slice(2));
  if (parsedArgs.kind === 'help') {
    console.log(pdfToMdUsage);
    return;
  }

  const { options } = parsedArgs;
  const manifest = readManifest();
  const references = selectReferences(manifest, options);

  if (references.length === 0) {
    console.log('No references selected.');
    return;
  }

  switch (options.command) {
    case 'status': {
      for (const [id, entry] of references) {
        statusReference(id, entry);
      }
      break;
    }

    case 'download': {
      await runBatch(references, async ([id, entry]) => downloadReference(id, entry, options.force));
      break;
    }

    case 'convert': {
      await runBatch(references, async ([id, entry]) => convertReference(id, entry, options.force));
      break;
    }

    case 'sync': {
      await runBatch(references, async ([id, entry]) => {
        if (!getState(id, entry).pdfExists || options.force) {
          await downloadReference(id, entry, options.force);
        }
        await convertReference(id, entry, options.force);
      });
      break;
    }

    case 'validate': {
      validateGeneratedOutputs(references);
      break;
    }
  }
};

const isDirectRun = (): boolean =>
  process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;

if (isDirectRun()) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`pdf-to-md failed: ${message}`);
    process.exit(1);
  }
}
