import { sha256StringSync } from '@taucad/utils/hash';
import { canonicalJson } from '#log/canonical-json.js';
import type { AgentLogEvent } from '#log/event-types.js';

/*
 * WP-17: a log file is written compactly and restored as it is parsed, file by file, so every reader above the parser
 * sees the rows it saw before. Three encodings, each naming only an earlier row of the same file (`ContextResolves`,
 * `PromptResolves` and `ContentKeptResolves` in ChatLog.tla):
 *
 * - A turn context (`admission.context` of an admitted row, `context` of a history commit) is written inline once per
 *   distinct value with `contextDigest`; a later holder of the same value writes `contextDigest` in its place.
 * - Inside an inline context, `systemPromptBlocks` is written once per distinct value with `systemPromptBlocksDigest`
 *   and named by the digest after that; `systemPrompt` equal to the blocks' texts joined by a blank line is written as
 *   `systemPromptJoined: true`.
 * - A `message.envelope-replaced` whose content equals the content the file last wrote for that message writes
 *   `contentKept: true` in place of `replacement.content`.
 *
 * Each compact key takes the place of the key it stands for, so a restored row has the key order it was written with.
 */

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const digestOf = (value: unknown): string => `sha256:${sha256StringSync(canonicalJson(value))}`;

type Entry = { readonly key: string; readonly value: unknown };

/**
 * A copy of `record` with the key `from` replaced at its position by `entry`, or removed when there is no entry.
 *
 * @param record - The object.
 * @param from - The key to replace.
 * @param entry - What takes its place.
 * @returns The copy.
 */
const swapKey = (record: JsonObject, from: string, entry?: Entry): JsonObject => {
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === from) {
      if (entry !== undefined) {
        out[entry.key] = entry.value;
      }
    } else if (key !== entry?.key) {
      out[key] = value;
    }
  }
  return out;
};

/**
 * A copy of `record` with `entry` inserted right after the key `previous`.
 *
 * @param record - The object.
 * @param previous - The key the entry follows.
 * @param entry - The entry.
 * @returns The copy.
 */
const insertAfter = (record: JsonObject, previous: string, entry: Entry): JsonObject => {
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(record)) {
    if (key !== entry.key) {
      out[key] = value;
    }
    if (key === previous) {
      out[entry.key] = entry.value;
    }
  }
  return out;
};

const without = (record: JsonObject, key: string): JsonObject => swapKey(record, key);

const joinedPrompt = (blocks: unknown): string | undefined => {
  if (!Array.isArray(blocks)) {
    return undefined;
  }
  const texts: string[] = [];
  for (const block of blocks) {
    if (!isObject(block) || typeof block['text'] !== 'string') {
      return undefined;
    }
    texts.push(block['text']);
  }
  return texts.join('\n\n');
};

/**
 * The values a file wrote and its later rows may name: the parser restores from it, and the writer of that file
 * compacts against it. Forking is copy-on-write, so a parse that extends an earlier one never changes it.
 *
 * @internal
 */
export class LogFileDictionary {
  public static empty(): LogFileDictionary {
    return new LogFileDictionary(new Map(), new Map(), new Map());
  }

  #contexts: Map<string, unknown>;
  #prompts: Map<string, unknown>;
  #contents: Map<string, unknown>;
  #owned = true;

  private constructor(contexts: Map<string, unknown>, prompts: Map<string, unknown>, contents: Map<string, unknown>) {
    this.#contexts = contexts;
    this.#prompts = prompts;
    this.#contents = contents;
  }

