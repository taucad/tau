import { editFileInputSchema, getToolInputSchema, type RpcClientErrorCode } from '@taucad/chat';
import {
  applyClientTextMutation,
  createExactReplacementPlan,
  decodeClientText,
  handleEditFile,
  type RpcFileSystem,
  type RpcFileStat,
} from '@taucad/chat/rpc';
import ts from 'typescript';
import type { BenchmarkErrorCode, ReplayEmission, ReplayFixture } from './replay-fixture.schema.js';

type ReplayErrorCode = RpcClientErrorCode | BenchmarkErrorCode;
type ReplayOutcome =
  | Readonly<{ kind: 'success'; staleRecovered: boolean }>
  | Readonly<{ kind: 'error'; errorCode: ReplayErrorCode }>;

export type ReplayResult = Readonly<{
  id: string;
  case: ReplayFixture['case'];
  emissionCount: number;
  outcome: ReplayOutcome;
}>;

const cloneBytes = (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => new Uint8Array(bytes);
const bytesEqual = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

const fixtureFailure = (fixture: ReplayFixture, message: string): never => {
  throw new Error(`[${fixture.id}] ${message}`);
};

const missingFileError = (path: string): Error & { code: string } =>
  Object.assign(new Error(`ENOENT: no such file, ${path}`), { code: 'ENOENT' });

const throwClientError = (errorCode: RpcClientErrorCode, message: string): never => {
  throw Object.assign(new Error(message), { code: errorCode });
};

/** Deterministic planner/retry replay seam; this Map is not a production filesystem authority. */
const createReplayFileSystem = (
  files: Map<string, Uint8Array<ArrayBuffer>>,
  conflicts: readonly Uint8Array<ArrayBuffer>[],
): RpcFileSystem => {
  const pendingConflicts = conflicts.map(cloneBytes);
  const readBytes = (path: string): Uint8Array<ArrayBuffer> => {
    const bytes = files.get(path);
    if (!bytes) {
      throw missingFileError(path);
    }
    return cloneBytes(bytes);
  };
  const readText = (path: string): string => {
    const decoded = decodeClientText(readBytes(path));
    if (!decoded.ok) {
      return throwClientError(decoded.errorCode, decoded.message);
    }
    return decoded.snapshot.content;
  };
  const stat = async (path: string): Promise<RpcFileStat> => {
    const bytes = readBytes(path);
    const content = readText(path);
    return {
      size: bytes.byteLength,
      isDirectory: false,
      createdAt: '1970-01-01T00:00:00.000Z',
      modifiedAt: '1970-01-01T00:00:00.000Z',
      contentKind: 'text',
      lineCount: content.split('\n').length,
    };
  };

  return {
    async readFile(path) {
      return readText(path);
    },
    async writeFile(path, content) {
      files.set(path, new TextEncoder().encode(content));
    },
    async writeBinaryFile(path, data) {
      files.set(path, cloneBytes(data));
    },
    async deleteFile(path) {
      if (!files.delete(path)) {
        throw missingFileError(path);
      }
    },
    async readdir() {
      return [];
    },
    async exists(path) {
      return files.has(path);
    },
    async appendFile(path, content) {
      files.set(path, new TextEncoder().encode(`${files.has(path) ? readText(path) : ''}${content}`));
    },
    async editFile(path, oldString, newString, replaceAll) {
      const result = await applyClientTextMutation({
        targetFile: path,
        fileSystem: {
          stat,
          readFileBytes: async (target) => readBytes(target),
          writeFileIfUnchanged: async (target, expected, replacement) => {
            // Replay recorded conflict outcomes deterministically; async authority serialization is gated in rpc-handlers.test.ts.
            const injected = pendingConflicts.shift();
            if (injected) {
              files.set(target, cloneBytes(injected));
              return { status: 'conflict', currentBytes: cloneBytes(injected) };
            }
            const current = readBytes(target);
            if (!bytesEqual(current, expected)) {
              return { status: 'conflict', currentBytes: current };
            }
            files.set(target, cloneBytes(replacement));
            return { status: 'committed', committedBytes: readBytes(target) };
          },
        },
        plan: createExactReplacementPlan({ oldString, newString, replaceAll }),
      });
      if (!result.ok) {
        return throwClientError(result.errorCode, result.message);
      }
      return {
        occurrences: result.occurrences,
        ...(result.staleRecovered ? { staleRecovered: true } : {}),
        diffStats: result.diffStats,
      };
    },
    stat,
  };
};

const parseArguments = (emission: ReplayEmission): Readonly<{ ok: true; value: unknown }> | Readonly<{ ok: false }> => {
  try {
    const value: unknown = JSON.parse(emission.argumentsJson);
    const schema = getToolInputSchema(`tool-${emission.toolName}`);
    if (!schema?.safeParse(value).success) {
      return { ok: false };
    }
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
};

const hasTypeScriptParseError = (fileName: string, source: string): boolean => {
  const result = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
  });
  return (result.diagnostics ?? []).some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
};

