/* oxlint-disable no-await-in-loop -- Physical files, bounded chunks, and canonical rows are deliberately processed in order without retaining concurrent decoded histories. */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
/* eslint-disable @nx/enforce-module-boundaries -- Selected harness-only incremental proof uses the existing internal reducer without a new public export or copied semantics. */
// oxlint-disable-next-line no-restricted-imports -- Principal-selected harness-only use of the canonical incremental reducer; no production API is added.
import { createEventLogReducer } from '../../../../packages/agent-host/src/log/reducer.ts';
/* eslint-enable @nx/enforce-module-boundaries -- Restore normal boundaries after the selected harness-only imports. */
import type { AgentLogEvent } from '@taucad/agent-host';
import { parseEventLog, parseLogEvent, foldChatLedger, emptyChatLedger, reduceEventLog } from '@taucad/agent-host';
/* oxlint-disable no-restricted-imports -- Node fixture validation shares the exact binary closure decoder and row iterator used by its importer. */
import {
  decodeProjectionFile,
  iterateProjectionHistory,
  validateProjectionClosure,
} from './filesystem-projection-writer.ts';
/* oxlint-enable no-restricted-imports */
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

/** Small receipt for the same raw rooted files consumed by browser and native fixtures. */
export type ProjectionDirectoryReceipt = {
  readonly version: 1;
  readonly chatId: string;
  readonly turns: number;
  readonly seedSha256: string;
  readonly toolProof?: {
    readonly messages: number;
    readonly rows: number;
    readonly finalized: number;
    readonly replacements: number;
    readonly outputsSha256: string;
  };
  readonly project: ProjectionClosure['project'];
  readonly directories: readonly string[];
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly byteLength: number;
    readonly sha256: string;
    readonly chunkSha256: readonly string[];
  }>;
};

const rootedFixturePath = (root: string, path: string): string => {
  if (
    path.includes('\\') ||
    /^[a-z]:/iu.test(path) ||
    path.startsWith('/') ||
    path.split('/').some((part) => part === '' || part === '.' || part === '..' || part.endsWith('.lock'))
  ) {
    throw new Error('Invalid rooted directory fixture path.');
  }
  const destination = resolve(root, path);
  if (!destination.startsWith(`${resolve(root)}${sep}`)) {
    throw new Error('Directory fixture path escaped its root.');
  }
  return destination;
};

const hashDirectoryFile = async (root: string, path: string): Promise<ProjectionDirectoryReceipt['files'][number]> => {
  const destination = rootedFixturePath(root, path);
  const canonicalRoot = await realpath(root);
  const canonicalDestination = await realpath(destination);
  if (!canonicalDestination.startsWith(`${canonicalRoot}${sep}`)) {
    throw new Error('Directory fixture link escaped its root.');
  }
  const file = await open(destination, 'r');
  try {
    const hash = createHash('sha256');
    const chunkSha256: string[] = [];
    let byteLength = 0;
    const bytes = Buffer.alloc(65_536);
    for (;;) {
      const { bytesRead } = await file.read(bytes, 0, bytes.length, byteLength);
      if (bytesRead === 0) {
        break;
      }
      const chunk = bytes.subarray(0, bytesRead);
      hash.update(chunk);
      chunkSha256.push(createHash('sha256').update(chunk).digest('hex'));
      byteLength += bytesRead;
    }
    return { path, byteLength, sha256: hash.digest('hex'), chunkSha256 };
  } finally {
    await file.close();
  }
};

