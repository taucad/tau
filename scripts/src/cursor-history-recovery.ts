/* eslint-disable @typescript-eslint/naming-convention -- Serialized recovery ledgers use stable snake_case fields. */
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

// Recovers Cursor-era metadata through read-only, hash-addressed source locators.
// Raw transcript bodies are intentionally never emitted by this script.

const repoRoot = resolve(import.meta.dirname, '../..');
const sha256Pattern = /^[a-f0-9]{64}$/u;
const locatorSchemePattern = /^[a-z][a-z0-9-]*$/u;
const forbiddenLedgerKeys = new Set(['body', 'content', 'messages', 'prompt', 'raw', 'response', 'transcript']);
const expectedHistoryFiles = [
  'manifest.json',
  'headers.jsonl',
  'themes.jsonl',
  'losses.jsonl',
  'legacy-authored-plans.json',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeJson = (value: unknown): unknown => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : normalizeJson(item)));
  }

  if (!isRecord(value)) {
    throw new Error(`value is not JSON-serializable: ${typeof value}`);
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, normalizeJson(value[key])]),
  );
};

export const canonicalJson = (value: unknown): string => `${JSON.stringify(normalizeJson(value), null, 2)}\n`;

export const canonicalJsonl = (rows: readonly unknown[]): string =>
  rows.length === 0 ? '' : `${rows.map((row) => JSON.stringify(normalizeJson(row))).join('\n')}\n`;

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export const sha256File = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

const insideRoot = (root: string, path: string): boolean => {
  const fromRoot = relative(root, path);
  return fromRoot === '' || (!fromRoot.startsWith(`..${sep}`) && fromRoot !== '..' && !isAbsolute(fromRoot));
};

export const symbolicLocator = (options: { scheme: string; root: string; path: string }): string => {
  if (!locatorSchemePattern.test(options.scheme)) {
    throw new Error(`invalid locator scheme: ${options.scheme}`);
  }

  const root = resolve(options.root);
  const path = resolve(options.path);
  if (!insideRoot(root, path)) {
    throw new Error(`source path is outside the ${options.scheme} root`);
  }

  const sourcePath = relative(root, path).split(sep).join('/');
  return `${options.scheme}://${sourcePath || '.'}`;
};

export const resolveSymbolicLocator = (locator: string, roots: Readonly<Record<string, string>>): string => {
  const separator = locator.indexOf('://');
  if (separator <= 0) {
    throw new Error(`invalid symbolic locator: ${locator}`);
  }

  const scheme = locator.slice(0, separator);
  const sourcePath = locator.slice(separator + 3);
  const root = roots[scheme];
  if (!locatorSchemePattern.test(scheme) || !root || !sourcePath || sourcePath.startsWith('/')) {
    throw new Error(`unresolvable symbolic locator: ${locator}`);
  }

  const resolvedRoot = resolve(root);
  const path = resolve(resolvedRoot, sourcePath);
  if (!insideRoot(resolvedRoot, path)) {
    throw new Error(`symbolic locator escapes its source root: ${locator}`);
  }

  return path;
};

export type LocalHistoryRevision = {
  id: string;
  timestamp: number;
  content: string;
};

export type ContentChangeRange = {
  first: LocalHistoryRevision;
  last: LocalHistoryRevision;
  changes: number;
};

export const selectContentChangeRange = (
  revisions: readonly LocalHistoryRevision[],
): ContentChangeRange | undefined => {
  const ordered = [...revisions].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  let previousHash: string | undefined;
  let first: LocalHistoryRevision | undefined;
  let last: LocalHistoryRevision | undefined;
  let changes = 0;

  for (const revision of ordered) {
    const contentHash = sha256(revision.content);
    if (contentHash === previousHash) {
      continue;
    }

    previousHash = contentHash;
    first ??= revision;
    last = revision;
    changes++;
  }

  return first && last ? { first, last, changes } : undefined;
};

export const selectLastContentChange = (revisions: readonly LocalHistoryRevision[]): LocalHistoryRevision | undefined =>
  selectContentChangeRange(revisions)?.last;

export type BackupPayload =
  | {
      kind: 'content-wrapper';
      backup_uri?: string;
      wrapper_sha256: string;
      content_sha256: string;
      content: string;
    }
  | {
      kind: 'raw-trace';
      backup_uri?: string;
      source_sha256: string;
      content: string;
    };

const splitBackupSource = (source: string): { backup_uri?: string; payload: string } => {
  const separator = source.search(/\s/u);
  if (separator <= 0) {
    return { payload: source };
  }

  const prefix = source.slice(0, separator);
  if (!/^(?:[a-z][a-z0-9+.-]*:\/\/|untitled:)[^\s]+$/iu.test(prefix)) {
    return { payload: source };
  }

  return { backup_uri: prefix, payload: source.slice(separator).trimStart() };
};

export const dispatchBackupPayload = (source: string): BackupPayload => {
  const { backup_uri, payload } = splitBackupSource(source.replace(/^\uFEFF/u, ''));

  try {
    const parsed: unknown = JSON.parse(payload);
    if (isRecord(parsed) && typeof parsed['content'] === 'string') {
      return {
        kind: 'content-wrapper',
        ...(backup_uri ? { backup_uri } : {}),
        wrapper_sha256: sha256(source),
        content_sha256: sha256(parsed['content']),
        content: parsed['content'],
      };
    }
  } catch {
    // A non-JSON Backup is an unsaved raw trace, not a malformed wrapper.
  }

  return {
    kind: 'raw-trace',
    ...(backup_uri ? { backup_uri } : {}),
    source_sha256: sha256(source),
    content: payload,
  };
};

export type ConversationSearchUnit = {
  unit: string;
  id: string;
};

type LogicalSnapshotGroup = {
  name: string;
  rows: number;
  sha256: string;
  bytes: number;
};

const hashSqlRows = (
  database: DatabaseSync,
  options: { name: string; sql: string; parameters?: ReadonlyArray<number | string> },
): LogicalSnapshotGroup => {
  const hash = createHash('sha256');
  let rows = 0;
  let bytes = 0;
  for (const row of database.prepare(options.sql).iterate(...(options.parameters ?? []))) {
    const normalized = canonicalJson(row);
    hash.update(normalized);
    rows++;
    bytes += Buffer.byteLength(normalized);
  }
  return { name: options.name, rows, sha256: hash.digest('hex'), bytes };
};

const databaseDataVersion = (database: DatabaseSync): number => {
  const row = database.prepare('PRAGMA data_version').get();
  if (!isRecord(row) || typeof row['data_version'] !== 'number') {
    throw new Error('SQLite did not return PRAGMA data_version');
  }
  return row['data_version'];
};

const logicalDatabaseSnapshot = (options: {
  databasePath: string;
  groups: ReadonlyArray<{ name: string; sql: string; parameters?: ReadonlyArray<number | string> }>;
}): { file_size: number; file_mtime_ms: number; data_version: number; groups: LogicalSnapshotGroup[] } => {
  const databasePath = resolve(options.databasePath);
  const stats = statSync(databasePath);
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    database.exec('BEGIN');
    const before = databaseDataVersion(database);
    const groups = options.groups.map((group) => hashSqlRows(database, group));
    const after = databaseDataVersion(database);
    database.exec('ROLLBACK');
    if (before !== after) {
      throw new Error(`SQLite data version changed during logical snapshot: ${databasePath}`);
    }
    return { file_size: stats.size, file_mtime_ms: stats.mtimeMs, data_version: before, groups };
  } finally {
    database.close();
  }
};

export const createCursorLogicalBaseline = (options: {
  stateDatabasePath: string;
  conversationDatabasePath: string;
  extractedAt: string;
}): unknown => {
  const state = logicalDatabaseSnapshot({
    databasePath: options.stateDatabasePath,
    groups: [
      {
        name: 'composer-headers-and-plan-registry',
        sql: "SELECT key, value FROM ItemTable WHERE key IN ('composer.composerHeaders', 'composer.planRegistry') ORDER BY key",
      },
      {
        name: 'composer-data-kv',
        sql: "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%' ORDER BY key",
      },
      {
        name: 'composer-bubble-kv',
        sql: "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%' ORDER BY key",
      },
    ],
  });
  const conversationSearch = logicalDatabaseSnapshot({
    databasePath: options.conversationDatabasePath,
    groups: [
      {
        name: 'conversation-search-records',
        sql: `
          SELECT c.source, c.scope, c.id, c.updated_at, f.body
          FROM conversations AS c
          JOIN conversation_fts AS f ON f.rowid = c.fts_rowid
          ORDER BY c.source, c.scope, c.id
        `,
      },
    ],
  });
  return {
    schema_version: 1,
    extracted_at: options.extractedAt,
    strategy: 'sqlite-read-transaction-logical-row-digests',
    cursor_closed: false,
    snapshot_consistent: true,
    source_locators: {
      state: 'cursor-app-support://User/globalStorage/state.vscdb',
      conversation_search: 'cursor-app-support://User/globalStorage/conversation-search.db',
    },
    state,
    conversation_search: conversationSearch,
  };
};

export type ConversationSearchRecord = {
  unit: string;
  id: string;
  source: 'local' | 'cloud-cache';
  scope: string;
  title: string;
  updated_at: number;
  source_sha256: string;
  sanitized_text: string;
  redactions: Partial<Record<SensitiveCategory, number>>;
};

export const readConversationSearchRecords = (options: {
  databasePath: string;
  units: readonly ConversationSearchUnit[];
}): ConversationSearchRecord[] => {
  const database = new DatabaseSync(resolve(options.databasePath), { readOnly: true });
  try {
    const statement = database.prepare(`
      SELECT c.source, c.scope, c.id, c.title, c.updated_at, f.body
      FROM conversations AS c
      JOIN conversation_fts AS f ON f.rowid = c.fts_rowid
      WHERE c.id = ?
      ORDER BY c.source, c.scope
    `);
    return [...options.units]
      .sort((a, b) => a.unit.localeCompare(b.unit))
      .map((unit): ConversationSearchRecord => {
        const rows = statement.all(unit.id);
        if (rows.length !== 1) {
          throw new Error(`expected exactly one conversation-search row for ${unit.unit}; found ${rows.length}`);
        }
        const row = rows[0];
        if (
          !isRecord(row) ||
          (row['source'] !== 'local' && row['source'] !== 'cloud-cache') ||
          typeof row['scope'] !== 'string' ||
          typeof row['id'] !== 'string' ||
          typeof row['title'] !== 'string' ||
          typeof row['updated_at'] !== 'number' ||
          typeof row['body'] !== 'string'
        ) {
          throw new Error(`invalid conversation-search row for ${unit.unit}`);
        }
        const sourceEnvelope = canonicalJson({
          source: row['source'],
          scope: row['scope'],
          id: row['id'],
          title: row['title'],
          updated_at: row['updated_at'],
          body: row['body'],
        });
        const sanitized = redactSensitiveText(row['body']);
        return {
          unit: unit.unit,
          id: row['id'],
          source: row['source'],
          scope: row['scope'],
          title: row['title'],
          updated_at: row['updated_at'],
          source_sha256: sha256(sourceEnvelope),
          sanitized_text: sanitized.text,
          redactions: sanitized.counts,
        };
      });
  } finally {
    database.close();
  }
};

export const writeConversationSearchClassificationUnits = (options: {
  databasePath: string;
  units: readonly ConversationSearchUnit[];
  outputDirectory: string;
}): ConversationSearchRecord[] => {
  const records = readConversationSearchRecords(options);
  for (const record of records) {
    const sourcePath = resolve(options.outputDirectory, `${record.unit}.md`);
    const metadataPath = resolve(options.outputDirectory, `${record.unit}.json`);
    atomicWriteUnchecked(
      sourcePath,
      record.sanitized_text.endsWith('\n') ? record.sanitized_text : `${record.sanitized_text}\n`,
    );
    atomicWriteClean(
      metadataPath,
      canonicalJson({
        schema_version: 1,
        unit_id: record.unit,
        record_id: record.id,
        source_kind: `conversation-search-${record.source}`,
        title: record.title,
        updated_at: record.updated_at,
        source_sha256: record.source_sha256,
        redactions: record.redactions,
      }),
    );
  }
  return records;
};

const jsonlMessageText = (record: unknown): { role: string; text: string } | undefined => {
  if (!isRecord(record) || (record['role'] !== 'user' && record['role'] !== 'assistant')) {
    return undefined;
  }
  const { message } = record;
  if (!isRecord(message) || !Array.isArray(message['content'])) {
    return undefined;
  }
  const text = message['content']
    .flatMap((part): string[] =>
      isRecord(part) && part['type'] === 'text' && typeof part['text'] === 'string' ? [part['text']] : [],
    )
    .join('\n');
  return text ? { role: record['role'], text } : undefined;
};

export const writeJsonlClassificationUnits = (options: {
  units: ReadonlyArray<{ unit: string; path: string }>;
  outputDirectory: string;
}): unknown[] =>
  [...options.units]
    .sort((a, b) => a.unit.localeCompare(b.unit))
    .map(({ unit, path }) => {
      const raw = readFileSync(resolve(path), 'utf8');
      const messages = raw
        .split(/\r?\n/u)
        .filter(Boolean)
        .flatMap((line): Array<{ role: string; text: string }> => {
          try {
            const message = jsonlMessageText(JSON.parse(line));
            return message ? [message] : [];
          } catch {
            return [];
          }
        });
      const sourceText = messages.map((message) => `${message.role}:\n${message.text}`).join('\n\n');
      const sanitized = redactSensitiveText(sourceText);
      atomicWriteUnchecked(
        resolve(options.outputDirectory, `${unit}.md`),
        sanitized.text.endsWith('\n') ? sanitized.text : `${sanitized.text}\n`,
      );
      const metadata = {
        schema_version: 1,
        unit_id: unit,
        record_id: basename(path, '.jsonl'),
        source_kind: 'cursor-jsonl-external-workspace',
        source_sha256: sha256(raw),
        message_count: messages.length,
        redactions: sanitized.counts,
      };
      atomicWriteClean(resolve(options.outputDirectory, `${unit}.json`), canonicalJson(metadata));
      return metadata;
    });

export type LegacyAuthoredPlan = {
  composer_id: string;
  chat_name: string;
  title: string;
  overview: string;
  created: string;
  updated: string;
  source_header_sha256: string;
  summary_only: true;
  redactions: Partial<Record<SensitiveCategory, number>>;
};