  /** A dictionary that starts as this one; writing to either leaves the other as it was. */
  public fork(): LogFileDictionary {
    this.#owned = false;
    const next = new LogFileDictionary(this.#contexts, this.#prompts, this.#contents);
    next.#owned = false;
    return next;
  }

  public context(digest: string): unknown {
    return this.#contexts.get(digest);
  }

  public prompt(digest: string): unknown {
    return this.#prompts.get(digest);
  }

  public content(messageId: string): unknown {
    return this.#contents.get(messageId);
  }

  /**
   * Note one kept row: the values its line wrote inline, keyed as later lines name them.
   *
   * @param written - The row as its line holds it (compact or not).
   * @param row - The same row restored.
   */
  public note(written: unknown, row: unknown): void {
    if (!isObject(written) || !isObject(row)) {
      return;
    }
    const writtenHolder = holderOf(written);
    const holder = holderOf(row);
    if (writtenHolder !== undefined && holder !== undefined && isObject(writtenHolder['context'])) {
      const digest = writtenHolder['contextDigest'];
      const { context } = holder;
      if (typeof digest === 'string' && isObject(context)) {
        this.#own();
        this.#contexts.set(digest, context);
        const writtenContext = writtenHolder['context'];
        const blocksDigest = writtenContext['systemPromptBlocksDigest'];
        if (typeof blocksDigest === 'string' && 'systemPromptBlocks' in writtenContext) {
          this.#prompts.set(blocksDigest, context['systemPromptBlocks']);
        }
      }
    }
    const content = contentWritten(row);
    if (content !== undefined) {
      this.#own();
      this.#contents.set(content.messageId, content.content);
    }
  }

  #own(): void {
    if (!this.#owned) {
      this.#contexts = new Map(this.#contexts);
      this.#prompts = new Map(this.#prompts);
      this.#contents = new Map(this.#contents);
      this.#owned = true;
    }
  }
}

/** The object that holds a row's turn context: an admitted row's admission, or a history commit itself. */
const holderOf = (row: JsonObject): JsonObject | undefined => {
  if (row['type'] === 'run.lifecycle' && row['state'] === 'admitted' && isObject(row['admission'])) {
    return row['admission'];
  }
  return row['type'] === 'turn.history-projection-committed' ? row : undefined;
};

const withHolder = (row: JsonObject, holder: JsonObject): JsonObject =>
  row['type'] === 'run.lifecycle' ? { ...row, admission: holder } : holder;

/** The message content a restored row writes, by message id. */
const contentWritten = (row: JsonObject): { readonly messageId: string; readonly content: unknown } | undefined => {
  if (row['type'] === 'message.appended') {
    const { message } = row;
    return isObject(message) && typeof message['id'] === 'string' && 'content' in message
      ? { messageId: message['id'], content: message['content'] }
      : undefined;
  }
  if (row['type'] === 'message.envelope-replaced') {
    const { replacement } = row;
    return typeof row['messageId'] === 'string' && isObject(replacement) && 'content' in replacement
      ? { messageId: row['messageId'], content: replacement['content'] }
      : undefined;
  }
  return undefined;
};

/** A row restored from its line: `unresolved` when it names a value no earlier line of the file wrote. */
export type RestoredLogRow =
  | { readonly status: 'plain'; readonly value: unknown }
  | { readonly status: 'restored'; readonly value: unknown }
  | { readonly status: 'unresolved' };

const unresolved = { status: 'unresolved' } as const;

const restoreContext = (context: JsonObject, dictionary: LogFileDictionary): JsonObject | undefined => {
  let out = context;
  const blocksDigest = out['systemPromptBlocksDigest'];
  if (typeof blocksDigest === 'string') {
    if ('systemPromptBlocks' in out) {
      out = without(out, 'systemPromptBlocksDigest');
    } else {
      const blocks = dictionary.prompt(blocksDigest);
      if (blocks === undefined) {
        return undefined;
      }
      out = swapKey(out, 'systemPromptBlocksDigest', { key: 'systemPromptBlocks', value: structuredClone(blocks) });
    }
  }
  if (out['systemPromptJoined'] === true) {
    const prompt = joinedPrompt(out['systemPromptBlocks']);
    if (prompt === undefined) {
      return undefined;
    }
    out = swapKey(out, 'systemPromptJoined', { key: 'systemPrompt', value: prompt });
  }
  return out;
};

