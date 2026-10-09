import { createHash } from 'node:crypto';
import { parseEventLog, foldChatLedger, emptyChatLedger } from '@taucad/agent-host';
// oxlint-disable-next-line no-restricted-imports -- Node fixture validation shares the exact binary closure decoder used by its importer.
import { decodeProjectionFile } from './filesystem-projection-writer.ts';
// oxlint-disable-next-line no-restricted-imports -- Fixture-only type shared with the existing rooted importer.
import type { ProjectionClosure } from './filesystem-projection-writer.ts';

export const projectionFixtureAnchors = {
  fixtureSha256: '0e8d1225a1ce8245caf388f86e1e560c2a171dc727d7aa68ae0536c9dea18baf',
  historySha256: '736702db5b3e6997aecd8a4c9307174cb6b6a5e5d094cbc2490924b78297381e',
  turns: 1000,
} as const;

/** Node-only fixture proof. No decoded history crosses the browser command boundary. */
export type ProjectionFixtureProof = {
  readonly fixtureSha256: string;
  readonly fixtureByteLength: number;
  readonly chatId: string;
  readonly historyPath: string;
  readonly historySha256: string;
  readonly historyByteLength: number;
  readonly rowCount: number;
  readonly turnCount: number;
  readonly historyIntact: boolean;
  readonly anomalyCount: number;
  readonly manifest: Pick<ProjectionClosure, 'version' | 'project' | 'directories'> & {
    readonly files: ReadonlyArray<{ readonly path: string; readonly byteLength: number; readonly sha256: string }>;
  };
};

export const validateProjectionFixtureBytes = (
  bytes: Uint8Array<ArrayBuffer>,
  expected: { fixtureSha256: string; historySha256: string; turns: number } = projectionFixtureAnchors,
): ProjectionFixtureProof => {
  const digest = (value: Uint8Array<ArrayBuffer>) => createHash('sha256').update(value).digest('hex');
  if (digest(bytes) !== expected.fixtureSha256) {
    throw new Error('Immutable fixture file SHA mismatch.');
  }
  const fixture = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as {
    closure: ProjectionClosure;
    chatId: string;
    turns: number;
  };
  const { closure, chatId } = fixture;
  const version: unknown = Reflect.get(closure, 'version');
  if (version !== 2 || fixture.turns !== expected.turns) {
    throw new Error('Invalid canonical fixture version or declared turn count.');
  }
  const paths = new Set<string>();
  for (const path of [...closure.directories, ...closure.files.map((file) => file.path)]) {
    if (
      path.startsWith('/') ||
      path.split('/').some((part) => part === '' || part === '.' || part === '..' || part.endsWith('.lock')) ||
      paths.has(path)
    ) {
      throw new Error('Invalid rooted canonical fixture path.');
    }
    paths.add(path);
  }
  const historyPath = `.tau/chats/${chatId}/events.jsonl`;
  const history = closure.files.find((file) => file.path === historyPath);
  if (!history || history.sha256 !== expected.historySha256) {
    throw new Error('Immutable history SHA identity mismatch.');
  }
  const historyBytes = decodeProjectionFile(history);
  if (digest(historyBytes) !== expected.historySha256) {
    throw new Error('Immutable history bytes mismatch.');
  }
  const rows = parseEventLog(new TextDecoder('utf-8', { fatal: true }).decode(historyBytes));
  const ledger = foldChatLedger(emptyChatLedger, rows);
  const sequences = new Map<string, number>();
  for (const row of rows) {
    const prior = sequences.get(row.leaderEpoch);
    if (row.sequence !== (prior === undefined ? 0 : prior + 1)) {
      throw new Error('Invalid canonical fixture sequence.');
    }
    sequences.set(row.leaderEpoch, row.sequence);
  }
  if (!ledger.historyIntact || ledger.anomalies.length > 0 || Object.keys(ledger.runs).length !== expected.turns) {
    throw new Error('Invalid canonical fixture ledger.');
  }
  for (const file of closure.files) {
    const actual = file === history ? historyBytes : decodeProjectionFile(file);
    if (digest(actual) !== file.sha256) {
      throw new Error('Immutable closure file bytes mismatch.');
    }
  }
  return {
    fixtureSha256: expected.fixtureSha256,
    fixtureByteLength: bytes.byteLength,
    chatId,
    historyPath,
    historySha256: expected.historySha256,
    historyByteLength: historyBytes.byteLength,
    rowCount: rows.length,
    turnCount: Object.keys(ledger.runs).length,
    historyIntact: ledger.historyIntact,
    anomalyCount: ledger.anomalies.length,
    manifest: {
      version: closure.version,
      project: closure.project,
      directories: closure.directories,
      files: closure.files.map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 })),
    },
  };
};