export const readLegacyAuthoredPlans = (databasePath: string): LegacyAuthoredPlan[] => {
  const database = new DatabaseSync(resolve(databasePath), { readOnly: true });
  try {
    const row = database.prepare("SELECT value FROM ItemTable WHERE key = 'composer.composerHeaders'").get();
    if (!isRecord(row) || typeof row['value'] !== 'string') {
      throw new Error('composer.composerHeaders is missing');
    }
    const parsed: unknown = JSON.parse(row['value']);
    if (!isRecord(parsed) || !Array.isArray(parsed['allComposers'])) {
      throw new Error('composer.composerHeaders has an invalid shape');
    }
    return parsed['allComposers']
      .flatMap((header): LegacyAuthoredPlan[] => {
        if (
          !isRecord(header) ||
          !isRecord(header['authoredPlan']) ||
          typeof header['composerId'] !== 'string' ||
          typeof header['name'] !== 'string' ||
          typeof header['createdAt'] !== 'number' ||
          typeof header['lastUpdatedAt'] !== 'number' ||
          typeof header['authoredPlan']['title'] !== 'string' ||
          typeof header['authoredPlan']['overview'] !== 'string'
        ) {
          return [];
        }
        const title = redactSensitiveText(header['authoredPlan']['title']);
        const overview = redactSensitiveText(header['authoredPlan']['overview']);
        const chatName = redactSensitiveText(header['name']);
        const redactions: Partial<Record<SensitiveCategory, number>> = {};
        for (const [category, count] of [
          ...Object.entries(title.counts),
          ...Object.entries(overview.counts),
          ...Object.entries(chatName.counts),
        ]) {
          const key = category as SensitiveCategory;
          redactions[key] = (redactions[key] ?? 0) + count;
        }
        return [
          {
            composer_id: header['composerId'],
            chat_name: chatName.text,
            title: title.text,
            overview: overview.text,
            created: aucklandDate(header['createdAt']),
            updated: aucklandDate(header['lastUpdatedAt']),
            source_header_sha256: sha256(canonicalJson(header)),
            summary_only: true,
            redactions,
          },
        ];
      })
      .sort((a, b) => a.created.localeCompare(b.created) || a.composer_id.localeCompare(b.composer_id));
  } finally {
    database.close();
  }
};

const readJsonFile = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

const stringArray = (value: unknown): string[] =>
  (Array.isArray(value) ? value : typeof value === 'string' ? [value] : [])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/^\/Users\/[^/]+\/git\/tau\//u, ''))
    .sort();

const dateOnly = (value: unknown): string | undefined =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(value) ? value.slice(0, 10) : undefined;

const normalizeThemeResult = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new TypeError('theme result must be an object');
  }
  const unit = typeof value['unit_id'] === 'string' ? value['unit_id'] : value['unit'];
  const sourceHash =
    typeof value['source_hash_sha256'] === 'string' ? value['source_hash_sha256'] : value['source_hash'];
  if (typeof unit !== 'string' || typeof sourceHash !== 'string' || !sha256Pattern.test(sourceHash)) {
    throw new Error('theme result must identify its unit and source SHA-256');
  }
  const dateEvidence = isRecord(value['date_evidence']) ? value['date_evidence'] : {};
  const created = dateOnly(value['historical_created']) ?? dateOnly(dateEvidence['created_at']);
  const updated = dateOnly(value['historical_updated']) ?? dateOnly(dateEvidence['updated_at']) ?? created;
  const canonicalTargets = [
    ...stringArray(value['canonical_targets']),
    ...stringArray(value['canonical_target']),
  ].filter((target, index, all) => all.indexOf(target) === index);
  const conflictKeys = [...stringArray(value['conflict_keys']), ...stringArray(value['conflict_key'])].filter(
    (key, index, all) => all.indexOf(key) === index,
  );
  const disposition = typeof value['disposition'] === 'string' ? value['disposition'] : 'historical';
  const themeSummary = typeof value['theme_summary'] === 'string' ? value['theme_summary'].slice(0, 1600) : '';
  const security = isRecord(value['security_review'])
    ? value['security_review']
    : isRecord(value['secret_review'])
      ? value['secret_review']
      : {};
  return {
    theme_id: `THEME-${unit}`,
    source_population: unit.startsWith('CHAT-P')
      ? 'recovered-primary-body'
      : unit.startsWith('CHAT-F')
        ? 'orphan-fts-body'
        : 'external-workspace-jsonl',
    source_unit_ids: [unit],
    source_hashes: [sourceHash],
    source_kind:
      typeof value['source_kind'] === 'string'
        ? value['source_kind']
        : unit.startsWith('CHAT-F')
          ? 'orphan-fts'
          : 'recovered-classification-source',
    ...(created ? { historical_created: created } : {}),
    ...(updated ? { historical_updated: updated } : {}),
    disposition,
    canonical_targets: canonicalTargets,
    conflict_keys: conflictKeys,
    theme_summary: themeSummary,
    evidence:
      stringArray(value['evidence']).length > 0
        ? stringArray(value['evidence']).slice(0, 20)
        : stringArray(value['disposition_evidence']).slice(0, 20),
    security_review: security,
    transcript_text_retained: false,
    unresolved: false,
  };
};

const mainTranscriptIds = (root: string): string[] =>
  readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(resolve(root, entry.name, `${entry.name}.jsonl`)))
    .map((entry) => entry.name)
    .sort();

const exportedSubagentIds = (root: string): string[] =>
  readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      listFiles(resolve(root, entry.name, 'subagents'))
        .filter((path) => path.endsWith('.jsonl'))
        .map((path) => basename(path, '.jsonl')),
    )
    .sort();

const populationHash = (ids: readonly string[]): string => sha256(canonicalJson([...ids].sort()));
const tauCursorWorkspaceId = '8e3cf026a5e0c67d1c41ffc43b0e275f';

export const assembleThemeLedger = (options: {
  resultsDirectory: string;
  stagingDirectory: string;
  stateDatabasePath: string;
  tauTranscriptsRoot: string;
  assimpTranscriptsRoot: string;
  seedIndexPath: string;
  downloadsRoot: string;
}): Array<Record<string, unknown>> => {
  const results = listFiles(options.resultsDirectory)
    .filter((path) => /\/(?:CHAT-P\d{2}|CHAT-F\d{2}|ASSIMP-\d{2})\.json$/u.test(path))
    .map((path) => normalizeThemeResult(readJsonFile(path)));
  const resultUnits = new Set(results.flatMap((row) => row['source_unit_ids'] as string[]));
  const expectedResults = [
    ...Array.from({ length: 18 }, (_, index) => `CHAT-P${String(index + 1).padStart(2, '0')}`),
    ...Array.from({ length: 6 }, (_, index) => `CHAT-F${String(index + 1).padStart(2, '0')}`),
    ...Array.from({ length: 7 }, (_, index) => `ASSIMP-${String(index + 1).padStart(2, '0')}`),
  ];
  const missingResults = expectedResults.filter((unit) => !resultUnits.has(unit));
  if (missingResults.length > 0) {
    throw new Error(`missing theme results: ${missingResults.join(', ')}`);
  }

  const mainIds = mainTranscriptIds(options.tauTranscriptsRoot);
  const assimpMainIds = mainTranscriptIds(options.assimpTranscriptsRoot);
  const stagedAssimpIds = Array.from({ length: 7 }, (_, index) => {
    const unit = `ASSIMP-${String(index + 1).padStart(2, '0')}`;
    const metadata = readJsonFile(resolve(options.stagingDirectory, `${unit}.json`));
    if (!isRecord(metadata) || typeof metadata['record_id'] !== 'string') {
      throw new Error(`invalid external-workspace metadata: ${unit}`);
    }
    return metadata['record_id'];
  }).sort();
  if (canonicalJson(assimpMainIds) !== canonicalJson(stagedAssimpIds)) {
    throw new Error('the seven assimpjs main JSONLs do not match their classification units');
  }
  const seedText = readFileSync(options.seedIndexPath, 'utf8');
  const seedIds = [...seedText.matchAll(/^\|\s*\d+\s*\|\s*\d{4}-\d{2}-\d{2}\s*\|\s*`([0-9a-f-]{36})`/gmu)]
    .flatMap((match): string[] => (match[1] ? [match[1]] : []))
    .filter((id, index, all) => all.indexOf(id) === index)
    .sort();
  const seedSet = new Set(seedIds);
  const remainingMainIds = mainIds.filter((id) => !seedSet.has(id));

  const exportedSubagents = exportedSubagentIds(options.tauTranscriptsRoot);
  const database = new DatabaseSync(options.stateDatabasePath, { readOnly: true });
  let headers: Array<Record<string, unknown>>;
  const recoverableExplicit: Array<Record<string, unknown>> = [];
  const unrecoverableExplicit: Array<Record<string, unknown>> = [];
  try {
    headers = database
      .prepare(
        'SELECT composerId, value FROM composerHeaders WHERE workspaceId = ? AND isSubagent = 1 ORDER BY composerId',
      )
      .all(tauCursorWorkspaceId)
      .map((row): Record<string, unknown> => {
        if (!isRecord(row) || typeof row['composerId'] !== 'string') {
          throw new Error('subagent composer header is invalid');
        }
        if (typeof row['value'] !== 'string') {
          return { composerId: row['composerId'] };
        }
        const value: unknown = JSON.parse(row['value']);
        return isRecord(value) ? { ...value, composerId: row['composerId'] } : { composerId: row['composerId'] };
      });
    const exportedSet = new Set(exportedSubagents);
    const valueStatement = database.prepare('SELECT value FROM cursorDiskKV WHERE key = ?');
    const missingExplicit = headers.filter(
      (header) => typeof header['composerId'] === 'string' && !exportedSet.has(header['composerId']),
    );
    for (const header of missingExplicit) {
      const body = valueStatement.get(`composerData:${String(header['composerId'])}`);
      if (isRecord(body) && typeof body['value'] === 'string') {
        recoverableExplicit.push(header);
      } else {
        unrecoverableExplicit.push(header);
      }
    }
  } finally {
    database.close();
  }
  const headerSubagentIds = new Set(
    headers.flatMap((header): string[] => (typeof header['composerId'] === 'string' ? [header['composerId']] : [])),
  );
  const headerlessSubagents = exportedSubagents.filter((id) => !headerSubagentIds.has(id));
  const matchedExportedSubagents = exportedSubagents.filter((id) => headerSubagentIds.has(id));
  const residualRecoverableIds = [
    'task-toolu_vrtx_012N2sHb5rWUi7jADJwgrebY',
    'task-08b84f0e-5732-4e3d-9f51-5fa4ed62a3be',
    'task-0466950d-3ea2-4691-a610-459e4ca23dfe',
    'task-90f94c7a-3d51-44b8-8d83-62f49de0abe4',
  ];
  const continualLearningId = '1dc10f4a-d0f7-48c1-b964-3bec1d5b044a';
  const inheritedRecoverableIds = recoverableExplicit
    .flatMap((header): string[] =>
      typeof header['composerId'] === 'string' &&
      header['composerId'] !== continualLearningId &&
      !residualRecoverableIds.includes(header['composerId'])
        ? [header['composerId']]
        : [],
    )
    .sort();
  const lostSubagentIds = unrecoverableExplicit
    .flatMap((header): string[] => (typeof header['composerId'] === 'string' ? [header['composerId']] : []))
    .sort();

  const cloudRows = [
    {
      unit: 'CLOUD-01',
      disposition: 'routine',
      canonical: ['docs/research/cursor-plans/observability_gaps_remediation_v2_5b49c0a1.plan.md'],
      summary:
        'Historical pull-request review feedback; durable architecture and completed implementation live in the linked plan and current source.',
    },
    {
      unit: 'CLOUD-02',
      disposition: 'routine',
      canonical: [
        'docs/research/runtime-transport-architecture-v6.md',
        'packages/runtime/src/worker/create-runtime-worker.ts',
      ],
      summary:
        'Historical kernel-worker review; the worker construction and bundling outcome is superseded and preserved by the current runtime transport authority and source.',
    },
    {
      unit: 'CLOUD-03',
      disposition: 'covered-by-research',
      canonical: ['docs/research/buerli-classcad-kernel-integration.md'],
      summary:
        'Small Buerli WASM-only kernel request; the recovered Buerli/ClassCAD reference preserves the complete durable theme.',
    },
  ].map((item) => {
    const metadata = readJsonFile(resolve(options.stagingDirectory, `${item.unit}.json`));
    if (!isRecord(metadata) || typeof metadata['source_sha256'] !== 'string') {
      throw new Error(`invalid cloud metadata: ${item.unit}`);
    }
    return {
      theme_id: `THEME-${item.unit}`,
      source_population: 'cloud-cache-residue',
      source_unit_ids: [item.unit],
      source_hashes: [metadata['source_sha256']],
      source_kind: 'conversation-search-cloud-cache',
      disposition: item.disposition,
      canonical_targets: item.canonical,
      conflict_keys: [],
      theme_summary: item.summary,
      security_review: { status: 'sanitized-classification-source' },
      transcript_text_retained: false,
      unresolved: false,
    };
  });

  const downloadFiles = readdirSync(options.downloadsRoot)
    .filter((name) => name.startsWith('cursor_') && name.endsWith('.md'))
    .sort();
  const restorationDownloads = new Set([
    'cursor_implementing_structured_options.md',
    'cursor_chat_tool_diff_viewer_navigation.md',
    'cursor_chat_message_copy_serialization.md',
    'cursor_file_backend_switching_capabilit.md',
  ]);
  const assimpDownloads = new Set([
    'cursor_central_directory_processing_in.md',
    'cursor_chat_name_generation_request.md',
    'cursor_finding_central_directory_handli.md',
    'cursor_review_and_fix_usdz_implementati.md',
    'cursor_upgrade_usdz_exporter_for_correc.md',
  ]);
  const downloadRows = downloadFiles.map((name, index) => ({
    theme_id: `THEME-DOWNLOAD-EXPORT-${String(index + 1).padStart(2, '0')}`,
    source_population: 'downloads-cursor-export',
    source_unit_ids: [`DOWNLOAD-EXPORT-${String(index + 1).padStart(2, '0')}`],
    source_hashes: [sha256File(resolve(options.downloadsRoot, name))],
    source_kind: 'cursor-markdown-export',
    disposition: restorationDownloads.has(name)
      ? 'classification-source'
      : assimpDownloads.has(name)
        ? 'external-workspace-provenance'
        : 'duplicate-export-provenance',
    canonical_targets: restorationDownloads.has(name)
      ? ['docs/research/cursor-history/themes.jsonl']
      : assimpDownloads.has(name)
        ? ['docs/research/cursor-history/themes.jsonl']
        : ['docs/research/cursor-plans/manifest.json'],
    conflict_keys: [],
    theme_summary: restorationDownloads.has(name)
      ? 'Readable classification source for one recovered primary-body theme; transcript text is not retained.'
      : assimpDownloads.has(name)
        ? 'Older assimpjs-workspace export retained as source-hash provenance and covered by the external-workspace theme review.'
        : 'Duplicate exported Tau transcript, subagent task, or plan-implementation history; stronger plan/current authorities are retained.',
    security_review: { status: 'hash-only-provenance' },
    transcript_text_retained: false,
    unresolved: false,
  }));

  const groupedRows: Array<Record<string, unknown>> = [
    {
      theme_id: 'THEME-TAU-MAIN-SEEDS',
      source_population: 'tau-main-jsonl-seeds',
      source_unit_ids: seedIds,
      source_hashes: [populationHash(seedIds)],
      source_kind: 'cursor-jsonl-main-population',
      disposition: 'covered-by-research-index',
      canonical_targets: ['docs/research/cursor-chat-unplanned-context-index.md'],
      conflict_keys: [],
      theme_summary:
        'The 62 substantive unplanned-context seeds were independently dispositioned into current research, policy, plans, or historical outcomes.',
      security_review: { status: 'themes-only' },
      transcript_text_retained: false,
      unresolved: false,
      coverage_count: seedIds.length,
    },
    {
      theme_id: 'THEME-TAU-MAIN-PLAN-AND-ROUTINE',
      source_population: 'tau-main-jsonl-plan-associated-and-routine',
      source_unit_ids: remainingMainIds,
      source_hashes: [populationHash(remainingMainIds)],
      source_kind: 'cursor-jsonl-main-population',
      disposition: 'covered-by-plan-or-routine-review',
      canonical_targets: [
        'docs/research/cursor-plans/manifest.json',
        'docs/research/cursor-chat-unplanned-context-index.md',
      ],
      conflict_keys: [],
      theme_summary:
        'The remaining exported main chats comprise 397 directly plan-associated conversations and 272 reviewed routine/cosmetic/shallow conversations.',
      security_review: { status: 'themes-only' },
      transcript_text_retained: false,
      unresolved: false,
      coverage_count: remainingMainIds.length,
      coverage_breakdown: { plan_associated: 397, routine_or_shallow: 272 },
    },
    {
      theme_id: 'THEME-TAU-SUBAGENT-EXPORTED',
      source_population: 'tau-subagent-jsonl-exported-header-matched',
      source_unit_ids: matchedExportedSubagents,
      source_hashes: [populationHash(matchedExportedSubagents)],
      source_kind: 'cursor-jsonl-subagent-population',
      disposition: 'covered-by-parent-plan-or-research',
      canonical_targets: [
        'docs/research/cursor-plans/manifest.json',
        'docs/research/cursor-chat-unplanned-context-index.md',
      ],
      conflict_keys: [],
      theme_summary:
        'Exported subagent work inherits the disposition of its parent plan or completed main-chat research review.',
      security_review: { status: 'themes-only' },
      transcript_text_retained: false,
      unresolved: false,
      coverage_count: matchedExportedSubagents.length,
    },
    {
      theme_id: 'THEME-TAU-SUBAGENT-HEADERLESS',
      source_population: 'tau-subagent-jsonl-headerless',
      source_unit_ids: headerlessSubagents,
      source_hashes: [populationHash(headerlessSubagents)],
      source_kind: 'cursor-jsonl-subagent-population',
      disposition: 'covered-by-parent-review',
      canonical_targets: ['docs/research/cursor-chat-unplanned-context-index.md'],
      conflict_keys: [],
      theme_summary:
        'The single headerless exported subagent remains separate from subagent-header arithmetic and is covered by its parent review.',
      security_review: { status: 'themes-only' },
      transcript_text_retained: false,
      unresolved: false,
      coverage_count: headerlessSubagents.length,
    },
    {
      theme_id: 'THEME-TAU-SUBAGENT-DB-INHERITED',
      source_population: 'tau-subagent-db-recoverable-inherited',
      source_unit_ids: inheritedRecoverableIds,
      source_hashes: [populationHash(inheritedRecoverableIds)],
      source_kind: 'cursor-kv-subagent-population',
      disposition: 'covered-by-parent-plan-or-research',
      canonical_targets: [
        'docs/research/cursor-plans/manifest.json',
        'docs/research/cursor-chat-unplanned-context-index.md',
      ],
      conflict_keys: [],
      theme_summary:
        'Recoverable DB-only subagent bodies were grouped by parent authority; their durable themes are already represented by plans, completed seed research, and current authorities.',
      security_review: { status: 'source-hash-and-theme-only' },
      transcript_text_retained: false,
      unresolved: false,
      coverage_count: inheritedRecoverableIds.length,
    },
    {
      theme_id: 'THEME-TAU-SUBAGENT-DB-RESIDUAL-CONTINUAL',
      source_population: 'tau-subagent-db-recoverable-residual',
      source_unit_ids: [continualLearningId],
      source_hashes: [populationHash([continualLearningId])],
      source_kind: 'cursor-kv-subagent-population',
      disposition: 'routine',
      canonical_targets: ['docs/policy/context-engineering-policy.md'],
      conflict_keys: [],
      theme_summary:
        'Operational continual-learning memory maintenance; current context-engineering authority preserves the durable practice.',
      security_review: { status: 'source-hash-and-theme-only' },
      transcript_text_retained: false,
      unresolved: false,
      coverage_count: 1,
    },
    {
      theme_id: 'THEME-TAU-SUBAGENT-DB-RESIDUAL-TASKS',
      source_population: 'tau-subagent-db-recoverable-residual',
      source_unit_ids: residualRecoverableIds,
      source_hashes: [populationHash(residualRecoverableIds)],
      source_kind: 'cursor-kv-subagent-population',
      disposition: 'covered-by-research',
      canonical_targets: [
        'docs/research/buerli-classcad-kernel-integration.md',
        'docs/research/ocjs-phase-4-smoke-readiness.md',
      ],
      conflict_keys: [],
      theme_summary:
        'The four task-style residual bodies cover Buerli examples and OCJS Phase 4 smoke validation, both already represented by current research.',
      security_review: { status: 'source-hash-and-theme-only' },
      transcript_text_retained: false,
      unresolved: false,
      coverage_count: residualRecoverableIds.length,
    },
    {
      theme_id: 'THEME-TAU-SUBAGENT-DB-UNRECOVERABLE',
      source_population: 'tau-subagent-db-unrecoverable',
      source_unit_ids: lostSubagentIds,
      source_hashes: [populationHash(lostSubagentIds)],
      source_kind: 'cursor-subagent-header-population',
      disposition: 'loss',
      canonical_targets: ['docs/research/cursor-history/losses.jsonl'],
      conflict_keys: [],
      theme_summary:
        'Nineteen subagent headers have no recoverable JSONL or KV body; titles and source identities are retained without invented conclusions.',
      security_review: { status: 'metadata-only' },
      transcript_text_retained: false,
      unresolved: false,
      coverage_count: lostSubagentIds.length,
    },
  ];

  const exactCounts = {
    main: mainIds.length,
    seeds: seedIds.length,
    remaining_main: remainingMainIds.length,
    exported_subagents: matchedExportedSubagents.length,
    headerless_subagents: headerlessSubagents.length,
    recoverable_subagents: inheritedRecoverableIds.length + 1 + residualRecoverableIds.length,
    unrecoverable_subagents: lostSubagentIds.length,
    downloads_exports: downloadRows.length,
    assimp_main: assimpMainIds.length,
  };
  const expectedCounts = {
    main: 731,
    seeds: 62,
    remaining_main: 669,
    exported_subagents: 3199,
    headerless_subagents: 1,
    recoverable_subagents: 746,
    unrecoverable_subagents: 19,
    downloads_exports: 13,
    assimp_main: 7,
  };
  if (canonicalJson(exactCounts) !== canonicalJson(expectedCounts)) {
    throw new Error(`theme coverage counts drifted: ${JSON.stringify(exactCounts)}`);
  }

  return [...results, ...cloudRows, ...downloadRows, ...groupedRows].sort((a, b) =>
    String(a.theme_id).localeCompare(String(b.theme_id)),
  );
};

