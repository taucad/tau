import { Topic } from '@taucad/events';
import { assertRootedPath } from '@taucad/utils/path';
import { URI } from 'vscode-uri';

/** One UTF-16 offset replacement, measured against the transaction's prior text. */
export type TextChange = Readonly<{ from: number; to: number; insert: string }>;

/** Provenance determines persistence and prevents a view from echoing its own edit. */
export type DocumentOrigin =
  | 'view'
  | 'undo'
  | 'redo'
  | 'formatter'
  | 'workspace-edit'
  | 'filesystem'
  | 'conflict-resolution';

export type DocumentTransaction = Readonly<{
  changes: readonly TextChange[];
  origin: DocumentOrigin;
  expectedVersion: number;
  viewId?: string;
  history?: Readonly<{
    kind: 'typing' | 'composition' | 'paste' | 'command';
    /** One IME composition's stable identity; required for composition grouping. */
    groupId?: string;
    atMilliseconds?: number;
  }>;
}>;

export type DocumentChange = Readonly<{
  uri: string;
  path: string;
  previousVersion: number;
  version: number;
  changes: readonly TextChange[];
  origin: DocumentOrigin;
  viewId?: string;
}>;

type HistoryStep = { forward: readonly TextChange[]; backward: readonly TextChange[] };
type HistoryGroup = {
  steps: HistoryStep[];
  kind: 'typing' | 'composition' | 'external' | 'isolated';
  viewId?: string;
  groupId?: string;
  atMilliseconds: number;
};
const typingGroupWindowMilliseconds = 1000;
const maxHistoryGroups = 200;

/** Session-owned text and undo history, independent of any rendered editor view. */
export class EditorDocument {
  readonly #changes = new Topic<DocumentChange>({ name: 'EditorDocument.changes' });
  readonly #undo: HistoryGroup[] = [];
  readonly #redo: HistoryGroup[] = [];
  #text: string;
  #version = 1;
  #path: string;

  public constructor(path: string, text: string) {
    this.#path = assertRootedPath(path);
    this.#text = text;
  }

  public get path(): string {
    return this.#path;
  }

  public get uri(): string {
    return URI.file(`/${this.#path}`).toString();
  }

  public get text(): string {
    return this.#text;
  }

  public get version(): number {
    return this.#version;
  }

  public subscribe(listener: (event: DocumentChange) => void, options?: { signal?: AbortSignal }): () => void {
    return this.#changes.subscribe(listener, options);
  }