/** Produce raw canonical rows directly on disk; only one rewritten row is serialized at a time. */
export const generateProjectionDirectory = async (options: {
  seedPath: string;
  seedSha256: string;
  turns: number;
  destination: string;
}): Promise<ProjectionDirectoryReceipt> => {
  const { seedPath, seedSha256, turns, destination } = options;
  const seed = await readFile(seedPath);
  if (createHash('sha256').update(seed).digest('hex') !== seedSha256) {
    throw new Error('Authentic tool seed SHA mismatch.');
  }
  const closure = JSON.parse(seed.toString('utf8')) as ProjectionClosure;
  await validateProjectionClosure(closure);
  const histories = closure.files.filter((file) => /^\.tau\/chats\/[^/]+\/events\.jsonl$/u.test(file.path));
  if (histories.length !== 1) {
    throw new Error('Directory producer requires one authentic chat history.');
  }
  const history = histories[0]!;
  const template = new TextDecoder('utf-8', { fatal: true }).decode(decodeProjectionFile(history));
  const sourceRows = parseEventLog(template);
  const sourceMessages = reduceEventLog(sourceRows);
  const sourceInputs = sourceMessages.filter((message) => message.role === 'tool-input');
  const sourceOutputs = sourceMessages.filter((message) => message.role === 'tool-output');
  if (
    sourceMessages.length !== 8 ||
    JSON.stringify(sourceInputs.map((message) => message.toolName)) !== JSON.stringify(['create_file', 'read_file']) ||
    sourceOutputs.length !== 2
  ) {
    throw new Error('Authentic tool seed does not contain the selected create/read pair.');
  }
  const outputsHash = createHash('sha256');
  for (let turn = 0; turn < turns; turn += 1) {
    for (const message of sourceOutputs) {
      outputsHash.update(JSON.stringify(message.content) + '\n');
    }
  }
  // Exclusive fresh directory prevents partial output from being mistaken for a previously proved fixture.
  await mkdir(destination);
  const root = resolve(destination, 'rooted-project');
  await mkdir(root);
  for (const directory of closure.directories) {
    await mkdir(rootedFixturePath(root, directory), { recursive: true });
  }
  const files: Array<ProjectionDirectoryReceipt['files'][number]> = [];
  for (const file of [...closure.files].sort((left, right) => left.path.localeCompare(right.path))) {
    const path = rootedFixturePath(root, file.path);
    await mkdir(dirname(path), { recursive: true });
    if (file === history) {
      const output = await open(path, 'wx');
      try {
        for (const row of iterateProjectionHistory(template, turns)) {
          await output.writeFile(JSON.stringify(row) + '\n');
        }
      } finally {
        await output.close();
      }
    } else {
      await writeFile(path, decodeProjectionFile(file), { flag: 'wx' });
    }
    const actual = await hashDirectoryFile(root, file.path);
    if (file !== history && (actual.sha256 !== file.sha256 || actual.byteLength !== file.byteLength)) {
      throw new Error('Generated closure changed an authentic non-history file.');
    }
    files.push(actual);
  }
  const receipt: ProjectionDirectoryReceipt = {
    toolProof: {
      messages: sourceMessages.length * turns,
      rows: sourceRows.length * turns,
      finalized: sourceRows.filter((row) => row.type === 'turn.finalized').length * turns,
      replacements: sourceRows.filter((row) => row.type === 'message.envelope-replaced').length * turns,
      outputsSha256: outputsHash.digest('hex'),
    },
    version: 1,
    chatId: history.path.split('/')[2]!,
    turns,
    seedSha256,
    project: closure.project,
    directories: closure.directories,
    files,
  };
  await writeFile(resolve(destination, 'receipt.json'), JSON.stringify(receipt), { flag: 'wx' });
  return receipt;
};

const directoryHistoryLines = async function* (path: string): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const stream = createReadStream(path, { highWaterMark: 65_536 });
  let pending = '';
  for await (const chunk of stream) {
    if (!(chunk instanceof Uint8Array)) {
      throw new Error('Expected binary directory history chunk.');
    }
    pending += decoder.decode(chunk, { stream: true });
    let newline = pending.indexOf('\n');
    while (newline !== -1) {
      yield pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      newline = pending.indexOf('\n');
    }
  }
  pending += decoder.decode();
  if (pending.length > 0) {
    throw new Error('Canonical directory history must end with a newline.');
  }
};

const directoryEntries = async (root: string, prefix = ''): Promise<string[]> => {
  const result: string[] = [];
  for (const entry of await readdir(prefix ? rootedFixturePath(root, prefix) : root, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    rootedFixturePath(root, path);
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      throw new Error('Directory fixture contains a non-regular physical entry.');
    }
    result.push(path);
    if (entry.isDirectory()) {
      result.push(...(await directoryEntries(root, path)));
    }
  }
  return result;
};