const researchUnitSpecifications = [
  ['RSH-01', 'ragnar-competitor-analysis.md', '2026-03-15', 'superseded'],
  ['RSH-02', 'ragnar-competitor-analysis-v2.md', '2026-03-15', 'active'],
  ['RSH-03', 'ragnar-rocket-agent-lifecycle.md', '2026-03-15', 'active'],
  ['RSH-04', 'ragnar-rocket-validation-pipeline.md', '2026-03-15', 'active'],
  ['RSH-05', 'ragnar-threejs-architecture.md', '2026-03-15', 'active'],
  ['RSH-06', 'ragnar-client-feature-inventory.md', '2026-03-15', 'active'],
  ['RSH-07', 'ragnar-jet-engine-agent-lifecycle.md', '2026-03-16', 'active'],
  ['RSH-08', 'ragnar-jet-engine-validation-pipeline.md', '2026-03-16', 'active'],
  ['RSH-09', 'ragnar-jet-engine-analysis.md', '2026-03-16', 'active'],
  ['RSH-10', 'content-aware-watch-filtering.md', '2026-04-08', 'draft'],
  ['RSH-11', 'ocjs-v8-patch-audit.md', '2026-05-22', 'active'],
  ['RSH-12', '3d-model-conversion-script-analysis.md', '2025-07-23', 'superseded'],
  ['RSH-13', 'edge-line-shader-exploration.md', '2026-01-30', 'superseded'],
  ['RSH-14', 'kernel-graphics-data-flow-performance-analysis.md', '2026-02-03', 'superseded'],
  ['RSH-15', 'ocjs-replicad-rbv-build-scratchpad.md', '2026-03-23', 'superseded'],
  ['RSH-16', 'professional-rendering-target-state.md', '2026-02-17', 'active'],
  ['RSH-17', 'orville-cad-api.md', '2026-05-25', 'active'],
  ['RSH-18', 'buerli-classcad-kernel-integration.md', '2026-04-09', 'active'],
] as const;

const readJsonlFile = (path: string): Array<Record<string, unknown>> =>
  readFileSync(path, 'utf8')
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const parsed: unknown = JSON.parse(line);
      if (!isRecord(parsed)) {
        throw new Error(`JSONL row in ${path} must be an object`);
      }
      return parsed;
    });

const requiredRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
};

const researchSourceLocators: Readonly<Record<string, string>> = {
  'RSH-10': 'cursor-app-support://User/History/77477c48/Tfkg.md',
  'RSH-11': 'cursor-app-support://User/History/-713b0a17/mZJe.md',
  'RSH-12': 'cursor-app-support://User/History/25dfa005/3M0F.md',
  'RSH-13': 'cursor-app-support://User/History/2c0da1dc/aeSb.md',
  'RSH-14': 'cursor-app-support://User/History/72e04d7d/HGIh.md',
  'RSH-15': 'cursor-app-support://User/History/650f7ec5/bAzD.md',
  'RSH-16': 'cursor-app-support://User/History/23f59391/7xnP.md',
  'RSH-17': 'cursor-app-support://User/History/34b658dc/rqpG.md',
  'RSH-18': 'git://tau/2528c0730/docs/research/buerli-classcad-kernel-integration.md',
};

const researchSourceHashes: Readonly<Record<string, string>> = {
  'RSH-18': 'a08ca5028a4e01e37dffe697e5c0e6f2f94056ae3db201c4ca295793e3f84644',
};

const themeSourceLocator = (options: {
  unit: string;
  stagingDirectory: string;
  sourcePopulation: string;
  baselineEntries: ReadonlyMap<string, SourceBaselineEntry>;
}): string => {
  const baselineEntry = options.baselineEntries.get(options.unit);
  if (baselineEntry) {
    return baselineEntry.source_locator;
  }
  if (/^(?:CHAT-P|CHAT-F|ASSIMP-|CLOUD-)/u.test(options.unit)) {
    const metadata = requiredRecord(
      readJsonFile(resolve(options.stagingDirectory, `${options.unit}.json`)),
      `${options.unit} staging metadata`,
    );
    const recordId = metadata['record_id'] ?? metadata['composer_id'];
    if (typeof recordId !== 'string') {
      throw new TypeError(`${options.unit} staging metadata has no record_id`);
    }
    if (options.unit.startsWith('CHAT-P')) {
      const downloadSources: Readonly<Record<string, string>> = {
        'CHAT-P01': 'DOWNLOAD-EXPORT-07',
        'CHAT-P02': 'DOWNLOAD-EXPORT-04',
        'CHAT-P03': 'DOWNLOAD-EXPORT-02',
        'CHAT-P04': 'DOWNLOAD-EXPORT-05',
      };
      const downloadSource = downloadSources[options.unit];
      if (downloadSource) {
        const entry = options.baselineEntries.get(downloadSource);
        if (!entry) {
          throw new Error(`missing baseline source for ${options.unit}`);
        }
        return entry.source_locator;
      }
      return metadata['source_kind'] === 'cursor-disk-kv'
        ? `cursor-db://cursorDiskKV/composerData/${recordId}`
        : `conversation-search://local/${recordId}`;
    }
    if (options.unit.startsWith('CHAT-F') || options.unit.startsWith('CLOUD-')) {
      return `conversation-search://${options.unit.startsWith('CLOUD-') ? 'cloud-cache' : 'local'}/${recordId}`;
    }
    return `cursor-home://projects/Users-rifont-git-assimpjs/agent-transcripts/${recordId}/${recordId}.jsonl`;
  }
  if (options.sourcePopulation.startsWith('tau-main-jsonl')) {
    return 'cursor-home://projects/Users-rifont-git-tau/agent-transcripts';
  }
  if (options.sourcePopulation.startsWith('tau-subagent-jsonl')) {
    return 'cursor-home://projects/Users-rifont-git-tau/agent-transcripts/*/subagents';
  }
  if (options.sourcePopulation.startsWith('tau-subagent-db')) {
    return 'cursor-db://composerHeaders+cursorDiskKV/subagents';
  }
  throw new Error(`no symbolic source locator for ${options.unit}`);
};

