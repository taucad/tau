import { EditorSaveConflictError } from '@taucad/fs-client/file-content-service';
import type {
  ContentChangeEvent,
  FileContentResult,
  FileContentService,
  OutcomeChangeEvent,
} from '@taucad/fs-client/file-content-service';
import { ImmutableRevisionTree, mergeRevisionTrees } from '@taucad/revisions/algorithms';
import type { EditorConflictInput, EditorConflictOutcome } from '@taucad/revisions/revision-effects';
import { requireParameterRecord, serializeParameterRecord } from '@taucad/parameters';
import { Topic } from '@taucad/events';
import { assertRootedPath } from '@taucad/utils/path';
import { URI } from 'vscode-uri';
import { decodeTextFile } from '@taucad/ui-core/utils/filesystem.utils';
import { EditorDocument } from '#lib/editor-document.js';
import type { DocumentChange, DocumentTransaction } from '#lib/editor-document.js';
import { EditorDiagnostics } from '#lib/editor-diagnostics.js';
import { isVirtualDeclarationPath } from '#lib/virtual-declarations.js';

const encoder = new TextEncoder();
const parameterCodec = { read: requireParameterRecord, serialize: serializeParameterRecord };
export const maxBackgroundDocuments = 10;
/**
 * How long typing waits before it is written (charter D17, EQ9): the first
 * unsaved edit starts the window and later ones join it, so at most this much
 * typing plus the write in flight is lost to a crash. Blur, close, tab switch
 * and a cut write it at once.
 */
export const editorSaveDebounceMilliseconds = 250;
/** Library declarations kept for reopening; held ones are never dropped. */
export const maxDeclarations = 16;

type SaveState = { path: string; completion: Promise<void>; settled: Promise<void> };
/** A save waiting out the debounce window; `settled` follows the save it becomes. */
type ScheduledSave = { timer: ReturnType<typeof setTimeout>; settled: PromiseWithResolvers<void> };
type PendingRebase = {
  // oxlint-disable-next-line typescript/no-restricted-types -- checked-write absence sentinel.
  base: Uint8Array<ArrayBuffer> | null;
  settled: PromiseWithResolvers<void>;
  recording?: boolean;
  /** The text of a document removed while its record was in flight: the record carries it still. */
  latest?: string;
  /** Its file was deleted mid-record: a document opened at the path since is another file's. */
  gone?: boolean;
};

const recordingProjects = new Map<string, number>();
const recordingChanges = new Topic<void>({ name: 'EditorDocumentSession.conflictRecords' });

export function isRecordingEditorConflict(projectId: string): boolean {
  return (recordingProjects.get(projectId) ?? 0) > 0;
}

export function subscribeEditorConflictRecords(listener: () => void): () => void {
  return recordingChanges.subscribe(listener);
}

/**
 * Settles once no conflict record of the project is in flight, records that
 * start while waiting included.
 *
 * @param projectId - The project.
 */
export async function editorConflictRecordsSettled(projectId: string): Promise<void> {
  if (!isRecordingEditorConflict(projectId)) {
    return;
  }
  const settled = Promise.withResolvers<void>();
  const unsubscribe = recordingChanges.subscribe(() => {
    if (!isRecordingEditorConflict(projectId)) {
      settled.resolve();
    }
  });
  try {
    await settled.promise;
  } finally {
    unsubscribe();
  }
}

export function refuseCloseWhileRecording(projectId: string): void {
  if (isRecordingEditorConflict(projectId)) {
    throw new Error('An edit that overlapped another change is still being recorded. Try again in a moment.');
  }
}

function holdEditorConflictRecord(projectId: string): () => void {
  recordingProjects.set(projectId, (recordingProjects.get(projectId) ?? 0) + 1);
  recordingChanges.emit();
  return () => {
    const remaining = (recordingProjects.get(projectId) ?? 1) - 1;
    if (remaining === 0) {
      recordingProjects.delete(projectId);
    } else {
      recordingProjects.set(projectId, remaining);
    }
    recordingChanges.emit();
  };
}