/** Reopen and independently qualify exact raw bytes without joining a whole history or closure. */
export const validateProjectionDirectory = async (
  directory: string,
  expected: { fixtureSha256: string; historySha256: string; turns: number },
): Promise<ProjectionFixtureProof> => {
  const receiptBytes = await readFile(resolve(directory, 'receipt.json'));
  if (createHash('sha256').update(receiptBytes).digest('hex') !== expected.fixtureSha256) {
    throw new Error('Immutable directory receipt SHA mismatch.');
  }
  const receipt = JSON.parse(receiptBytes.toString('utf8')) as ProjectionDirectoryReceipt;
  const receiptVersion: unknown = Reflect.get(receipt, 'version');
  if (
    receiptVersion !== 1 ||
    receipt.turns !== expected.turns ||
    !Number.isSafeInteger(receipt.turns) ||
    receipt.turns < 1
  ) {
    throw new Error('Invalid directory fixture version or turn count.');
  }
  const root = resolve(directory, 'rooted-project');
  const paths = new Set<string>();
  for (const path of [...receipt.directories, ...receipt.files.map((file) => file.path)]) {
    rootedFixturePath(root, path);
    if (paths.has(path.toLocaleLowerCase('en-US'))) {
      throw new Error('Duplicate directory fixture path.');
    }
    paths.add(path.toLocaleLowerCase('en-US'));
  }
  const physicalPaths = await directoryEntries(root);
  if (
    JSON.stringify(physicalPaths.sort()) !==
    JSON.stringify([...receipt.directories, ...receipt.files.map((file) => file.path)].sort())
  ) {
    throw new Error('Directory fixture physical closure differs from receipt.');
  }
  for (const file of receipt.files) {
    const actual = await hashDirectoryFile(root, file.path);
    if (
      actual.byteLength !== file.byteLength ||
      actual.sha256 !== file.sha256 ||
      JSON.stringify(actual.chunkSha256) !== JSON.stringify(file.chunkSha256)
    ) {
      throw new Error('Immutable directory file or ordered chunk proof mismatch.');
    }
  }
  const manifestFile = receipt.files.find((file) => file.path === 'tau.json');
  if (
    !manifestFile ||
    manifestFile.byteLength > 1_048_576 ||
    (JSON.parse(await readFile(rootedFixturePath(root, 'tau.json'), 'utf8')) as { id?: string }).id !==
      receipt.project.projectId
  ) {
    throw new Error('Raw closure manifest identity does not match its rooted authority.');
  }
  const historyPath = `.tau/chats/${receipt.chatId}/events.jsonl`;
  const history = receipt.files.find((file) => file.path === historyPath);
  if (!history || history.sha256 !== expected.historySha256) {
    throw new Error('Immutable directory history identity mismatch.');
  }
  const reducer = createEventLogReducer();
  let ledger = emptyChatLedger;
  let rowCount = 0;
  let finalized = 0;
  let replacements = 0;
  let batchBytes = 0;
  let batch: AgentLogEvent[] = [];
  const flush = () => {
    ledger = foldChatLedger(ledger, batch);
    batch = [];
    batchBytes = 0;
  };
  const sequences = new Map<string, number>();
  const lines = directoryHistoryLines(rootedFixturePath(root, historyPath));
  for await (const line of lines) {
    const row = parseLogEvent(JSON.parse(line));
    if (row.sequence !== (sequences.get(row.leaderEpoch) ?? -1) + 1) {
      throw new Error('Invalid canonical directory fixture sequence.');
    }
    sequences.set(row.leaderEpoch, row.sequence);
    const transition = reducer.prepare(row);
    if (transition.duplicate) {
      throw new Error('Duplicate canonical directory fixture row.');
    }
    transition.commit();
    const rowBytes = Buffer.byteLength(line, 'utf8') + 1;
    if (batch.length > 0 && (batch.length >= 128 || batchBytes + rowBytes > 1_048_576)) {
      flush();
    }
    batch.push(row);
    batchBytes += rowBytes;
    rowCount += 1;
    finalized += Number(row.type === 'turn.finalized');
    replacements += Number(row.type === 'message.envelope-replaced');
  }
  flush();
  if (receipt.toolProof) {
    const messages = reducer.messages();
    const inputs = messages.filter((message) => message.role === 'tool-input');
    const outputs = messages.filter((message) => message.role === 'tool-output');
    const outputsHash = createHash('sha256');
    for (const message of outputs) {
      outputsHash.update(JSON.stringify(message.content) + '\n');
    }
    if (
      messages.length !== receipt.toolProof.messages ||
      new Set(messages.map((message) => message.id)).size !== messages.length ||
      rowCount !== receipt.toolProof.rows ||
      finalized !== receipt.toolProof.finalized ||
      replacements !== receipt.toolProof.replacements ||
      outputsHash.digest('hex') !== receipt.toolProof.outputsSha256 ||
      inputs.length !== 2 * receipt.turns ||
      outputs.length !== inputs.length ||
      new Set(inputs.map((message) => message.toolCallId)).size !== inputs.length ||
      inputs.some(
        (message, index) =>
          message.toolName !== (index % 2 === 0 ? 'create_file' : 'read_file') ||
          message.toolCallId !== outputs[index]?.toolCallId,
      )
    ) {
      throw new Error('Streamed authentic tool ordering, identity, or unchanged output proof failed.');
    }
  }
  const turnCount = Object.keys(ledger.runs).length;
  if (
    !reducer.historyIntact() ||
    !ledger.historyIntact ||
    ledger.anomalies.length > 0 ||
    turnCount !== expected.turns
  ) {
    throw new Error('Invalid canonical directory fixture ledger.');
  }
  return {
    fixtureSha256: expected.fixtureSha256,
    fixtureByteLength: receiptBytes.byteLength,
    chatId: receipt.chatId,
    historyPath,
    historySha256: history.sha256,
    historyByteLength: history.byteLength,
    rowCount,
    turnCount,
    historyIntact: true,
    anomalyCount: 0,
    manifest: {
      version: 2,
      project: receipt.project,
      directories: [...receipt.directories],
      files: receipt.files.map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 })),
    },
  };
};