export const assembleRecoveryManifest = (options: {
  historyRoot: string;
  researchRoot: string;
  stagingDirectory: string;
  sourceBaselinePath: string;
  databaseBaselinePath: string;
  planManifestPath: string;
  repositoryVisibility: string;
}): Record<string, unknown> => {
  const historyRoot = resolve(options.historyRoot);
  const researchRoot = resolve(options.researchRoot);
  const baseline = readBaseline(resolve(options.sourceBaselinePath));
  const baselineEntries = new Map(baseline.entries.map((entry) => [entry.unit, entry]));
  const databaseBaseline = requiredRecord(readJsonFile(resolve(options.databaseBaselinePath)), 'database baseline');
  const themes = readJsonlFile(resolve(historyRoot, 'themes.jsonl'));
  const headers = readJsonlFile(resolve(historyRoot, 'headers.jsonl'));
  const losses = readJsonlFile(resolve(historyRoot, 'losses.jsonl'));
  const legacy = requiredRecord(readJsonFile(resolve(historyRoot, 'legacy-authored-plans.json')), 'legacy plans');
  const ragnar = requiredRecord(
    readJsonFile(resolve(historyRoot, 'ragnar/evidence-inventory.json')),
    'Ragnar inventory',
  );
  const planManifest = requiredRecord(readJsonFile(resolve(options.planManifestPath)), 'plan manifest');
  const recoveredRagnarSources = (ragnar['sources'] as unknown[])
    .filter((source) => isRecord(source))
    .filter((source) => source['disposition'] === 'restored-research');
  const ragnarByTarget = new Map(
    recoveredRagnarSources.flatMap(
      (source): Array<[string, Record<string, unknown>]> =>
        Array.isArray(source['research_targets'])
          ? source['research_targets']
              .filter((target): target is string => typeof target === 'string')
              .map((target) => [basename(target), source])
          : [],
    ),
  );
  const ragnarByLocator = new Map(
    (Array.isArray(ragnar['sources']) ? ragnar['sources'].filter((source) => isRecord(source)) : []).flatMap(
      (source): Array<[string, Record<string, unknown>]> => {
        const locator = source['source_locator'];
        return isRecord(locator) && typeof locator['relative_path'] === 'string'
          ? [[`downloads://${locator['relative_path']}`, source]]
          : [];
      },
    ),
  );
  const researchSpecificationByUnit = new Map<string, { filename: string; date: string; status: string }>(
    researchUnitSpecifications.map(([unit, filename, date, status]) => [unit, { filename, date, status }]),
  );

  const sourceInventory = baseline.entries.map((entry) => {
    const researchSpecification = researchSpecificationByUnit.get(entry.unit);
    const ragnarSource = ragnarByLocator.get(entry.source_locator);
    const targetResearchLinks = researchSpecification
      ? [`docs/research/${researchSpecification.filename}`]
      : Array.isArray(ragnarSource?.['research_targets'])
        ? ragnarSource['research_targets']
        : entry.unit === 'DOWNLOAD-FUNDING'
          ? ['docs/research/tau-funding-options-new-zealand-australia.md']
          : entry.unit === 'DOWNLOAD-ORVILLE'
            ? ['docs/research/orville-cad-api.md']
            : entry.unit.startsWith('PLAN-') || entry.unit.startsWith('BACKUP-')
              ? ['docs/research/cursor-plans/manifest.json']
              : entry.unit.startsWith('DOWNLOAD-EXPORT-')
                ? ['docs/research/cursor-history/themes.jsonl']
                : [];
    const classification = researchSpecification
      ? 'restored-research-source'
      : typeof ragnarSource?.['disposition'] === 'string'
        ? ragnarSource['disposition']
        : entry.unit.startsWith('PLAN-LH-')
          ? 'archived-plan-source'
          : /^BACKUP-0[1-3]$/u.test(entry.unit)
            ? 'archived-plan-wrapper'
            : entry.unit === 'BACKUP-04'
              ? 'hash-only-raw-trace'
              : entry.unit.startsWith('DOWNLOAD-EXPORT-')
                ? 'theme-classification-or-provenance-source'
                : entry.unit === 'DOWNLOAD-FUNDING'
                  ? 'restored-private-research-source'
                  : entry.unit === 'DOWNLOAD-ORVILLE'
                    ? 'source-companion'
                    : entry.unit === 'DB-LOGICAL-SNAPSHOT'
                      ? 'logical-baseline-record'
                      : 'hash-accounted-source';
    const ragnarResearchTarget = Array.isArray(ragnarSource?.['research_targets'])
      ? ragnarSource['research_targets'].find((target): target is string => typeof target === 'string')
      : undefined;
    const sanitizedHash = researchSpecification
      ? sha256File(resolve(researchRoot, researchSpecification.filename))
      : ragnarResearchTarget && existsSync(resolve(repoRoot, ragnarResearchTarget))
        ? sha256File(resolve(repoRoot, ragnarResearchTarget))
        : typeof ragnarSource?.['sanitized_sha256'] === 'string'
          ? ragnarSource['sanitized_sha256']
          : null;
    const historicalDate = researchSpecification?.date ?? ragnarSource?.['historical_date'] ?? null;
    return {
      unit_id: entry.unit,
      source_kind: entry.source_kind,
      source_locator: entry.source_locator,
      original_sha256: entry.original_sha256,
      sanitized_sha256: sanitizedHash,
      size_bytes: entry.size,
      source_file_mtime_ms: entry.file_mtime_ms,
      historical_created: historicalDate,
      historical_updated: historicalDate,
      date_evidence: historicalDate ? 'research-provenance-or-capture-date' : 'file-mtime-not-used-as-authoring-date',
      extracted_at: baseline.extracted_at,
      preservation_classification: classification,
      redactions: { source_retained_raw: false, categories: ragnarSource?.['redaction_categories'] ?? [] },
      attachment_hashes: [],
      target_research_links: targetResearchLinks,
      duplicate_aliases: [],
      loss_reason: entry.unit === 'BACKUP-04' ? 'secret-bearing raw trace was classified by hash only' : null,
    };
  });

  const researchUnits = researchUnitSpecifications.map(([unit, filename, date, status]) => {
    const targetPath = resolve(researchRoot, filename);
    const baselineEntry = baselineEntries.get(unit);
    const ragnarSource = ragnarByTarget.get(filename);
    const originalHash =
      baselineEntry?.original_sha256 ?? ragnarSource?.['original_sha256'] ?? researchSourceHashes[unit];
    const locator =
      baselineEntry?.source_locator ??
      (isRecord(ragnarSource?.['source_locator']) && typeof ragnarSource['source_locator']['relative_path'] === 'string'
        ? `downloads://${ragnarSource['source_locator']['relative_path']}`
        : researchSourceLocators[unit]);
    if (typeof originalHash !== 'string' || !sha256Pattern.test(originalHash) || !locator) {
      throw new Error(`incomplete source provenance for ${unit}`);
    }
    return {
      unit_id: unit,
      source_kind: unit === 'RSH-18' ? 'git-history-research' : 'historical-research-file',
      source_locator: locator,
      original_sha256: originalHash,
      sanitized_sha256: sha256File(targetPath),
      historical_created: date,
      historical_updated: date,
      date_evidence:
        unit === 'RSH-18' ? 'source-frontmatter-and-git-commit' : 'source-frontmatter-or-last-content-change',
      extracted_at: baseline.extracted_at,
      preservation_classification: status === 'superseded' ? 'restored-superseded-research' : 'restored-research',
      redactions: { recorded_in_target: true, secret_values_retained: false },
      attachment_hashes: [],
      target_research_links: [`docs/research/${filename}`],
      duplicate_aliases: [],
    };
  });

  const themeUnits = themes.map((theme) => {
    const sourceUnits = Array.isArray(theme['source_unit_ids'])
      ? theme['source_unit_ids'].filter((unit): unit is string => typeof unit === 'string')
      : [];
    const sourceHashes = Array.isArray(theme['source_hashes'])
      ? theme['source_hashes'].filter((hash): hash is string => typeof hash === 'string')
      : [];
    const themeId = theme['theme_id'];
    const sourcePopulation = theme['source_population'];
    if (
      typeof themeId !== 'string' ||
      typeof sourcePopulation !== 'string' ||
      sourceUnits.length === 0 ||
      sourceHashes.length === 0
    ) {
      throw new Error('theme row has incomplete provenance');
    }
    return {
      unit_id: themeId,
      source_unit_ids: sourceUnits,
      source_kind: theme['source_kind'],
      source_locator: themeSourceLocator({
        unit: sourceUnits[0]!,
        stagingDirectory: options.stagingDirectory,
        sourcePopulation,
        baselineEntries,
      }),
      original_sha256: sourceHashes[0],
      sanitized_sha256: null,
      historical_created: theme['historical_created'] ?? null,
      historical_updated: theme['historical_updated'] ?? theme['historical_created'] ?? null,
      date_evidence: theme['historical_created'] ? 'classification-result' : 'not-reliably-recoverable',
      extracted_at: baseline.extracted_at,
      preservation_classification: theme['disposition'],
      redactions: theme['security_review'] ?? {},
      attachment_hashes: [],
      target_research_links: theme['canonical_targets'] ?? [],
      duplicate_aliases: [],
      loss_reason: theme['disposition'] === 'loss' ? 'source bodies unavailable; metadata only' : null,
    };
  });

  const outputFiles = [
    'headers.jsonl',
    'themes.jsonl',
    'losses.jsonl',
    'legacy-authored-plans.json',
    'ragnar/evidence-inventory.json',
    'ragnar/evidence/bicycle-generated-cad.py',
  ].map((path) => ({ path: `docs/research/cursor-history/${path}`, sha256: sha256File(resolve(historyRoot, path)) }));
  const headerCounts: Record<string, number> = {};
  for (const header of headers) {
    const status = typeof header['status'] === 'string' ? header['status'] : 'invalid';
    headerCounts[status] = (headerCounts[status] ?? 0) + 1;
  }
  const databaseState = requiredRecord(databaseBaseline['state'], 'database state baseline');
  const databaseSearch = requiredRecord(databaseBaseline['conversation_search'], 'conversation-search baseline');

  return {
    schema_version: 1,
    created: '2026-07-22',
    updated: '2026-07-22',
    date_timezone: 'Pacific/Auckland',
    repository_visibility: options.repositoryVisibility,
    extraction: {
      extracted_at: baseline.extracted_at,
      source_file_baseline_sha256: sha256File(resolve(options.sourceBaselinePath)),
      source_file_count: baseline.entries.length,
      source_files_record_size_hash_and_mtime: true,
      database_logical_baseline_sha256: sha256File(resolve(options.databaseBaselinePath)),
      database_strategy: databaseBaseline['strategy'],
      database_snapshot_consistent: databaseBaseline['snapshot_consistent'],
      cursor_closed: databaseBaseline['cursor_closed'],
      database_groups: [...(databaseState['groups'] as unknown[]), ...(databaseSearch['groups'] as unknown[])],
      source_data_deleted: false,
    },
    coverage: {
      primary_headers: {
        exported: 714,
        recovered: headerCounts['recovered'] ?? 0,
        metadata_only: headerCounts['metadata-only'] ?? 0,
        total: 2856,
      },
      primary_main_jsonls_reviewed: 731,
      primary_seed_jsonls: 62,
      primary_plan_associated: 397,
      primary_routine_or_shallow: 272,
      orphan_fts_bodies: 6,
      cloud_cache_residues: 3,
      exported_subagents_header_matched: 3199,
      exported_subagents_headerless: 1,
      db_recoverable_subagents: 746,
      db_unrecoverable_subagents: 19,
      total_tau_headers: 6820,
      assimpjs_main_jsonls: 7,
      downloads_cursor_exports: 13,
      recovered_research_documents: researchUnits.length,
      unresolved_themes: themes.filter((theme) => theme['unresolved'] === true || theme['disposition'] === 'unresolved')
        .length,
    },
    source_inventory: sourceInventory,
    research_units: researchUnits,
    theme_units: themeUnits,
    adjacent_research: [
      {
        unit_id: 'DOWNLOAD-FUNDING',
        source_locator: baselineEntries.get('DOWNLOAD-FUNDING')?.source_locator,
        original_sha256: baselineEntries.get('DOWNLOAD-FUNDING')?.original_sha256,
        target: 'docs/research/tau-funding-options-new-zealand-australia.md',
        sanitized_sha256: sha256File(resolve(researchRoot, 'tau-funding-options-new-zealand-australia.md')),
        disposition: 'restored-private-research-with-current-addendum',
        historical_created: '2026-05-25',
        historical_updated: '2026-05-25',
        current_addendum_date: '2026-07-22',
        personal_founder_assessment_retained: false,
      },
      {
        unit_id: 'DOWNLOAD-ORVILLE',
        source_locator: baselineEntries.get('DOWNLOAD-ORVILLE')?.source_locator,
        original_sha256: baselineEntries.get('DOWNLOAD-ORVILLE')?.original_sha256,
        target: 'docs/research/orville-cad-api.md',
        disposition: 'source-companion-for-rsh-17',
        duplicate_research_document_created: false,
      },
    ],
    plan_archive: {
      manifest_path: 'docs/research/cursor-plans/manifest.json',
      manifest_sha256: sha256File(resolve(options.planManifestPath)),
      physical_sources: planManifest['physical_sources'],
      distinct_contents: planManifest['distinct_contents'],
      deduplicated_copies: planManifest['deduplicated_copies'],
      recovered_local_history_plans: 14,
      backup_artifacts_classified: 4,
      backup_plans_archived: 3,
      backup_raw_traces_hash_only: 1,
      legacy_authored_plan_summaries: legacy['count'],
    },
    evidence: {
      ragnar_source_count: ragnar['source_count'],
      ragnar_zip_alias_count: ragnar['alias_count'],
      retained_payload_count: ragnar['retained_payload_count'],
      retained_images: 0,
      image_manual_review: 'not-applicable-no-images-retained',
      third_party_bundles: 'hash-only',
    },
    losses: {
      ledger_rows: losses.length,
      plan_bodies: losses.filter((loss) => String(loss['loss_id']).startsWith('LOSS-PLAN-')).length,
      exact_research_files: losses.filter((loss) => String(loss['loss_id']).startsWith('LOSS-RAGNAR-')).length,
      required_images: losses.filter((loss) => String(loss['loss_id']).startsWith('LOSS-IMAGE-')).length,
      unrecoverable_subagent_bodies: 19,
      all_acknowledged: losses.every((loss) => loss['acknowledgement_status'] === 'recorded'),
    },
    security: {
      automated_scan_required: true,
      unsanitized_sources_committed: false,
      chat_p17_plaintext_credential_retained: false,
      chat_p17_credential_redactions: 1,
      chat_p17_rotation_or_revocation_confirmed: false,
      deletion_gate_blocked_by_credential_clearance: true,
    },
    outputs: outputFiles,
    canonical_continuity_root: 'docs/research',
    cursor_local_data_required_for_research_continuity: false,
    deletion_authorized: false,
  };
};

export const collisionSafePlanFilename = (
  sourceName: string,
  content: string,
  existingHashes: ReadonlyMap<string, string> = new Map(),
): string => {
  const stem = basename(sourceName)
    .replace(/\.plan\.md$/iu, '')
    .replace(/\.md$/iu, '')
    .replaceAll(/[^a-z0-9._+-]+/giu, '_')
    .replaceAll(/^\.+|\.+$/gu, '')
    .slice(0, 100);
  const name = `${stem || 'recovered-plan'}.plan.md`;
  const contentHash = sha256(content);
  const existingHash = existingHashes.get(name);
  if (!existingHash || existingHash === contentHash) {
    return name;
  }

  return `${stem || 'recovered-plan'}__${contentHash.slice(0, 8)}.plan.md`;
};

export type SensitiveCategory = 'absolute-home-path' | 'credential' | 'private-email' | 'tokenized-url';

export type SensitiveFinding = {
  category: SensitiveCategory;
  start: number;
  end: number;
};