const assertFiles = (fixture: ReplayFixture, actual: ReadonlyMap<string, Uint8Array<ArrayBuffer>>): void => {
  const expected = new Map(fixture.expected.files.map((file) => [file.path, file.bytes]));
  const actualPaths = [...actual.keys()].sort();
  const expectedPaths = [...expected.keys()].sort();
  if (actualPaths.join('\0') !== expectedPaths.join('\0')) {
    fixtureFailure(
      fixture,
      `file-set drift: expected ${expectedPaths.join(', ')}, received ${actualPaths.join(', ')}.`,
    );
  }
  for (const path of expectedPaths) {
    const actualBytes = actual.get(path);
    const expectedBytes = expected.get(path);
    if (!actualBytes || !expectedBytes || !bytesEqual(actualBytes, expectedBytes)) {
      fixtureFailure(fixture, `byte drift in ${path}.`);
    }
  }
};

const assertOutcome = (fixture: ReplayFixture, actual: ReplayOutcome): void => {
  if (fixture.expected.kind !== actual.kind) {
    fixtureFailure(fixture, `expected ${fixture.expected.kind}, received ${actual.kind}.`);
  }
  if (fixture.expected.kind === 'error') {
    if (actual.kind !== 'error' || actual.errorCode !== fixture.expected.errorCode) {
      fixtureFailure(
        fixture,
        `expected ${fixture.expected.errorCode}, received ${actual.kind === 'error' ? actual.errorCode : 'success'}.`,
      );
    }
    return;
  }
  if (
    actual.kind !== 'success' ||
    (fixture.expected.staleRecovered !== undefined && fixture.expected.staleRecovered !== actual.staleRecovered)
  ) {
    fixtureFailure(fixture, `stale-recovery outcome drifted.`);
  }
};

/** Replay one fixture through the production handler plus planner/retry implementation. */
export const replayEditFixture = async (fixture: ReplayFixture): Promise<ReplayResult> => {
  const files = new Map(fixture.initial.files.map((file) => [file.path, cloneBytes(file.bytes)]));
  let outcome: ReplayOutcome = { kind: 'success', staleRecovered: false };

  for (const emission of fixture.emissions) {
    const parsed = parseArguments(emission);
    if (!parsed.ok) {
      outcome = { kind: 'error', errorCode: 'SCHEMA_INVALID' };
      break;
    }
    if (emission.toolName !== 'edit_file') {
      outcome = { kind: 'error', errorCode: 'WRONG_TOOL_SELECTION' };
      break;
    }
    const editInput = editFileInputSchema.safeParse(parsed.value);
    if (!editInput.success) {
      outcome = { kind: 'error', errorCode: 'SCHEMA_INVALID' };
      break;
    }
    if (editInput.data.targetFile !== fixture.targetFile) {
      outcome = { kind: 'error', errorCode: 'WRONG_TARGET' };
      break;
    }

    const fileSystem = createReplayFileSystem(files, emission.casConflicts ?? []);
    const result = await handleEditFile(editInput.data, fileSystem);
    if (!result.success) {
      outcome = { kind: 'error', errorCode: result.errorCode };
      break;
    }
    outcome = {
      kind: 'success',
      staleRecovered: outcome.kind === 'success' && (outcome.staleRecovered || result.staleRecovered === true),
    };
  }

  if (outcome.kind === 'success' && fixture.grade?.kind === 'typescript-parse') {
    const target = files.get(fixture.targetFile);
    if (!target) {
      fixtureFailure(fixture, `grader target ${fixture.targetFile} is missing.`);
    }
    const source = new TextDecoder('utf-8', { fatal: true }).decode(target);
    if (hasTypeScriptParseError(fixture.targetFile, source)) {
      outcome = { kind: 'error', errorCode: 'WRONG_BUT_VALID' };
    }
  }

  assertFiles(fixture, files);
  assertOutcome(fixture, outcome);
  return { id: fixture.id, case: fixture.case, emissionCount: fixture.emissions.length, outcome };
};