  /** Refuse a stale version or invalid offsets without changing text or history. */
  public apply(transaction: DocumentTransaction): DocumentChange | undefined {
    if (transaction.expectedVersion !== this.#version) {
      return undefined;
    }
    const changes = [...transaction.changes];
    if (!validChanges(changes, this.#text.length)) {
      return undefined;
    }
    if (changes.length === 0) {
      return undefined;
    }
    const backward: TextChange[] = [];
    let shift = 0;
    for (const change of changes) {
      const removed = this.#text.slice(change.from, change.to);
      const from = change.from + shift;
      backward.push({ from, to: from + change.insert.length, insert: removed });
      shift += change.insert.length - (change.to - change.from);
    }
    const event = this.#commit(changes, transaction.origin, transaction.viewId);
    if (transaction.origin !== 'filesystem') {
      const step = { forward: changes, backward };
      const last = this.#undo.at(-1);
      const atMilliseconds = transaction.history?.atMilliseconds ?? Date.now();
      if (last && canJoinHistory(last, transaction, atMilliseconds)) {
        last.steps.push(step);
        last.atMilliseconds = atMilliseconds;
      } else {
        this.#undo.push({
          steps: [step],
          kind:
            transaction.history?.kind === 'typing' || transaction.history?.kind === 'composition'
              ? transaction.history.kind
              : 'isolated',
          viewId: transaction.viewId,
          groupId: transaction.history?.groupId,
          atMilliseconds,
        });
        if (this.#undo.length > maxHistoryGroups) {
          this.#undo.shift();
        }
      }
      this.#redo.length = 0;
    }
    return event;
  }

  public undo(viewId?: string): DocumentChange | undefined {
    const group = this.#undo.pop();
    if (!group) {
      return undefined;
    }
    this.#redo.push(group);
    let restored = this.#text;
    for (let index = group.steps.length - 1; index >= 0; index--) {
      restored = applyText(restored, group.steps[index]!.backward);
    }
    return this.#commit([minimalChange(this.#text, restored)], 'undo', viewId);
  }

  public redo(viewId?: string): DocumentChange | undefined {
    const group = this.#redo.pop();
    if (!group) {
      return undefined;
    }
    this.#undo.push(group);
    let restored = this.#text;
    for (const step of group.steps) {
      restored = applyText(restored, step.forward);
    }
    return this.#commit([minimalChange(this.#text, restored)], 'redo', viewId);
  }

  /** Carry one document and its history across a filesystem rename. */
  public rename(path: string): void {
    this.#path = assertRootedPath(path);
  }

  /** Apply authority text as one undoable replacement while a view holds the document. */
  public adopt(text: string, preserveUndo = true): DocumentChange | undefined {
    if (text === this.#text) {
      return undefined;
    }
    const prior = this.#text;
    const event = this.#commit([{ from: 0, to: prior.length, insert: text }], 'filesystem');
    if (preserveUndo) {
      this.#undo.push({
        steps: [
          {
            forward: [{ from: 0, to: prior.length, insert: text }],
            backward: [{ from: 0, to: text.length, insert: prior }],
          },
        ],
        kind: 'external',
        atMilliseconds: Date.now(),
      });
      if (this.#undo.length > maxHistoryGroups) {
        this.#undo.shift();
      }
    } else {
      this.#undo.length = 0;
    }
    this.#redo.length = 0;
    return event;
  }

  #commit(changes: readonly TextChange[], origin: DocumentOrigin, viewId?: string): DocumentChange {
    const previousVersion = this.#version;
    this.#text = applyText(this.#text, changes);
    this.#version += 1;
    const event = { uri: this.uri, path: this.path, previousVersion, version: this.#version, changes, origin, viewId };
    this.#changes.emit(event);
    return event;
  }
}

function applyText(text: string, changes: readonly TextChange[]): string {
  for (let index = changes.length - 1; index >= 0; index--) {
    const change = changes[index]!;
    text = `${text.slice(0, change.from)}${change.insert}${text.slice(change.to)}`;
  }
  return text;
}

function minimalChange(before: string, after: string): TextChange {
  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) {
    from += 1;
  }
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > from && afterEnd > from && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  return { from, to: beforeEnd, insert: after.slice(from, afterEnd) };
}

function canJoinHistory(group: HistoryGroup, transaction: DocumentTransaction, atMilliseconds: number): boolean {
  const intent = transaction.history;
  if (!intent || group.viewId !== transaction.viewId || intent.kind !== group.kind) {
    return false;
  }
  if (intent.kind === 'composition') {
    return intent.groupId !== undefined && intent.groupId === group.groupId;
  }
  if (atMilliseconds - group.atMilliseconds > typingGroupWindowMilliseconds) {
    return false;
  }
  const previous = group.steps.at(-1)?.forward;
  const next = transaction.changes;
  if (previous?.length !== 1 || next.length !== 1) {
    return false;
  }
  const a = previous[0]!;
  const b = next[0]!;
  const adjacentInsert = a.from === a.to && b.from === b.to && b.from === a.from + a.insert.length;
  const adjacentBackspace = a.insert === '' && b.insert === '' && b.to === a.from;
  return adjacentInsert || adjacentBackspace;
}

function validChanges(changes: readonly TextChange[], length: number): boolean {
  let end = 0;
  for (const change of changes) {
    if (
      !Number.isSafeInteger(change.from) ||
      !Number.isSafeInteger(change.to) ||
      change.from < end ||
      change.from > change.to ||
      change.to > length
    ) {
      return false;
    }
    end = change.to;
  }
  return true;
}