const addMatches = (options: {
  findings: SensitiveFinding[];
  text: string;
  category: SensitiveCategory;
  pattern: RegExp;
}): void => {
  for (const match of options.text.matchAll(options.pattern)) {
    options.findings.push({
      category: options.category,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
};

const tokenParameterNames = new Set([
  'access_token',
  'api_key',
  'apikey',
  'auth',
  'authorization',
  'jwt',
  'key',
  'session',
  'signature',
  'token',
]);

export const scanSensitiveText = (text: string): SensitiveFinding[] => {
  const findings: SensitiveFinding[] = [];
  addMatches({
    findings,
    text,
    category: 'absolute-home-path',
    pattern: /(?:\/Users|\/home)\/[A-Za-z0-9._-]+(?:\/|\b)|[A-Za-z]:\\Users\\[A-Za-z0-9._-]+(?:\\|\b)/gu,
  });
  addMatches({
    findings,
    text,
    category: 'credential',
    pattern:
      /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|(?:pk|sk)_(?:live|test)_[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2})\b/gu,
  });
  addMatches({
    findings,
    text,
    category: 'credential',
    pattern:
      /\b(?:api[_-]?key|authorization|password|secret|session[_-]?token|token)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}/giu,
  });
  addMatches({
    findings,
    text,
    category: 'credential',
    pattern:
      /["']?[A-Za-z][A-Za-z0-9_-]*(?:api|auth|blob|encryption|session|secret)[A-Za-z0-9_-]*(?:key|password|secret|token)["']?\s*[:=]\s*["']?[A-Za-z0-9+/=_-]{12,}/giu,
  });

  for (const match of text.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu)) {
    if (/@example\.(?:com|net|org)$/iu.test(match[0])) {
      continue;
    }
    findings.push({ category: 'private-email', start: match.index, end: match.index + match[0].length });
  }

  for (const match of text.matchAll(/https?:\/\/[^\s<>"')\]]+/gu)) {
    try {
      const url = new URL(match[0]);
      if ([...url.searchParams.keys()].some((key) => tokenParameterNames.has(key.toLowerCase()))) {
        findings.push({ category: 'tokenized-url', start: match.index, end: match.index + match[0].length });
      }
    } catch {
      // Ignore invalid URLs; the credential scanner still catches standalone known token forms.
    }
  }

  return findings
    .sort((a, b) => a.start - b.start || b.end - a.end || a.category.localeCompare(b.category))
    .filter((finding, index, ordered) => {
      const previous = ordered[index - 1];
      return !previous || finding.start >= previous.end;
    });
};

export const redactSensitiveText = (
  text: string,
): { text: string; counts: Partial<Record<SensitiveCategory, number>> } => {
  const findings = scanSensitiveText(text);
  const counts: Partial<Record<SensitiveCategory, number>> = {};
  let redacted = text;

  for (const finding of [...findings].reverse()) {
    redacted = `${redacted.slice(0, finding.start)}[REDACTED:${finding.category}]${redacted.slice(finding.end)}`;
    counts[finding.category] = (counts[finding.category] ?? 0) + 1;
  }

  return { text: redacted, counts };
};

export const atomicWriteClean = (path: string, content: string): void => {
  const findings = scanSensitiveText(content);
  if (findings.length > 0) {
    const categories = [...new Set(findings.map((finding) => finding.category))].sort();
    throw new Error(`refusing to write sensitive content (${categories.join(', ')})`);
  }

  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporaryPath, 'w');
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, path);
  } catch (error) {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
    rmSync(temporaryPath, { force: true });
    throw error;
  }
};

const atomicWriteUnchecked = (path: string, content: string | Uint8Array<ArrayBuffer>): void => {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, content);
  renameSync(temporaryPath, path);
};

export type SourceUnit = {
  unit: string;
  source_locator: string;
  source_kind: string;
};

export type SourceBaselineEntry = SourceUnit & {
  original_sha256: string;
  size: number;
  file_mtime_ms: number;
};

export type SourceBaseline = {
  schema_version: 1;
  extracted_at: string;
  entries: SourceBaselineEntry[];
};

export type DriftDiagnostic = {
  unit: string;
  kind: 'changed' | 'invalid-locator' | 'missing';
  message: string;
};

export const createSourceBaseline = (options: {
  units: readonly SourceUnit[];
  roots: Readonly<Record<string, string>>;
  extractedAt: string;
}): SourceBaseline => {
  const seen = new Set<string>();
  for (const unit of options.units) {
    if (seen.has(unit.unit)) {
      throw new Error(`duplicate source unit: ${unit.unit}`);
    }
    seen.add(unit.unit);
  }

  const entries = [...options.units]
    .sort((a, b) => a.unit.localeCompare(b.unit))
    .map((unit): SourceBaselineEntry => {
      const sourcePath = resolveSymbolicLocator(unit.source_locator, options.roots);
      const stats = statSync(sourcePath);
      if (!stats.isFile()) {
        throw new Error(`source unit is not a file: ${unit.source_locator}`);
      }
      return {
        ...unit,
        original_sha256: sha256File(sourcePath),
        size: stats.size,
        file_mtime_ms: stats.mtimeMs,
      };
    });

  return { schema_version: 1, extracted_at: options.extractedAt, entries };
};

export const verifySourceBaseline = (
  baseline: SourceBaseline,
  roots: Readonly<Record<string, string>>,
): DriftDiagnostic[] =>
  baseline.entries.flatMap((entry): DriftDiagnostic[] => {
    let sourcePath: string;
    try {
      sourcePath = resolveSymbolicLocator(entry.source_locator, roots);
    } catch (error) {
      return [
        {
          unit: entry.unit,
          kind: 'invalid-locator',
          message: error instanceof Error ? error.message : String(error),
        },
      ];
    }

    if (!existsSync(sourcePath)) {
      return [{ unit: entry.unit, kind: 'missing', message: `${entry.source_locator} is missing` }];
    }

    const stats = statSync(sourcePath);
    const actualHash = stats.isFile() ? sha256File(sourcePath) : '';
    if (stats.size !== entry.size || actualHash !== entry.original_sha256) {
      return [{ unit: entry.unit, kind: 'changed', message: `${entry.source_locator} changed after baseline` }];
    }
    return [];
  });

export type CoverageCounts = {
  exported_primary: number;
  recovered_primary: number;
  metadata_only_primary: number;
  orphan_fts: number;
  exported_subagents: number;
  recoverable_subagents: number;
  unrecoverable_subagents: number;
  headerless_subagents: number;
};

export const validateCoverageCounts = (counts: CoverageCounts): string[] => {
  const errors: string[] = [];
  const primary = counts.exported_primary + counts.recovered_primary + counts.metadata_only_primary;
  const subagents = counts.exported_subagents + counts.recoverable_subagents + counts.unrecoverable_subagents;
  if (
    counts.exported_primary !== 714 ||
    counts.recovered_primary !== 18 ||
    counts.metadata_only_primary !== 2124 ||
    primary !== 2856
  ) {
    errors.push('primary headers must satisfy 714 + 18 + 2,124 = 2,856');
  }
  if (
    counts.exported_subagents !== 3199 ||
    counts.recoverable_subagents !== 746 ||
    counts.unrecoverable_subagents !== 19 ||
    subagents !== 3964
  ) {
    errors.push('subagent headers must satisfy 3,199 + 746 + 19 = 3,964');
  }
  if (primary + subagents !== 6820) {
    errors.push('Tau headers must satisfy 2,856 + 3,964 = 6,820');
  }
  if (counts.orphan_fts !== 6) {
    errors.push('orphan FTS bodies must remain a separate population of 6');
  }
  if (counts.headerless_subagents !== 1) {
    errors.push('headerless exported subagents must remain a separate population of 1');
  }
  return errors;
};

export type OutputDiagnostic = {
  path: string;
  rule:
    | 'cursor-dependency'
    | 'duplicate-id'
    | 'hash-mismatch'
    | 'historical-date'
    | 'invalid-json'
    | 'invariant'
    | 'missing-file'
    | 'missing-link'
    | 'raw-transcript'
    | 'schema'
    | 'sensitive-content'
    | 'unresolved-theme';
  message: string;
};

const listFiles = (root: string): string[] => {
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(root, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    })
    .sort();
};

const ragnarResearchTargets: Readonly<Record<string, string>> = {
  'ragnar-competitor-analysis.md': 'docs/research/ragnar-competitor-analysis.md',
  'ragnar-competitor-analysis-v2.md': 'docs/research/ragnar-competitor-analysis-v2.md',
  'rocket/intermediary-agent-lifecycle.md': 'docs/research/ragnar-rocket-agent-lifecycle.md',
  'rocket/intermediary-validation-pipeline.md': 'docs/research/ragnar-rocket-validation-pipeline.md',
  'rocket/intermediary-threejs-architecture.md': 'docs/research/ragnar-threejs-architecture.md',
  'rocket/intermediary-client-features.md': 'docs/research/ragnar-client-feature-inventory.md',
  'intermediary-jet-engine-lifecycle.md': 'docs/research/ragnar-jet-engine-agent-lifecycle.md',
  'intermediary-jet-engine-validation.md': 'docs/research/ragnar-jet-engine-validation-pipeline.md',
  'ragnar-jet-engine-analysis.md': 'docs/research/ragnar-jet-engine-analysis.md',
};

const ragnarReferringUnits = (sourcePath: string): string[] => {
  if (sourcePath.startsWith('rocket/')) {
    return ['RSH-02', 'RSH-03', 'RSH-04', 'RSH-05', 'RSH-06'];
  }
  if (sourcePath.includes('jet-engine')) {
    return ['RSH-07', 'RSH-08', 'RSH-09'];
  }
  return ['RSH-01', 'RSH-02'];
};

export const createRagnarEvidenceInventory = (options: {
  sourceRoot: string;
  aliasFiles: readonly string[];
  retainedFixturePath: string;
}): unknown => {
  const sourceRoot = resolve(options.sourceRoot);
  const sources = listFiles(sourceRoot)
    .filter((path) => basename(path) !== '.DS_Store')
    .map((path, index) => {
      const sourcePath = relative(sourceRoot, path).split(sep).join('/');
      const stats = statSync(path);
      const originalHash = sha256File(path);
      const researchTarget = ragnarResearchTargets[sourcePath];
      const isFixture = sourcePath === 'bike-code.py';
      const isThirdPartyBundle = sourcePath.startsWith('rocket/js/');
      const disposition = researchTarget
        ? 'restored-research'
        : isFixture
          ? 'retained-safe-fixture'
          : isThirdPartyBundle
            ? 'hash-only-third-party'
            : 'hash-only-sensitive-source';
      const redactionCategories =
        /\.(?:html|json|md)$/iu.test(path) || ['execute-1', 'rangar-all'].includes(basename(path))
          ? [...new Set(scanSensitiveText(readFileSync(path, 'utf8')).map((finding) => finding.category))].sort()
          : [];
      return {
        evidence_id: `RAGNAR-EVIDENCE-${String(index + 1).padStart(2, '0')}`,
        source_locator: { root_id: 'downloads', relative_path: `rangar-analysis/${sourcePath}` },
        source_kind: researchTarget
          ? 'historical-research-source'
          : isThirdPartyBundle
            ? 'third-party-client-bundle'
            : 'captured-evidence',
        original_sha256: originalHash,
        sanitized_sha256: isFixture ? sha256File(options.retainedFixturePath) : undefined,
        size_bytes: stats.size,
        historical_date: sourcePath.includes('jet-engine') ? '2026-03-16' : '2026-03-15',
        disposition,
        redistribution_review: isThirdPartyBundle ? 'hash-only' : 'not-retained-raw',
        redaction_categories: redactionCategories,
        retained_path: isFixture ? 'docs/research/cursor-history/ragnar/evidence/bicycle-generated-cad.py' : undefined,
        research_targets: researchTarget ? [researchTarget] : [],
        referring_units: ragnarReferringUnits(sourcePath),
      };
    });
  const aliases = [...options.aliasFiles].sort().map((path) => ({
    source_locator: { root_id: 'downloads', relative_path: basename(path) },
    original_sha256: sha256File(path),
    size_bytes: statSync(path).size,
    disposition: 'duplicate-archive-alias',
    retained_payload: false,
  }));
  return {
    schema_version: 1,
    created: '2026-07-22',
    updated: '2026-07-22',
    source_count: sources.length,
    retained_payload_count: sources.filter((source) => source.retained_path).length,
    alias_count: aliases.length,
    sources,
    aliases,
  };
};

const recordIdentity = (record: Record<string, unknown>): string | undefined => {
  for (const key of ['theme_id', 'unit', 'id', 'composer_id']) {
    if (typeof record[key] === 'string') {
      return `${key}:${record[key]}`;
    }
  }
  return undefined;
};

const validateRecords = (options: {
  path: string;
  records: readonly unknown[];
  ledger: boolean;
}): OutputDiagnostic[] => {
  const diagnostics: OutputDiagnostic[] = [];
  const ids = new Set<string>();
  for (const record of options.records) {
    if (!isRecord(record)) {
      diagnostics.push({ path: options.path, rule: 'invalid-json', message: 'ledger row must be an object' });
      continue;
    }

    const identity = recordIdentity(record);
    if (identity && ids.has(identity)) {
      diagnostics.push({ path: options.path, rule: 'duplicate-id', message: `duplicate ${identity}` });
    }
    if (identity) {
      ids.add(identity);
    }

    if (options.ledger) {
      const rawKey = Object.keys(record).find((key) => forbiddenLedgerKeys.has(key));
      if (rawKey) {
        diagnostics.push({
          path: options.path,
          rule: 'raw-transcript',
          message: `ledger row contains forbidden raw field "${rawKey}"`,
        });
      }
    }
    if (record['disposition'] === 'unresolved') {
      diagnostics.push({ path: options.path, rule: 'unresolved-theme', message: 'theme disposition is unresolved' });
    }
  }
  return diagnostics;
};

const validateExactCount = (options: {
  diagnostics: OutputDiagnostic[];
  path: string;
  label: string;
  actual: number;
  expected: number;
}): void => {
  if (options.actual !== options.expected) {
    options.diagnostics.push({
      path: options.path,
      rule: 'invariant',
      message: `${options.label} must be ${options.expected}; found ${options.actual}`,
    });
  }
};

const yamlScalar = (text: string, key: string): string | undefined => {
  const frontmatter = /^---\n([\s\S]*?)\n---/u.exec(text)?.[1];
  if (!frontmatter) {
    return undefined;
  }
  const value = new RegExp(`^${key}:\\s*['"]?([^'"\\n]+)['"]?\\s*$`, 'mu').exec(frontmatter)?.[1];
  return value?.trim();
};

const validateCanonicalTarget = (options: {
  diagnostics: OutputDiagnostic[];
  sourcePath: string;
  target: string;
}): void => {
  if (!/^(?:apps|docs|kernels|libs|packages|repos|scripts)\//u.test(options.target)) {
    return;
  }
  const path = resolve(repoRoot, options.target.split('#')[0]!);
  if (!existsSync(path)) {
    options.diagnostics.push({
      path: options.sourcePath,
      rule: 'missing-link',
      message: `canonical target does not exist: ${options.target}`,
    });
  }
};