/**
 * Restore one line's row from the earlier lines of its file (WP-17). A line without a compact key is returned as it
 * is, so a log written before WP-17 reads exactly as it did.
 *
 * @internal
 * @param value - The line's JSON value.
 * @param dictionary - What the file's earlier lines wrote.
 * @returns The row as it was appended, or `unresolved`.
 */
export const restoreLogRow = (value: unknown, dictionary: LogFileDictionary): RestoredLogRow => {
  if (!isObject(value)) {
    return { status: 'plain', value };
  }
  const holder = holderOf(value);
  if (holder !== undefined && typeof holder['contextDigest'] === 'string') {
    let context: JsonObject;
    if (isObject(holder['context'])) {
      const restored = restoreContext(holder['context'], dictionary);
      if (restored === undefined) {
        return unresolved;
      }
      context = restored;
    } else {
      const known = dictionary.context(holder['contextDigest']);
      if (!isObject(known)) {
        return unresolved;
      }
      context = structuredClone(known);
    }
    /* The context takes its own key's place, or its digest's when the line named it. */
    const restoredHolder =
      'context' in holder
        ? { ...without(holder, 'contextDigest'), context }
        : swapKey(holder, 'contextDigest', { key: 'context', value: context });
    return { status: 'restored', value: withHolder(value, restoredHolder) };
  }
  if (value['type'] === 'message.envelope-replaced' && isObject(value['replacement'])) {
    const { replacement } = value;
    if (replacement['contentKept'] !== true) {
      return { status: 'plain', value };
    }
    const content = typeof value['messageId'] === 'string' ? dictionary.content(value['messageId']) : undefined;
    if (content === undefined) {
      return unresolved;
    }
    return {
      status: 'restored',
      value: {
        ...value,
        replacement: swapKey(replacement, 'contentKept', { key: 'content', value: structuredClone(content) }),
      },
    };
  }
  return { status: 'plain', value };
};

const compactContext = (context: JsonObject, dictionary: LogFileDictionary): JsonObject => {
  let out = context;
  const blocks = out['systemPromptBlocks'];
  if (!Array.isArray(blocks)) {
    return out;
  }
  if (typeof out['systemPrompt'] === 'string' && out['systemPrompt'] === joinedPrompt(blocks)) {
    out = swapKey(out, 'systemPrompt', { key: 'systemPromptJoined', value: true });
  }
  const digest = digestOf(blocks);
  return dictionary.prompt(digest) === undefined
    ? insertAfter(out, 'systemPromptBlocks', { key: 'systemPromptBlocksDigest', value: digest })
    : swapKey(out, 'systemPromptBlocks', { key: 'systemPromptBlocksDigest', value: digest });
};

const sameContent = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

/**
 * The line a known row is written as, against what its file already holds (WP-17). The result restores, through
 * {@link restoreLogRow} with the same dictionary, to a value whose JSON is the row's.
 *
 * @internal
 * @param event - A known row, as the strict parse returned it.
 * @param dictionary - What the file holds before this row.
 * @returns The row itself when nothing in it can be named, else its compact form.
 */
export const compactLogRow = (event: AgentLogEvent, dictionary: LogFileDictionary): unknown => {
  const row = event as unknown as JsonObject;
  const holder = holderOf(row);
  if (holder !== undefined && isObject(holder['context'])) {
    const { context } = holder;
    const digest = digestOf(context);
    const compactHolder =
      dictionary.context(digest) === undefined
        ? insertAfter({ ...holder, context: compactContext(context, dictionary) }, 'context', {
            key: 'contextDigest',
            value: digest,
          })
        : swapKey(holder, 'context', { key: 'contextDigest', value: digest });
    return withHolder(row, compactHolder);
  }
  if (row['type'] === 'message.envelope-replaced' && typeof row['messageId'] === 'string') {
    const { replacement } = row;
    const kept = dictionary.content(row['messageId']);
    if (
      isObject(replacement) &&
      'content' in replacement &&
      kept !== undefined &&
      sameContent(kept, replacement['content'])
    ) {
      return { ...row, replacement: swapKey(replacement, 'content', { key: 'contentKept', value: true }) };
    }
  }
  return event;
};