function sameBytes(left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function mergeOneFile({
  path,
  base,
  ours,
  theirs,
}: {
  path: string;
  // oxlint-disable-next-line typescript/no-restricted-types -- checked-write absence sentinel.
  base: Uint8Array<ArrayBuffer> | null;
  ours: Uint8Array<ArrayBuffer>;
  theirs: Uint8Array<ArrayBuffer>;
}): Uint8Array<ArrayBuffer> | undefined {
  // oxlint-disable-next-line typescript/no-restricted-types -- checked-write absence sentinel.
  const tree = (bytes: Uint8Array<ArrayBuffer> | null): ImmutableRevisionTree =>
    new ImmutableRevisionTree(bytes === null ? [] : [[path, bytes, '100644']]);
  const merged = mergeRevisionTrees(tree(base), tree(ours), tree(theirs), { parameters: parameterCodec });
  return merged.status === 'merged' ? merged.tree.get(path) : undefined;
}

export type EditorDocumentSessionConfig = Readonly<{
  contentService: FileContentService;
  projectId: string;
  recordEditorConflict?: (input: EditorConflictInput) => Promise<EditorConflictOutcome>;
}>;

/** Project-scoped bridge between versioned documents and the filesystem content authority. */
export class EditorDocumentSession {
  public readonly diagnostics = new EditorDiagnostics();
  readonly #contentService: FileContentService;
  readonly #recordEditorConflict: EditorDocumentSessionConfig['recordEditorConflict'];
  readonly #documents = new Map<string, EditorDocument>();
  readonly #holds = new Map<string, number>();
  readonly #background = new Map<string, number>();
  readonly #bases = new Map<string, Uint8Array<ArrayBuffer>>();
  readonly #saves = new Map<string, SaveState>();
  readonly #rebases = new Map<string, PendingRebase>();
  /** Each refusal this session answered, with the rebase that answers it. */
  readonly #answeredConflicts = new WeakMap<EditorSaveConflictError, PendingRebase>();
  readonly #scheduled = new Map<string, ScheduledSave>();
  /** Read-only library declaration text by path, most recently opened last. */
  readonly #declarations = new Map<string, string>();
  readonly #subscriptions: Array<() => void>;
  #projectId: string;
  #epoch = 0;
  #disposed = false;

  public constructor(config: EditorDocumentSessionConfig) {
    this.#contentService = config.contentService;
    this.#projectId = config.projectId;
    this.#recordEditorConflict = config.recordEditorConflict;
    this.#subscriptions = [
      config.contentService.onDidContentChange((event) => {
        this.applyContentChange(event);
      }),
      config.contentService.onDidChangeOutcome((event) => {
        this.applyOutcomeChange(event);
      }),
      /* A cut settles the content service's saves first; typing still in the window joins them. */
      config.contentService.addEditorSaveFlusher(() => {
        this.flushSaves();
      }),
    ];
  }

  public get(path: string): EditorDocument | undefined {
    return this.#documents.get(assertRootedPath(path));
  }

  /**
   * Serve a library declaration a language service returned, such as a `.d.ts` file or a KCL standard
   * library module, at its own path. It never touches the filesystem and cannot be saved.
   */
  public openDeclaration(path: string, text: string): EditorDocument | undefined {
    const key = assertRootedPath(path);
    if (this.#disposed || !isVirtualDeclarationPath(key)) {
      return undefined;
    }
    this.#declarations.delete(key);
    this.#declarations.set(key, text);
    let document = this.#documents.get(key);
    if (document?.text !== text) {
      document = new EditorDocument(key, text);
      this.#documents.set(key, document);
    }
    if (!this.#holds.has(key)) {
      this.#background.set(key, Date.now());
    }
    this.#evictDeclarations();
    return document;
  }

  public hasDeclaration(path: string): boolean {
    return this.#declarations.has(assertRootedPath(path));
  }

  public declarationText(path: string): string | undefined {
    return this.#declarations.get(assertRootedPath(path));
  }

  public async acquire(path: string): Promise<EditorDocument | undefined> {
    const key = assertRootedPath(path);
    if (this.#disposed) {
      return undefined;
    }
    this.#holds.set(key, (this.#holds.get(key) ?? 0) + 1);
    this.#background.delete(key);
    return this.getOrEnsureDocument(key);
  }

  /** Materialize workspace text for navigation or language work without a view hold. */
  public async getOrEnsureDocument(path: string): Promise<EditorDocument | undefined> {
    const key = assertRootedPath(path);
    if (this.#disposed) {
      return undefined;
    }
    const existing = this.#documents.get(key);
    if (existing) {
      if (!this.#holds.has(key)) {
        this.#background.set(key, Date.now());
      }
      return existing;
    }
    const declaration = this.#declarations.get(key);
    if (declaration !== undefined) {
      const document = new EditorDocument(key, declaration);
      this.#documents.set(key, document);
      if (!this.#holds.has(key)) {
        this.#background.set(key, Date.now());
      }
      return document;
    }
    if (isVirtualDeclarationPath(key)) {
      return undefined;
    }
    const epoch = this.#epoch;
    const result = await this.#contentService.resolve(key);
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- disposal may occur while resolve awaits.
    if (this.#disposed || epoch !== this.#epoch || result.kind !== 'text') {
      return undefined;
    }
    const raced = this.#documents.get(key);
    if (raced) {
      return raced;
    }
    const document = new EditorDocument(key, decodeTextFile(result.content));
    this.#documents.set(key, document);
    this.#bases.set(key, result.content);
    if (!this.#holds.has(key)) {
      this.#background.set(key, Date.now());
      this.#evict();
    }
    return document;
  }

  public release(path: string): void {
    const key = assertRootedPath(path);
    const count = this.#holds.get(key) ?? 0;
    if (count <= 1) {
      this.#holds.delete(key);
      if (this.#documents.has(key)) {
        this.#background.set(key, Date.now());
        this.#evict();
      }
    } else {
      this.#holds.set(key, count - 1);
    }
  }

  public apply(path: string, transaction: DocumentTransaction): DocumentChange | undefined {
    if (this.#disposed || this.#declarations.has(assertRootedPath(path))) {
      return undefined;
    }
    return this.get(path)?.apply(transaction);
  }

  /**
   * Save the document once the debounce window closes (D17): the first call
   * opens the window, later ones join it and share its promise, and the text
   * written is the document's as the window closes.
   *
   * @param path - The document's path.
   * @returns Settles with the save the window becomes.
   */
  // oxlint-disable-next-line @typescript-eslint/promise-function-async -- callers compare shared save promises by identity.
  public scheduleSave(path: string): Promise<void> {
    const key = assertRootedPath(path);
    if (!this.#documents.has(key) || this.#disposed) {
      return Promise.reject(new Error(`No active document for ${key}`));
    }
    if (this.#declarations.has(key)) {
      return Promise.reject(new Error(`${key} is a read-only library declaration`));
    }
    const existing = this.#scheduled.get(key);
    if (existing) {
      return existing.settled.promise;
    }
    const scheduled: ScheduledSave = {
      timer: setTimeout(() => {
        this.#flushScheduled(scheduled);
      }, editorSaveDebounceMilliseconds),
      settled: Promise.withResolvers<void>(),
    };
    this.#scheduled.set(key, scheduled);
    return scheduled.settled.promise;
  }

  /**
   * Write every save waiting out its window now, or only `path`'s: the flush
   * points of D17 (blur, close, tab switch, cut). Synchronous: each document's
   * text is in the content service's queue when this returns.
   *
   * @param path - One document's path; omitted, every document's.
   */
  public flushSaves(path?: string): void {
    const key = path === undefined ? undefined : assertRootedPath(path);
    for (const [scheduledPath, scheduled] of this.#scheduled) {
      if (key === undefined || scheduledPath === key) {
        this.#flushScheduled(scheduled);
      }
    }
  }

  /**
   * What settles a save refusal this session answers: the rebased save, or the
   * conflict recorded beside the file. `undefined` for any other failure.
   *
   * A close cut passes this to `settleEditorSaves`, so a conflict being recorded
   * is waited out rather than reported as an unsaved edit.
   */
  // oxlint-disable-next-line @typescript-eslint/promise-function-async -- hands back the rebase's own promise.
  public conflictResolution(failure: unknown): Promise<void> | undefined {
    return failure instanceof EditorSaveConflictError
      ? this.#answeredConflicts.get(failure)?.settled.promise
      : undefined;
  }

  /** Whether a save is waiting out its debounce window. */
  public hasScheduledSave(path?: string): boolean {
    return path === undefined ? this.#scheduled.size > 0 : this.#scheduled.has(assertRootedPath(path));
  }

  /** Persist the current document through the filesystem's checked, bounded save queue. */
  // oxlint-disable-next-line @typescript-eslint/promise-function-async -- callers compare shared save promises by identity.
  public save(path: string): Promise<void> {
    const key = assertRootedPath(path);
    const document = this.#documents.get(key);
    if (!document || this.#disposed) {
      return Promise.reject(new Error(`No active document for ${key}`));
    }
    if (this.#declarations.has(key)) {
      return Promise.reject(new Error(`${key} is a read-only library declaration`));
    }
    const completion = this.#contentService.saveEditor(key, encoder.encode(document.text), this.#bases.get(key));
    const existing = this.#saves.get(key);
    if (existing?.completion === completion) {
      return existing.settled;
    }
    const state = existing ?? { path: key, completion, settled: completion };
    state.path = key;
    state.completion = completion;
    this.#saves.set(key, state);
    state.settled = this.#finalizeSave(state, completion);
    return state.settled;
  }

  public setProjectSession(projectId: string): void {
    /* Text still in the window belongs to the old session's files: it is written there now. */
    this.flushSaves();
    this.#epoch += 1;
    this.#projectId = projectId;
    this.#documents.clear();
    this.#declarations.clear();
    this.#holds.clear();
    this.#background.clear();
    this.#bases.clear();
    this.#saves.clear();
    for (const pending of this.#rebases.values()) {
      // A durable conflict record already owns the edit and must finish after the view exits.
      if (!pending.recording) {
        pending.settled.reject(new Error('Document session changed'));
      }
    }
    this.#rebases.clear();
    this.diagnostics.clear();
  }

  public dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.flushSaves();
    this.#disposed = true;
    for (const unsubscribe of this.#subscriptions) {
      unsubscribe();
    }
    this.setProjectSession(this.#projectId);
  }

  public applyOutcomeChange(event: OutcomeChangeEvent): void {
    if (this.#disposed || this.#saves.has(event.path)) {
      return;
    }
    const document = this.#documents.get(event.path);
    if (!document || event.result.kind === 'loading' || event.result.kind === 'error') {
      return;
    }
    if (this.#rebases.has(event.path)) {
      this.#rebaseOnto(event.path, event.result, true);
      return;
    }
    if (event.result.kind === 'text') {
      this.#adopt(event.path, event.result.content);
    } else if (event.result.kind !== 'orphaned' || !this.#holds.has(event.path)) {
      this.#recordScheduled(event.path);
      this.#remove(event.path);
    }
  }

  // oxlint-disable-next-line complexity -- one dispatch for the content owner's event union.
  public applyContentChange(event: ContentChangeEvent): void {
    if (this.#disposed) {
      return;
    }
    switch (event.type) {
      case 'written': {
        if (event.source !== 'editor') {
          this.#adopt(event.path, event.data);
        }
        break;
      }
      case 'batchWritten': {
        for (const path of event.paths) {
          const bytes = this.#contentService.peek(path);
          if (bytes) {
            this.#adopt(path, bytes);
          }
        }
        break;
      }
      case 'fileCopied': {
        const bytes = this.#contentService.peek(event.targetPath);
        if (bytes) {
          this.#adopt(event.targetPath, bytes);
        }
        break;
      }
      case 'deleted': {
        const pending = this.#rebases.get(event.path);
        const document = this.#documents.get(event.path);
        if (pending && pending.recording !== true && document) {
          this.#recordConflict(event.path, pending, document.text);
        } else {
          this.#recordScheduled(event.path);
        }
        this.#remove(event.path);
        break;
      }
      case 'renamed': {
        this.#rename(event.oldPath, event.newPath);
        break;
      }
      case 'directoryDeleted': {
        for (const path of this.#documents.keys()) {
          if (path === event.path || path.startsWith(`${event.path}/`)) {
            this.#recordScheduled(path);
            this.#remove(path);
          }
        }
        break;
      }
      case 'directoryRenamed': {
        for (const path of this.#documents.keys()) {
          if (path === event.oldPath || path.startsWith(`${event.oldPath}/`)) {
            this.#rename(path, `${event.newPath}${path.slice(event.oldPath.length)}`);
          }
        }
        break;
      }
      case 'read':
      case 'directoryCreated':
      case 'directoryCopied': {
        break;
      }
    }
  }

  #flushScheduled(scheduled: ScheduledSave): void {
    clearTimeout(scheduled.timer);
    let path: string | undefined;
    for (const [candidate, entry] of this.#scheduled) {
      if (entry === scheduled) {
        path = candidate;
      }
    }
    if (path === undefined) {
      return;
    }
    this.#scheduled.delete(path);
    if (!this.#documents.has(path) || this.#disposed) {
      scheduled.settled.resolve();
      return;
    }
    // oxlint-disable-next-line promise/prefer-await-to-then -- forward one settlement to another.
    this.save(path).then(scheduled.settled.resolve).catch(scheduled.settled.reject);
  }

  /**
   * Text still in its debounce window when the file goes away (deleted, or now
   * binary, too large or gone): it is held as an in-flight save's would be, and
   * recorded as a conflict beside the file rather than dropped. The scheduled
   * promise settles with the record, so a failure to record is reported.
   */
  #recordScheduled(path: string): void {
    const scheduled = this.#scheduled.get(path);
    const document = this.#documents.get(path);
    if (scheduled === undefined || document === undefined) {
      return;
    }
    clearTimeout(scheduled.timer);
    this.#scheduled.delete(path);
    const base = this.#bases.get(path) ?? null;
    if (base !== null && decodeTextFile(base) === document.text) {
      scheduled.settled.resolve();
      return;
    }
    const pending = this.#rebases.get(path) ?? { base, settled: Promise.withResolvers<void>() };
    this.#rebases.set(path, pending);
    if (pending.recording !== true) {
      this.#recordConflict(path, pending, document.text);
    }
    // oxlint-disable-next-line promise/prefer-await-to-then -- forward one settlement to another.
    pending.settled.promise.then(scheduled.settled.resolve).catch(scheduled.settled.reject);
  }

  #cancelScheduled(path: string): void {
    const scheduled = this.#scheduled.get(path);
    if (scheduled) {
      clearTimeout(scheduled.timer);
      this.#scheduled.delete(path);
      scheduled.settled.resolve();
    }
  }

  async #finalizeSave(state: SaveState, completion: Promise<void>): Promise<void> {
    let failure: unknown;
    try {
      await completion;
    } catch (error) {
      failure = error;
    }
    if (state.completion === completion && this.#saves.get(state.path) === state) {
      const { path } = state;
      if (failure instanceof EditorSaveConflictError) {
        this.#saves.delete(path);
        return this.#awaitRebase(path, failure.base, failure);
      }
      if (failure === undefined) {
        this.#saves.delete(path);
        const saved = this.#contentService.peekOutcome(path);
        if (saved.kind === 'text') {
          this.#bases.set(path, saved.content);
          this.#documents.get(path)?.adopt(decodeTextFile(saved.content), this.#holds.has(path));
        } else {
          this.applyOutcomeChange({ path, result: saved });
        }
      }
    }
    if (failure !== undefined) {
      // oxlint-disable-next-line @typescript-eslint/only-throw-error -- preserve the filesystem rejection.
      throw failure;
    }
  }

  async #awaitRebase(
    path: string,
    // oxlint-disable-next-line typescript/no-restricted-types -- checked-write absence sentinel.
    base: Uint8Array<ArrayBuffer> | null,
    refusal: EditorSaveConflictError,
  ): Promise<void> {
    let pending = this.#rebases.get(path);
    if (!pending) {
      pending = { base, settled: Promise.withResolvers<void>() };
      this.#rebases.set(path, pending);
    }
    this.#answeredConflicts.set(refusal, pending);
    this.#rebaseOnto(path, this.#contentService.peekOutcome(path), false);
    return pending.settled.promise;
  }

  #rebaseOnto(path: string, outcome: FileContentResult, changed: boolean): void {
    const pending = this.#rebases.get(path);
    const document = this.#documents.get(path);
    if (!pending || pending.recording === true || !document || outcome.kind === 'loading' || outcome.kind === 'error') {
      return;
    }
    if (outcome.kind === 'binary' || outcome.kind === 'too-large') {
      /* The file stopped being text: no merge can land on it, so the refused edit is
       * recorded beside it, as a document whose file goes that way is, and the rebase
       * settles with the record instead of waiting for text that never comes. A file
       * gone or moved aside (orphaned) keeps waiting: a rollback can bring it back. */
      this.#recordScheduled(path);
      if (!this.#isRecording(pending)) {
        this.#recordConflict(path, pending, document.text);
      }
      this.#remove(path);
      return;
    }
    if (outcome.kind !== 'text') {
      return;
    }
    if (pending.base !== null && sameBytes(pending.base, outcome.content)) {
      if (changed) {
        this.#settleRebase(path, pending, this.save(path));
      }
      return;
    }
    const merged = mergeOneFile({
      path,
      base: pending.base,
      ours: encoder.encode(document.text),
      theirs: outcome.content,
    });
    if (!merged) {
      this.#recordConflict(path, pending, document.text);
      return;
    }
    this.#bases.set(path, outcome.content);
    document.adopt(decodeTextFile(merged), this.#holds.has(path));
    this.#settleRebase(path, pending, this.save(path));
  }

  #recordConflict(path: string, pending: PendingRebase, mine: string): void {
    const record = this.#recordEditorConflict;
    if (!record) {
      this.#settleRebase(
        path,
        pending,
        Promise.reject(new Error(`${path} changed while editing and cannot record both versions`)),
      );
      return;
    }
    pending.recording = true;
    const release = holdEditorConflictRecord(this.#projectId);
    const input = { path, base: pending.base === null ? null : decodeTextFile(pending.base), mine };
    const epoch = this.#epoch;
    // async-iife: bootstrap -- the record settles the pending rebase while this event handler remains synchronous.
    void (async (): Promise<void> => {
      try {
        let outcome = await record(input);
        let carried = mine;
        /* Typing during the record is carried by another, even once the file is gone. */
        const typedNow = (): string | undefined =>
          pending.gone === true
            ? pending.latest
            : (this.#documents.get(this.#pathOf(pending) ?? path)?.text ?? pending.latest);
        let typed = typedNow();
        while (epoch === this.#epoch && outcome.status === 'recorded' && typed !== undefined && typed !== carried) {
          carried = typed;
          // oxlint-disable-next-line no-await-in-loop -- each record carries typing during the previous one.
          outcome = await record({ ...input, mine: carried });
          typed = typedNow();
        }
        /* A deleted file's record is done; a document at the path now is a new file's. */
        if (epoch !== this.#epoch || pending.gone === true) {
          pending.settled.resolve();
          return;
        }
        const currentPath = this.#pathOf(pending) ?? path;
        if (outcome.status === 'unchanged') {
          const document = this.#documents.get(currentPath);
          this.#settleRebase(currentPath, pending, document ? this.save(currentPath) : Promise.resolve());
        } else {
          const now = this.#contentService.peekOutcome(currentPath);
          if (now.kind === 'text') {
            this.#bases.set(currentPath, now.content);
            this.#documents.get(currentPath)?.adopt(decodeTextFile(now.content), this.#holds.has(currentPath));
          }
          this.#settleRebase(currentPath, pending, Promise.resolve());
        }
      } catch (error) {
        this.#settleRebase(
          this.#pathOf(pending) ?? path,
          pending,
          Promise.reject(error instanceof Error ? error : new Error(String(error))),
        );
      } finally {
        pending.recording = false;
        release();
      }
    })();
  }

  /** Read afresh: a record started by a call in between is not visible to narrowing. */
  #isRecording(pending: PendingRebase): boolean {
    return pending.recording === true;
  }

  #settleRebase(path: string, pending: PendingRebase, step: Promise<void>): void {
    const currentPath = this.#pathOf(pending) ?? path;
    if (this.#rebases.get(currentPath) === pending) {
      this.#rebases.delete(currentPath);
    }
    // oxlint-disable-next-line promise/prefer-await-to-then -- forward one settlement to another.
    step.then(pending.settled.resolve).catch(pending.settled.reject);
  }

  #pathOf(pending: PendingRebase): string | undefined {
    for (const [path, candidate] of this.#rebases) {
      if (candidate === pending) {
        return path;
      }
    }
    return undefined;
  }

  #adopt(path: string, bytes: Uint8Array<ArrayBuffer>): void {
    const document = this.#documents.get(path);
    if (!document || this.#saves.has(path) || this.#rebases.has(path)) {
      return;
    }
    const base = this.#bases.get(path);
    if (base && document.text !== decodeTextFile(base)) {
      if (sameBytes(base, bytes)) {
        return;
      }
      const pending = { base, settled: Promise.withResolvers<void>() };
      this.#rebases.set(path, pending);
      this.#rebaseOnto(path, { kind: 'text', content: bytes }, true);
      return;
    }
    this.#bases.set(path, bytes);
    document.adopt(decodeTextFile(bytes), this.#holds.has(path));
  }

  #rename(oldPath: string, newPath: string): void {
    const document = this.#documents.get(oldPath);
    if (!document) {
      return;
    }
    this.#documents.delete(oldPath);
    document.rename(newPath);
    this.#documents.set(newPath, document);
    for (const map of [this.#holds, this.#background, this.#bases, this.#saves, this.#rebases, this.#scheduled]) {
      // Maps have different value types; move the entry through a checked local key.
      if (map.has(oldPath)) {
        const value = map.get(oldPath);
        map.delete(oldPath);
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- same map/key, value retained verbatim.
        (map as Map<string, unknown>).set(newPath, value);
      }
    }
    const save = this.#saves.get(newPath);
    if (save) {
      save.path = newPath;
    }
    this.diagnostics.rename(oldPath, newPath);
  }

  #remove(path: string): void {
    this.#cancelScheduled(path);
    const recording = this.#rebases.get(path);
    const removed = this.#documents.get(path);
    if (recording?.recording === true) {
      if (removed !== undefined) {
        recording.latest = removed.text;
      }
      /* The record carries the deleted file's text on its own; a file recreated here starts clean. */
      recording.gone = true;
      this.#rebases.delete(path);
    }
    this.#documents.delete(path);
    this.#holds.delete(path);
    this.#background.delete(path);
    this.#bases.delete(path);
    this.#saves.delete(path);
    const pending = this.#rebases.get(path);
    if (pending && !pending.recording) {
      this.#settleRebase(path, pending, Promise.resolve());
    }
    this.diagnostics.remove(URI.file(`/${path}`).toString());
  }

  #evictDeclarations(): void {
    let excess = this.#declarations.size - maxDeclarations;
    for (const path of this.#declarations.keys()) {
      if (excess <= 0) {
        break;
      }
      if (this.#holds.has(path)) {
        continue;
      }
      this.#declarations.delete(path);
      this.#documents.delete(path);
      this.#background.delete(path);
      excess -= 1;
    }
  }

  #evict(): void {
    if (this.#background.size <= maxBackgroundDocuments) {
      return;
    }
    const oldest = [...this.#background].sort((a, b) => a[1] - b[1]);
    let excess = this.#background.size - maxBackgroundDocuments;
    for (const [path] of oldest) {
      if (excess === 0) {
        break;
      }
      const document = this.#documents.get(path);
      const base = this.#bases.get(path);
      if (
        this.#saves.has(path) ||
        this.#scheduled.has(path) ||
        this.#rebases.has(path) ||
        (document && base && document.text !== decodeTextFile(base))
      ) {
        continue;
      }
      this.#documents.delete(path);
      this.#background.delete(path);
      this.#bases.delete(path);
      excess -= 1;
    }
  }
}