const validateCompleteRecoveryArchive = (options: { root: string; diagnostics: OutputDiagnostic[] }): void => {
  const { diagnostics } = options;
  const root = resolve(options.root);
  const researchRoot = dirname(root);
  const requiredPaths = expectedHistoryFiles.map((path) => resolve(root, path));
  if (requiredPaths.some((path) => !existsSync(path))) {
    return;
  }

  let headers: Array<Record<string, unknown>>;
  let themes: Array<Record<string, unknown>>;
  let losses: Array<Record<string, unknown>>;
  let manifest: Record<string, unknown>;
  let legacy: Record<string, unknown>;
  try {
    headers = readJsonlFile(resolve(root, 'headers.jsonl'));
    themes = readJsonlFile(resolve(root, 'themes.jsonl'));
    losses = readJsonlFile(resolve(root, 'losses.jsonl'));
    manifest = requiredRecord(readJsonFile(resolve(root, 'manifest.json')), 'manifest');
    legacy = requiredRecord(readJsonFile(resolve(root, 'legacy-authored-plans.json')), 'legacy plans');
  } catch (error) {
    diagnostics.push({
      path: '.',
      rule: 'schema',
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const headerIds = headers.flatMap((header): string[] =>
    typeof header['composer_id'] === 'string' ? [header['composer_id']] : [],
  );
  validateExactCount({
    diagnostics,
    path: 'headers.jsonl',
    label: 'header rows',
    actual: headers.length,
    expected: 2142,
  });
  validateExactCount({
    diagnostics,
    path: 'headers.jsonl',
    label: 'unique header IDs',
    actual: new Set(headerIds).size,
    expected: 2142,
  });
  validateExactCount({
    diagnostics,
    path: 'headers.jsonl',
    label: 'recovered primary headers',
    actual: headers.filter((header) => header['status'] === 'recovered').length,
    expected: 18,
  });
  validateExactCount({
    diagnostics,
    path: 'headers.jsonl',
    label: 'metadata-only primary headers',
    actual: headers.filter((header) => header['status'] === 'metadata-only').length,
    expected: 2124,
  });
  const duplicateBackend = headers.find((header) => header['composer_id'] === 'b427eaca-ff28-4136-9ba2-f678b0e70903');
  if (duplicateBackend?.['status'] !== 'metadata-only') {
    diagnostics.push({
      path: 'headers.jsonl',
      rule: 'invariant',
      message: 'the later backend-switching duplicate must remain metadata-only',
    });
  }
  for (const header of headers) {
    if (typeof header['source_header_sha256'] !== 'string' || !sha256Pattern.test(header['source_header_sha256'])) {
      diagnostics.push({ path: 'headers.jsonl', rule: 'schema', message: 'every header requires a source SHA-256' });
      break;
    }
  }

  const populationCount = (population: string): number =>
    themes
      .filter((theme) => theme['source_population'] === population)
      .reduce(
        (total, theme) => total + (Array.isArray(theme['source_unit_ids']) ? theme['source_unit_ids'].length : 0),
        0,
      );
  const themeCounts = [
    ['recovered-primary-body', 18],
    ['orphan-fts-body', 6],
    ['cloud-cache-residue', 3],
    ['downloads-cursor-export', 13],
    ['external-workspace-jsonl', 7],
    ['tau-main-jsonl-seeds', 62],
    ['tau-main-jsonl-plan-associated-and-routine', 669],
    ['tau-subagent-jsonl-exported-header-matched', 3199],
    ['tau-subagent-jsonl-headerless', 1],
    ['tau-subagent-db-recoverable-inherited', 741],
    ['tau-subagent-db-recoverable-residual', 5],
    ['tau-subagent-db-unrecoverable', 19],
  ] as const;
  validateExactCount({ diagnostics, path: 'themes.jsonl', label: 'theme rows', actual: themes.length, expected: 55 });
  for (const [population, expected] of themeCounts) {
    validateExactCount({
      diagnostics,
      path: 'themes.jsonl',
      label: `${population} units`,
      actual: populationCount(population),
      expected,
    });
  }
  const expectedIndividualUnits = [
    ...Array.from({ length: 18 }, (_, index) => `CHAT-P${String(index + 1).padStart(2, '0')}`),
    ...Array.from({ length: 6 }, (_, index) => `CHAT-F${String(index + 1).padStart(2, '0')}`),
    ...Array.from({ length: 7 }, (_, index) => `ASSIMP-${String(index + 1).padStart(2, '0')}`),
    ...Array.from({ length: 3 }, (_, index) => `CLOUD-${String(index + 1).padStart(2, '0')}`),
    ...Array.from({ length: 13 }, (_, index) => `DOWNLOAD-EXPORT-${String(index + 1).padStart(2, '0')}`),
  ];
  const allThemeUnits = themes.flatMap((theme): string[] =>
    Array.isArray(theme['source_unit_ids'])
      ? theme['source_unit_ids'].filter((unit): unit is string => typeof unit === 'string')
      : [],
  );
  for (const unit of expectedIndividualUnits) {
    if (allThemeUnits.filter((candidate) => candidate === unit).length !== 1) {
      diagnostics.push({ path: 'themes.jsonl', rule: 'invariant', message: `${unit} must occur exactly once` });
    }
  }
  for (const theme of themes) {
    if (
      theme['transcript_text_retained'] !== false ||
      typeof theme['theme_summary'] !== 'string' ||
      theme['theme_summary'].length === 0 ||
      theme['theme_summary'].length > 1600
    ) {
      diagnostics.push({
        path: 'themes.jsonl',
        rule: 'raw-transcript',
        message: `${String(theme['theme_id'])} violates the bounded theme-only contract`,
      });
    }
    if (
      !Array.isArray(theme['source_hashes']) ||
      !theme['source_hashes'].every((hash) => typeof hash === 'string' && sha256Pattern.test(hash))
    ) {
      diagnostics.push({
        path: 'themes.jsonl',
        rule: 'schema',
        message: `${String(theme['theme_id'])} has invalid source hashes`,
      });
    }
    if (Array.isArray(theme['canonical_targets'])) {
      for (const target of theme['canonical_targets']) {
        if (typeof target === 'string') {
          validateCanonicalTarget({ diagnostics, sourcePath: 'themes.jsonl', target });
        }
      }
    }
  }

  validateExactCount({ diagnostics, path: 'losses.jsonl', label: 'loss rows', actual: losses.length, expected: 7 });
  validateExactCount({
    diagnostics,
    path: 'losses.jsonl',
    label: 'lost plan bodies',
    actual: losses.filter((loss) => String(loss['loss_id']).startsWith('LOSS-PLAN-')).length,
    expected: 2,
  });
  validateExactCount({
    diagnostics,
    path: 'losses.jsonl',
    label: 'known missing research dependencies',
    actual: losses.filter((loss) => /^(?:LOSS-IMAGE|LOSS-RAGNAR)-/u.test(String(loss['loss_id']))).length,
    expected: 4,
  });
  const subagentLoss = losses.find((loss) => loss['loss_id'] === 'LOSS-SUBAGENT-01');
  validateExactCount({
    diagnostics,
    path: 'losses.jsonl',
    label: 'unrecoverable subagent IDs',
    actual: Array.isArray(subagentLoss?.['source_unit_ids']) ? subagentLoss['source_unit_ids'].length : 0,
    expected: 19,
  });
  if (!losses.every((loss) => loss['acknowledgement_status'] === 'recorded')) {
    diagnostics.push({ path: 'losses.jsonl', rule: 'invariant', message: 'every loss must be acknowledged' });
  }

  if (
    legacy['summary_only'] !== true ||
    legacy['count'] !== 28 ||
    !Array.isArray(legacy['plans']) ||
    legacy['plans'].length !== 28
  ) {
    diagnostics.push({
      path: 'legacy-authored-plans.json',
      rule: 'invariant',
      message: 'legacy authored-plan ledger must contain exactly 28 summary-only records',
    });
  }

  const ragnarPath = resolve(root, 'ragnar/evidence-inventory.json');
  if (existsSync(ragnarPath)) {
    const ragnar = requiredRecord(readJsonFile(ragnarPath), 'Ragnar inventory');
    if (ragnar['source_count'] !== 47 || ragnar['alias_count'] !== 2 || ragnar['retained_payload_count'] !== 1) {
      diagnostics.push({
        path: 'ragnar/evidence-inventory.json',
        rule: 'invariant',
        message: 'Ragnar inventory must record 47 sources, two ZIP aliases, and one retained safe payload',
      });
    }
    const retained = Array.isArray(ragnar['sources'])
      ? ragnar['sources'].filter((source) => isRecord(source) && typeof source['retained_path'] === 'string')
      : [];
    for (const source of retained) {
      const path = resolve(repoRoot, String(source['retained_path']));
      if (!existsSync(path) || sha256File(path) !== source['sanitized_sha256']) {
        diagnostics.push({
          path: 'ragnar/evidence-inventory.json',
          rule: 'hash-mismatch',
          message: 'retained Ragnar payload hash does not match',
        });
      }
      if (!Array.isArray(source['referring_units']) || source['referring_units'].length === 0) {
        diagnostics.push({
          path: 'ragnar/evidence-inventory.json',
          rule: 'invariant',
          message: 'retained evidence must have a referring unit',
        });
      }
    }
  } else {
    diagnostics.push({
      path: 'ragnar/evidence-inventory.json',
      rule: 'missing-file',
      message: 'Ragnar inventory is required',
    });
  }

  const expectedResearch = new Map(
    researchUnitSpecifications.map(([unit, filename, date, status]) => [unit, { filename, date, status }]),
  );
  for (const [unit, specification] of expectedResearch) {
    const path = resolve(researchRoot, specification.filename);
    if (!existsSync(path)) {
      diagnostics.push({ path: specification.filename, rule: 'missing-file', message: `${unit} is required` });
      continue;
    }
    const text = readFileSync(path, 'utf8');
    const sensitive = scanSensitiveText(text);
    if (sensitive.length > 0) {
      diagnostics.push({
        path: specification.filename,
        rule: 'sensitive-content',
        message: `recovered research contains ${[...new Set(sensitive.map((finding) => finding.category))].sort().join(', ')}`,
      });
    }
    if (yamlScalar(text, 'created') !== specification.date || yamlScalar(text, 'updated') !== specification.date) {
      diagnostics.push({
        path: specification.filename,
        rule: 'historical-date',
        message: `${unit} must retain ${specification.date}`,
      });
    }
    if (yamlScalar(text, 'status') !== specification.status) {
      diagnostics.push({
        path: specification.filename,
        rule: 'schema',
        message: `${unit} must have status ${specification.status}`,
      });
    }
  }
  const additionalResearch = [
    ['assimp-usd-snapshot-scale-clipping.md', '2026-02-23'],
    ['tau-funding-options-new-zealand-australia.md', '2026-05-25'],
  ] as const;
  for (const [filename, date] of additionalResearch) {
    const path = resolve(researchRoot, filename);
    if (!existsSync(path)) {
      diagnostics.push({ path: filename, rule: 'missing-file', message: 'recovered adjacent research is required' });
      continue;
    }
    const text = readFileSync(path, 'utf8');
    const sensitive = scanSensitiveText(text);
    if (sensitive.length > 0) {
      diagnostics.push({
        path: filename,
        rule: 'sensitive-content',
        message: `adjacent research contains ${[...new Set(sensitive.map((finding) => finding.category))].sort().join(', ')}`,
      });
    }
    if (yamlScalar(text, 'created') !== date) {
      diagnostics.push({ path: filename, rule: 'historical-date', message: `created must remain ${date}` });
    }
  }
  for (const filename of ['cursor-chat-unplanned-context-index.md', 'cursor-disk-usage-cleanup-audit.md']) {
    const path = resolve(researchRoot, filename);
    if (!existsSync(path)) {
      diagnostics.push({ path: filename, rule: 'missing-file', message: 'reconciled Cursor audit is required' });
      continue;
    }
    const text = readFileSync(path, 'utf8');
    if (/\/Users\/|locate and reopen|reopen Cursor|agent-transcripts\/<|Source transcripts:/u.test(text)) {
      diagnostics.push({
        path: filename,
        rule: 'cursor-dependency',
        message: 'audit still depends on a user-local Cursor source workflow',
      });
    }
  }

  const planManifestPath = resolve(researchRoot, 'cursor-plans/manifest.json');
  if (existsSync(planManifestPath)) {
    const planManifest = requiredRecord(readJsonFile(planManifestPath), 'plan manifest');
    const plans = Array.isArray(planManifest['plans']) ? planManifest['plans'].filter(isRecord) : [];
    if (
      planManifest['schema_version'] !== 3 ||
      planManifest['physical_sources'] !== 2012 ||
      planManifest['distinct_contents'] !== 1645 ||
      planManifest['deduplicated_copies'] !== 367 ||
      plans.length !== 1645
    ) {
      diagnostics.push({
        path: '../cursor-plans/manifest.json',
        rule: 'invariant',
        message: 'plan archive counts or schema drifted',
      });
    }
    validateExactCount({
      diagnostics,
      path: '../cursor-plans/manifest.json',
      label: 'Local History plan records',
      actual: plans.filter((plan) => plan['source_kind'] === 'cursor-local-history').length,
      expected: 14,
    });
    validateExactCount({
      diagnostics,
      path: '../cursor-plans/manifest.json',
      label: 'Backup wrapper plan records',
      actual: plans.filter((plan) => plan['source_kind'] === 'cursor-backup-wrapper').length,
      expected: 3,
    });
    const archivedNames = new Set<string>();
    for (const plan of plans) {
      const { archived, sha256: expectedHash } = plan;
      if (typeof archived !== 'string' || typeof expectedHash !== 'string' || archivedNames.has(archived)) {
        diagnostics.push({
          path: '../cursor-plans/manifest.json',
          rule: 'schema',
          message: 'plan archive names must be unique and hashed',
        });
        continue;
      }
      archivedNames.add(archived);
      const path = resolve(researchRoot, 'cursor-plans', archived);
      if (!existsSync(path) || sha256File(path) !== expectedHash) {
        diagnostics.push({
          path: `../cursor-plans/${archived}`,
          rule: 'hash-mismatch',
          message: 'archived plan hash does not match manifest',
        });
      }
      const sourceAliases = plan['source_aliases'];
      const portableAliases: unknown[] = Array.isArray(sourceAliases) ? (sourceAliases as unknown[]) : [];
      if (
        !isRecord(plan['canonical_source']) ||
        !Array.isArray(sourceAliases) ||
        JSON.stringify([plan['canonical_source'], ...portableAliases]).includes('/Users/')
      ) {
        diagnostics.push({
          path: '../cursor-plans/manifest.json',
          rule: 'cursor-dependency',
          message: 'plan sources must use portable locator objects',
        });
      }
    }
  } else {
    diagnostics.push({
      path: '../cursor-plans/manifest.json',
      rule: 'missing-file',
      message: 'plan manifest is required',
    });
  }

  const coverage = isRecord(manifest['coverage']) ? manifest['coverage'] : {};
  const primary = isRecord(coverage['primary_headers']) ? coverage['primary_headers'] : {};
  const coverageErrors = validateCoverageCounts({
    exported_primary: Number(primary['exported']),
    recovered_primary: Number(primary['recovered']),
    metadata_only_primary: Number(primary['metadata_only']),
    orphan_fts: Number(coverage['orphan_fts_bodies']),
    exported_subagents: Number(coverage['exported_subagents_header_matched']),
    recoverable_subagents: Number(coverage['db_recoverable_subagents']),
    unrecoverable_subagents: Number(coverage['db_unrecoverable_subagents']),
    headerless_subagents: Number(coverage['exported_subagents_headerless']),
  });
  diagnostics.push(
    ...coverageErrors.map((message): OutputDiagnostic => ({ path: 'manifest.json', rule: 'invariant', message })),
  );
  if (
    manifest['repository_visibility'] !== 'PRIVATE' ||
    manifest['deletion_authorized'] !== false ||
    manifest['cursor_local_data_required_for_research_continuity'] !== false
  ) {
    diagnostics.push({
      path: 'manifest.json',
      rule: 'invariant',
      message: 'privacy, continuity, or destructive-boundary state is invalid',
    });
  }
  const outputs = Array.isArray(manifest['outputs']) ? manifest['outputs'].filter(isRecord) : [];
  for (const output of outputs) {
    if (typeof output['path'] !== 'string' || typeof output['sha256'] !== 'string') {
      diagnostics.push({ path: 'manifest.json', rule: 'schema', message: 'manifest output entry is incomplete' });
      continue;
    }
    const path = resolve(repoRoot, output['path']);
    if (!existsSync(path) || sha256File(path) !== output['sha256']) {
      diagnostics.push({
        path: 'manifest.json',
        rule: 'hash-mismatch',
        message: `output hash does not match: ${output['path']}`,
      });
    }
  }
  const researchUnits = Array.isArray(manifest['research_units']) ? manifest['research_units'].filter(isRecord) : [];
  validateExactCount({
    diagnostics,
    path: 'manifest.json',
    label: 'manifest research units',
    actual: researchUnits.length,
    expected: 18,
  });
  validateExactCount({
    diagnostics,
    path: 'manifest.json',
    label: 'manifest theme units',
    actual: Array.isArray(manifest['theme_units']) ? manifest['theme_units'].length : 0,
    expected: 55,
  });
  validateExactCount({
    diagnostics,
    path: 'manifest.json',
    label: 'file-source baseline entries',
    actual: Array.isArray(manifest['source_inventory']) ? manifest['source_inventory'].length : 0,
    expected: 91,
  });
  const sourceInventory = Array.isArray(manifest['source_inventory'])
    ? manifest['source_inventory'].filter((entry) => isRecord(entry))
    : [];
  const sourcePrefixCounts = [
    ['BACKUP-', 4],
    ['DOWNLOAD-EXPORT-', 13],
    ['PLAN-LH-', 14],
    ['RAGNAR-SOURCE-', 47],
    ['RAGNAR-ZIP-', 2],
    ['RSH-', 8],
  ] as const;
  for (const [prefix, expected] of sourcePrefixCounts) {
    validateExactCount({
      diagnostics,
      path: 'manifest.json',
      label: `${prefix} source entries`,
      actual: sourceInventory.filter((entry) => String(entry['unit_id']).startsWith(prefix)).length,
      expected,
    });
  }
  for (const entry of sourceInventory) {
    if (
      typeof entry['unit_id'] !== 'string' ||
      typeof entry['source_locator'] !== 'string' ||
      typeof entry['original_sha256'] !== 'string' ||
      !sha256Pattern.test(entry['original_sha256']) ||
      typeof entry['size_bytes'] !== 'number' ||
      typeof entry['source_file_mtime_ms'] !== 'number' ||
      typeof entry['preservation_classification'] !== 'string' ||
      !Array.isArray(entry['target_research_links']) ||
      !isRecord(entry['redactions'])
    ) {
      diagnostics.push({ path: 'manifest.json', rule: 'schema', message: 'source inventory entry is incomplete' });
      break;
    }
    if (entry['source_locator'].includes('/Users/')) {
      diagnostics.push({
        path: 'manifest.json',
        rule: 'cursor-dependency',
        message: 'source inventory contains an absolute home path',
      });
      break;
    }
  }
  const manifestThemeUnits = Array.isArray(manifest['theme_units'])
    ? manifest['theme_units'].filter((entry) => isRecord(entry))
    : [];
  for (const entry of manifestThemeUnits) {
    if (
      typeof entry['unit_id'] !== 'string' ||
      typeof entry['source_locator'] !== 'string' ||
      typeof entry['original_sha256'] !== 'string' ||
      !sha256Pattern.test(entry['original_sha256']) ||
      typeof entry['preservation_classification'] !== 'string' ||
      !Array.isArray(entry['target_research_links'])
    ) {
      diagnostics.push({ path: 'manifest.json', rule: 'schema', message: 'theme manifest entry is incomplete' });
      break;
    }
  }
  for (const unit of researchUnits) {
    const targets = Array.isArray(unit['target_research_links'])
      ? unit['target_research_links'].filter((target): target is string => typeof target === 'string')
      : [];
    const target = targets[0];
    if (!target || typeof unit['sanitized_sha256'] !== 'string') {
      diagnostics.push({ path: 'manifest.json', rule: 'schema', message: 'research unit is missing its target hash' });
      continue;
    }
    const path = resolve(repoRoot, target);
    if (!existsSync(path) || sha256File(path) !== unit['sanitized_sha256']) {
      diagnostics.push({
        path: 'manifest.json',
        rule: 'hash-mismatch',
        message: `research target hash does not match: ${target}`,
      });
    }
  }
};

export const validateCommittedOutputs = (options: { root: string; requireComplete?: boolean }): OutputDiagnostic[] => {
  const root = resolve(options.root);
  const diagnostics: OutputDiagnostic[] = [];
  if (options.requireComplete) {
    for (const required of expectedHistoryFiles) {
      if (!existsSync(resolve(root, required))) {
        diagnostics.push({ path: required, rule: 'missing-file', message: `${required} is required` });
      }
    }
  }

  for (const path of listFiles(root)) {
    if (lstatSync(path).isSymbolicLink() || !/\.(?:json|jsonl|md|txt|html|har)$/iu.test(path)) {
      continue;
    }
    const outputPath = relative(root, path).split(sep).join('/');
    const text = readFileSync(path, 'utf8');
    const sensitive = scanSensitiveText(text);
    if (sensitive.length > 0) {
      const categories = [...new Set(sensitive.map((finding) => finding.category))].sort();
      diagnostics.push({
        path: outputPath,
        rule: 'sensitive-content',
        message: `contains ${categories.join(', ')}`,
      });
    }

    if (path.endsWith('.jsonl')) {
      const records: unknown[] = [];
      for (const [index, line] of text.split(/\r?\n/u).entries()) {
        if (!line.trim()) {
          continue;
        }
        try {
          records.push(JSON.parse(line));
        } catch {
          diagnostics.push({
            path: outputPath,
            rule: 'invalid-json',
            message: `line ${index + 1} is not valid JSON`,
          });
        }
      }
      diagnostics.push(...validateRecords({ path: outputPath, records, ledger: true }));
      continue;
    }

    if (path.endsWith('.json') || path.endsWith('.har')) {
      try {
        const parsed: unknown = JSON.parse(text);
        const records = Array.isArray(parsed)
          ? parsed
          : isRecord(parsed) && Array.isArray(parsed['entries'])
            ? parsed['entries']
            : [];
        diagnostics.push(...validateRecords({ path: outputPath, records, ledger: false }));
      } catch {
        diagnostics.push({ path: outputPath, rule: 'invalid-json', message: 'file is not valid JSON' });
      }
    }
  }
  if (options.requireComplete) {
    validateCompleteRecoveryArchive({ root, diagnostics });
  }
  return diagnostics;
};

type SymbolicSource = { root_id: string; relative_path: string };
type PlanRecord = {
  archived: string;
  sha256: string;
  created: string;
  updated: string;
  source_kind: string;
  canonical_source: SymbolicSource;
  source_aliases: SymbolicSource[];
  wrapper_sha256?: string;
};

const portableSource = (sourcePath: string): SymbolicSource => {
  const normalized = sourcePath.replaceAll('\\', '/');
  const mappings = [
    [/^.*\/git\/tau\/(.+)$/u, 'tau-workspace'],
    [/^.*\/Library\/Application Support\/Cursor\/(.+)$/u, 'cursor-app-support'],
    [/^.*\/Downloads\/(.+)$/u, 'downloads'],
    [/^.*\/\.cursor\/(.+)$/u, 'cursor-home'],
  ] as const;
  for (const [pattern, root_id] of mappings) {
    const match = pattern.exec(normalized);
    if (match?.[1]) {
      return { root_id, relative_path: match[1] };
    }
  }
  throw new Error(`cannot make plan source portable: ${sourcePath}`);
};

const aucklandDate = (value: number | Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const normalizePlanRecord = (value: unknown): PlanRecord => {
  if (!isRecord(value)) {
    throw new TypeError('plan manifest entry must be an object');
  }
  const aliases = value['source_aliases'];
  if (
    typeof value['archived'] !== 'string' ||
    typeof value['sha256'] !== 'string' ||
    typeof value['created'] !== 'string' ||
    typeof value['updated'] !== 'string' ||
    !Array.isArray(aliases)
  ) {
    throw new TypeError('invalid plan manifest entry');
  }
  const normalizedAliases = aliases.map((alias): SymbolicSource => {
    if (typeof alias === 'string') {
      return portableSource(alias);
    }
    if (isRecord(alias) && typeof alias['root_id'] === 'string' && typeof alias['relative_path'] === 'string') {
      return { root_id: alias['root_id'], relative_path: alias['relative_path'] };
    }
    throw new Error(`invalid plan source alias for ${String(value['archived'])}`);
  });
  const canonical = value['canonical_source'];
  const canonical_source =
    typeof canonical === 'string'
      ? portableSource(canonical)
      : isRecord(canonical) &&
          typeof canonical['root_id'] === 'string' &&
          typeof canonical['relative_path'] === 'string'
        ? { root_id: canonical['root_id'], relative_path: canonical['relative_path'] }
        : normalizedAliases[0];
  if (!canonical_source) {
    throw new Error(`plan has no canonical source: ${String(value['archived'])}`);
  }
  return {
    archived: value['archived'],
    sha256: value['sha256'],
    created: value['created'],
    updated: value['updated'],
    source_kind: typeof value['source_kind'] === 'string' ? value['source_kind'] : 'cursor-plan-file',
    canonical_source,
    source_aliases: normalizedAliases,
    ...(typeof value['wrapper_sha256'] === 'string' ? { wrapper_sha256: value['wrapper_sha256'] } : {}),
  };
};

export const recoverPlanArchive = (options: {
  historyRoot: string;
  backupsRoot: string;
  archiveRoot: string;
  manifestPath: string;
  historyDirectories: ReadonlySet<string>;
}): { historyPlans: number; backupPlans: number; plans: number } => {
  const rawManifest: unknown = JSON.parse(readFileSync(options.manifestPath, 'utf8'));
  if (!isRecord(rawManifest) || !Array.isArray(rawManifest['plans'])) {
    throw new Error('invalid cursor plan manifest');
  }
  const plans = rawManifest['plans'].map(normalizePlanRecord);
  const byHash = new Map(plans.map((plan) => [plan.sha256, plan]));
  const occupied = new Map(plans.map((plan) => [plan.archived, plan.sha256]));
  let historyPlans = 0;
  let backupPlans = 0;

  for (const directory of readdirSync(options.historyRoot, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  )) {
    if (!options.historyDirectories.has(directory.name)) {
      continue;
    }
    const entriesPath = resolve(options.historyRoot, directory.name, 'entries.json');
    if (!existsSync(entriesPath)) {
      continue;
    }
    const history: unknown = JSON.parse(readFileSync(entriesPath, 'utf8'));
    if (!isRecord(history) || typeof history['resource'] !== 'string' || !Array.isArray(history['entries'])) {
      continue;
    }
    let resourcePath: string;
    try {
      resourcePath = fileURLToPath(history['resource']);
    } catch {
      continue;
    }
    if (!resourcePath.endsWith('.plan.md')) {
      continue;
    }
    const revisions = history['entries'].flatMap((entry): LocalHistoryRevision[] => {
      if (!isRecord(entry) || typeof entry['id'] !== 'string' || typeof entry['timestamp'] !== 'number') {
        return [];
      }
      const revisionPath = resolve(options.historyRoot, directory.name, entry['id']);
      return existsSync(revisionPath)
        ? [{ id: entry['id'], timestamp: entry['timestamp'], content: readFileSync(revisionPath, 'utf8') }]
        : [];
    });
    const range = selectContentChangeRange(revisions);
    if (!range) {
      continue;
    }
    const { content } = range.last;
    const contentHash = sha256(content);
    if (byHash.has(contentHash)) {
      continue;
    }
    const archived = collisionSafePlanFilename(basename(resourcePath), content, occupied);
    const sourcePath = resolve(options.historyRoot, directory.name, range.last.id);
    const record: PlanRecord = {
      archived,
      sha256: contentHash,
      created: aucklandDate(range.first.timestamp),
      updated: aucklandDate(range.last.timestamp),
      source_kind: 'cursor-local-history',
      canonical_source: portableSource(sourcePath),
      source_aliases: [portableSource(sourcePath)],
    };
    atomicWriteUnchecked(resolve(options.archiveRoot, archived), content);
    plans.push(record);
    byHash.set(contentHash, record);
    occupied.set(archived, contentHash);
    historyPlans++;
  }

  for (const sourcePath of listFiles(options.backupsRoot)) {
    const source = readFileSync(sourcePath, 'utf8');
    const payload = dispatchBackupPayload(source);
    if (payload.kind !== 'content-wrapper' || byHash.has(payload.content_sha256)) {
      continue;
    }
    const sourceName = payload.backup_uri ? basename(new URL(payload.backup_uri).pathname) : 'recovered-backup.plan.md';
    const archived = collisionSafePlanFilename(sourceName, payload.content, occupied);
    const stats = statSync(sourcePath);
    const record: PlanRecord = {
      archived,
      sha256: payload.content_sha256,
      created: aucklandDate(stats.birthtime),
      updated: aucklandDate(stats.mtime),
      source_kind: 'cursor-backup-wrapper',
      canonical_source: portableSource(sourcePath),
      source_aliases: [portableSource(sourcePath)],
      wrapper_sha256: payload.wrapper_sha256,
    };
    atomicWriteUnchecked(resolve(options.archiveRoot, archived), payload.content);
    plans.push(record);
    byHash.set(record.sha256, record);
    occupied.set(archived, record.sha256);
    backupPlans++;
  }

  plans.sort((a, b) => a.archived.localeCompare(b.archived) || a.sha256.localeCompare(b.sha256));
  const physicalSources = plans.reduce((total, plan) => total + plan.source_aliases.length, 0);
  atomicWriteClean(
    options.manifestPath,
    canonicalJson({
      schema_version: 3,
      created: rawManifest['created'],
      updated: '2026-07-22',
      date_timezone: 'Pacific/Auckland',
      source_roots: {
        'cursor-app-support': 'Cursor Application Support root',
        'cursor-home': 'Cursor user-data root',
        downloads: 'Downloads recovery root',
        'tau-workspace': 'Tau workspace root',
      },
      physical_sources: physicalSources,
      distinct_contents: plans.length,
      deduplicated_copies: physicalSources - plans.length,
      plans,
    }),
  );
  return { historyPlans, backupPlans, plans: plans.length };
};

const parseAssignments = (assignments: readonly string[] | undefined, label: string): Record<string, string> =>
  Object.fromEntries(
    (assignments ?? []).map((assignment) => {
      const separator = assignment.indexOf('=');
      if (separator <= 0 || separator === assignment.length - 1) {
        throw new Error(`${label} must use NAME=VALUE: ${assignment}`);
      }
      return [assignment.slice(0, separator), assignment.slice(separator + 1)];
    }),
  );

const readBaseline = (path: string): SourceBaseline => {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (
    !isRecord(parsed) ||
    parsed['schema_version'] !== 1 ||
    typeof parsed['extracted_at'] !== 'string' ||
    !Array.isArray(parsed['entries']) ||
    !parsed['entries'].every(
      (entry) =>
        isRecord(entry) &&
        typeof entry['unit'] === 'string' &&
        typeof entry['source_locator'] === 'string' &&
        typeof entry['source_kind'] === 'string' &&
        typeof entry['original_sha256'] === 'string' &&
        sha256Pattern.test(entry['original_sha256']) &&
        typeof entry['size'] === 'number' &&
        typeof entry['file_mtime_ms'] === 'number',
    )
  ) {
    throw new Error(`invalid source baseline: ${path}`);
  }
  return parsed as SourceBaseline;
};

const recoveryUsage = `Usage:
  pnpm nx run scripts:cursor-history-recovery -- baseline --root NAME=PATH --unit UNIT=NAME://PATH --output PATH [--extracted-at ISO]
  pnpm nx run scripts:cursor-history-recovery -- enrich-baseline --root NAME=PATH --baseline PATH --output PATH [--unit UNIT=NAME://PATH]
  pnpm nx run scripts:cursor-history-recovery -- extract --root NAME=PATH --baseline PATH --output PATH
  pnpm nx run scripts:cursor-history-recovery -- extract-fts --database PATH --fts-unit UNIT=RECORD_ID [...] --output-dir PATH
  pnpm nx run scripts:cursor-history-recovery -- extract-jsonl --jsonl-unit UNIT=PATH [...] --output-dir PATH
  pnpm nx run scripts:cursor-history-recovery -- archive-legacy-plans --database PATH --output PATH
  pnpm nx run scripts:cursor-history-recovery -- retain-safe-file --source PATH --output PATH
  pnpm nx run scripts:cursor-history-recovery -- inventory-ragnar --source-root PATH --alias-file PATH [...] --retained-fixture PATH --output PATH
  pnpm nx run scripts:cursor-history-recovery -- snapshot-databases --state-database PATH --conversation-database PATH --output PATH [--extracted-at ISO]
  pnpm nx run scripts:cursor-history-recovery -- assemble-themes --results-dir PATH --staging-dir PATH --state-database PATH --tau-transcripts-root PATH --assimp-transcripts-root PATH --seed-index PATH --downloads-root PATH --output PATH
  pnpm nx run scripts:cursor-history-recovery -- assemble-manifest --history-root PATH --research-root PATH --staging-dir PATH --baseline PATH --database-baseline PATH --manifest PATH --output PATH
  pnpm nx run scripts:cursor-history-recovery -- archive-plans --history-root PATH --history-unit DIRECTORY [...] --backups-root PATH --archive-root PATH --manifest PATH
  pnpm nx run scripts:cursor-history-recovery -- verify [--root NAME=PATH --baseline PATH] [--output-root PATH]
`;

export const runCursorHistoryRecovery = (argv: readonly string[]): number => {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      root: { type: 'string', multiple: true },
      unit: { type: 'string', multiple: true },
      output: { type: 'string' },
      source: { type: 'string' },
      'source-root': { type: 'string' },
      'alias-file': { type: 'string', multiple: true },
      'retained-fixture': { type: 'string' },
      database: { type: 'string' },
      'state-database': { type: 'string' },
      'conversation-database': { type: 'string' },
      'database-baseline': { type: 'string' },
      'research-root': { type: 'string' },
      'repository-visibility': { type: 'string' },
      'results-dir': { type: 'string' },
      'staging-dir': { type: 'string' },
      'tau-transcripts-root': { type: 'string' },
      'assimp-transcripts-root': { type: 'string' },
      'seed-index': { type: 'string' },
      'downloads-root': { type: 'string' },
      'fts-unit': { type: 'string', multiple: true },
      'jsonl-unit': { type: 'string', multiple: true },
      'output-dir': { type: 'string' },
      baseline: { type: 'string' },
      'output-root': { type: 'string' },
      'extracted-at': { type: 'string' },
      'history-root': { type: 'string' },
      'history-unit': { type: 'string', multiple: true },
      'backups-root': { type: 'string' },
      'archive-root': { type: 'string' },
      manifest: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(recoveryUsage);
    return 0;
  }
  if (positionals.length !== 1) {
    console.log(recoveryUsage);
    return 1;
  }

  const mode = positionals[0];
  const roots = parseAssignments(values.root, '--root');
  if (mode === 'baseline') {
    if (!values.output) {
      throw new Error('baseline requires --output');
    }
    const units = Object.entries(parseAssignments(values.unit, '--unit')).map(([unit, source_locator]) => ({
      unit,
      source_locator,
      source_kind: source_locator.slice(0, source_locator.indexOf('://')),
    }));
    if (units.length === 0) {
      throw new Error('baseline requires at least one --unit');
    }
    const baseline = createSourceBaseline({
      units,
      roots,
      extractedAt: values['extracted-at'] ?? new Date().toISOString(),
    });
    atomicWriteClean(resolve(values.output), canonicalJson(baseline));
    console.log(`Wrote ${baseline.entries.length} baseline entries.`);
    return 0;
  }

  if (mode === 'enrich-baseline') {
    if (!values.baseline || !values.output) {
      throw new Error('enrich-baseline requires --baseline and --output');
    }
    const parsed: unknown = JSON.parse(readFileSync(resolve(values.baseline), 'utf8'));
    if (
      !isRecord(parsed) ||
      parsed['schema_version'] !== 1 ||
      typeof parsed['extracted_at'] !== 'string' ||
      !Array.isArray(parsed['entries'])
    ) {
      throw new Error(`invalid source baseline: ${values.baseline}`);
    }
    const units = parsed['entries'].map((entry): SourceUnit => {
      if (
        !isRecord(entry) ||
        typeof entry['unit'] !== 'string' ||
        typeof entry['source_locator'] !== 'string' ||
        typeof entry['source_kind'] !== 'string' ||
        typeof entry['original_sha256'] !== 'string' ||
        typeof entry['size'] !== 'number'
      ) {
        throw new Error(`invalid source baseline entry: ${values.baseline}`);
      }
      const sourcePath = resolveSymbolicLocator(entry['source_locator'], roots);
      const stats = statSync(sourcePath);
      if (!stats.isFile() || stats.size !== entry['size'] || sha256File(sourcePath) !== entry['original_sha256']) {
        throw new Error(`source baseline drifted before mtime enrichment: ${entry['unit']}`);
      }
      return {
        unit: entry['unit'],
        source_locator: entry['source_locator'],
        source_kind: entry['source_kind'],
      };
    });
    const additionalUnits = Object.entries(parseAssignments(values.unit, '--unit')).map(
      ([unit, source_locator]): SourceUnit => ({
        unit,
        source_locator,
        source_kind: source_locator.slice(0, source_locator.indexOf('://')),
      }),
    );
    const baseline = createSourceBaseline({
      units: [...units, ...additionalUnits],
      roots,
      extractedAt: parsed['extracted_at'],
    });
    atomicWriteClean(resolve(values.output), canonicalJson(baseline));
    console.log(`Enriched ${baseline.entries.length} baseline entries with file mtimes.`);
    return 0;
  }

  if (mode === 'extract') {
    if (!values.baseline || !values.output) {
      throw new Error('extract requires --baseline and --output');
    }
    const baseline = readBaseline(resolve(values.baseline));
    const drift = verifySourceBaseline(baseline, roots);
    if (drift.length > 0) {
      throw new Error(
        `source baseline drifted:\n${drift.map((item) => `  - ${item.unit}: ${item.message}`).join('\n')}`,
      );
    }
    const extraction = {
      schema_version: 1,
      baseline_sha256: sha256(canonicalJson(baseline)),
      extracted_at: baseline.extracted_at,
      entries: baseline.entries,
    };
    atomicWriteClean(resolve(values.output), canonicalJson(extraction));
    console.log(`Extracted ${baseline.entries.length} hash-addressed metadata entries.`);
    return 0;
  }

  if (mode === 'extract-fts') {
    if (!values.database || !values['output-dir']) {
      throw new Error('extract-fts requires --database and --output-dir');
    }
    const units = Object.entries(parseAssignments(values['fts-unit'], '--fts-unit')).map(([unit, id]) => ({
      unit,
      id,
    }));
    if (units.length === 0) {
      throw new Error('extract-fts requires at least one --fts-unit');
    }
    const records = writeConversationSearchClassificationUnits({
      databasePath: resolve(values.database),
      units,
      outputDirectory: resolve(values['output-dir']),
    });
    console.log(`Extracted ${records.length} sanitized conversation-search classification units.`);
    return 0;
  }

  if (mode === 'extract-jsonl') {
    if (!values['output-dir']) {
      throw new Error('extract-jsonl requires --output-dir');
    }
    const units = Object.entries(parseAssignments(values['jsonl-unit'], '--jsonl-unit')).map(([unit, path]) => ({
      unit,
      path,
    }));
    if (units.length === 0) {
      throw new Error('extract-jsonl requires at least one --jsonl-unit');
    }
    const records = writeJsonlClassificationUnits({ units, outputDirectory: values['output-dir'] });
    console.log(`Extracted ${records.length} sanitized JSONL classification units.`);
    return 0;
  }

  if (mode === 'archive-legacy-plans') {
    if (!values.database || !values.output) {
      throw new Error('archive-legacy-plans requires --database and --output');
    }
    const plans = readLegacyAuthoredPlans(values.database);
    atomicWriteClean(
      resolve(values.output),
      canonicalJson({
        schema_version: 1,
        created: '2026-07-22',
        updated: '2026-07-22',
        source_kind: 'cursor-composer-header-authored-plan',
        source_locator: 'cursor-db://composer.composerHeaders',
        summary_only: true,
        count: plans.length,
        plans,
      }),
    );
    console.log(`Archived ${plans.length} legacy authored-plan summaries.`);
    return 0;
  }

  if (mode === 'retain-safe-file') {
    if (!values.source || !values.output) {
      throw new Error('retain-safe-file requires --source and --output');
    }
    const content = readFileSync(resolve(values.source), 'utf8');
    atomicWriteClean(resolve(values.output), content);
    console.log(`Retained safe file ${sha256(content)}.`);
    return 0;
  }

  if (mode === 'inventory-ragnar') {
    if (!values['source-root'] || !values['alias-file']?.length || !values['retained-fixture'] || !values.output) {
      throw new Error('inventory-ragnar requires --source-root, --alias-file, --retained-fixture, and --output');
    }
    const inventory = createRagnarEvidenceInventory({
      sourceRoot: values['source-root'],
      aliasFiles: values['alias-file'],
      retainedFixturePath: values['retained-fixture'],
    });
    atomicWriteClean(resolve(values.output), canonicalJson(inventory));
    console.log('Wrote the Ragnar evidence inventory.');
    return 0;
  }

  if (mode === 'snapshot-databases') {
    if (!values['state-database'] || !values['conversation-database'] || !values.output) {
      throw new Error('snapshot-databases requires --state-database, --conversation-database, and --output');
    }
    const baseline = createCursorLogicalBaseline({
      stateDatabasePath: values['state-database'],
      conversationDatabasePath: values['conversation-database'],
      extractedAt: values['extracted-at'] ?? new Date().toISOString(),
    });
    atomicWriteClean(resolve(values.output), canonicalJson(baseline));
    console.log('Wrote a transactionally consistent logical database baseline.');
    return 0;
  }

  if (mode === 'assemble-themes') {
    if (
      !values['results-dir'] ||
      !values['staging-dir'] ||
      !values['state-database'] ||
      !values['tau-transcripts-root'] ||
      !values['assimp-transcripts-root'] ||
      !values['seed-index'] ||
      !values['downloads-root'] ||
      !values.output
    ) {
      throw new Error(
        'assemble-themes requires --results-dir, --staging-dir, --state-database, --tau-transcripts-root, --assimp-transcripts-root, --seed-index, --downloads-root, and --output',
      );
    }
    const rows = assembleThemeLedger({
      resultsDirectory: values['results-dir'],
      stagingDirectory: values['staging-dir'],
      stateDatabasePath: values['state-database'],
      tauTranscriptsRoot: values['tau-transcripts-root'],
      assimpTranscriptsRoot: values['assimp-transcripts-root'],
      seedIndexPath: values['seed-index'],
      downloadsRoot: values['downloads-root'],
    });
    atomicWriteClean(resolve(values.output), canonicalJsonl(rows));
    console.log(`Wrote ${rows.length} zero-unresolved theme records.`);
    return 0;
  }

  if (mode === 'assemble-manifest') {
    if (
      !values['history-root'] ||
      !values['research-root'] ||
      !values['staging-dir'] ||
      !values.baseline ||
      !values['database-baseline'] ||
      !values.manifest ||
      !values.output
    ) {
      throw new Error(
        'assemble-manifest requires --history-root, --research-root, --staging-dir, --baseline, --database-baseline, --manifest, and --output',
      );
    }
    const manifest = assembleRecoveryManifest({
      historyRoot: values['history-root'],
      researchRoot: values['research-root'],
      stagingDirectory: values['staging-dir'],
      sourceBaselinePath: values.baseline,
      databaseBaselinePath: values['database-baseline'],
      planManifestPath: values.manifest,
      repositoryVisibility: values['repository-visibility'] ?? 'PRIVATE',
    });
    atomicWriteClean(resolve(values.output), canonicalJson(manifest));
    console.log('Wrote the Cursor-era recovery manifest.');
    return 0;
  }

  if (mode === 'archive-plans') {
    if (
      !values['history-root'] ||
      !values['history-unit']?.length ||
      !values['backups-root'] ||
      !values['archive-root'] ||
      !values.manifest
    ) {
      throw new Error(
        'archive-plans requires --history-root, at least one --history-unit, --backups-root, --archive-root, and --manifest',
      );
    }
    const result = recoverPlanArchive({
      historyRoot: resolve(values['history-root']),
      backupsRoot: resolve(values['backups-root']),
      archiveRoot: resolve(values['archive-root']),
      manifestPath: resolve(values.manifest),
      historyDirectories: new Set(values['history-unit']),
    });
    console.log(`Archived ${result.historyPlans} Local History and ${result.backupPlans} Backup plans.`);
    return 0;
  }

  if (mode === 'verify') {
    const diagnostics: string[] = [];
    if (values.baseline) {
      diagnostics.push(
        ...verifySourceBaseline(readBaseline(resolve(values.baseline)), roots).map(
          (item) => `${item.unit}: ${item.message}`,
        ),
      );
    }
    if (values['output-root']) {
      const outputRoot = resolve(values['output-root']);
      if (existsSync(outputRoot)) {
        diagnostics.push(
          ...validateCommittedOutputs({ root: outputRoot, requireComplete: true }).map(
            (item) => `${item.path}: ${item.message}`,
          ),
        );
      } else {
        console.log('Skipping private Cursor-history validation because the tau-brain output root is absent.');
      }
    }
    if (!values.baseline && !values['output-root']) {
      throw new Error('verify requires --baseline or --output-root');
    }
    if (diagnostics.length > 0) {
      console.error(diagnostics.join('\n'));
      return 1;
    }
    console.log('Cursor history verification passed.');
    return 0;
  }

  throw new Error(`unknown mode: ${mode}\n${recoveryUsage}`);
};

const isDirectRun = (): boolean =>
  process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;

if (isDirectRun()) {
  try {
    process.exit(runCursorHistoryRecovery(process.argv.slice(2)));
  } catch (error) {
    console.error('cursor history recovery failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export const cursorHistoryRoot = resolve(repoRoot, 'docs/research/cursor-history');
