/**
 * Tool-result offloading (regression review R4).
 *
 * The server agent plane wrote any tool result too large for context to the chat's filesystem and gave the model a
 * preview and the path, so the full result stayed retrievable. The Pi host lost that: a large result went into context
 * whole until compaction erased it. This restores it for every host that builds its registry here:
 *
 * - A result over its tool's limit (80,000 serialized characters for `read_file`, 20,000 otherwise, as before) is
 *   written whole to the project's read-only artifacts record and replaced by a preview of the same shape: long text
 *   is cut at a line with a note naming the file, nested lists are shortened, and an object result gains
 *   `offloadedTo: { path, characters }`. Totals and status fields stay, so the UI renders the preview as it would the
 *   result, and the model can `read_file` or `grep` the file.
 * - A session's {@link HostToolResultBudget} caps what one batch of parallel calls puts into context at once (200,000
 *   characters on the server agent plane). A result the batch cannot fit is retained the same way, even under its own
 *   limit.
 *
 * Long text is written as lines rather than as one escaped JSON string, so `read_file` pages it by line.
 *
 * @module
 */
import { toolName } from '@taucad/chat/constants';
import { slugifyTargetFile, writeArtifactSet } from '@taucad/chat/rpc';
import type { RpcFileSystem } from '@taucad/chat/rpc';

import type { HostToolInvocation, HostToolResult, JsonObject, JsonValue } from '@taucad/agent-host';

const defaultLimit = 20_000;

const perToolLimit: Readonly<Record<string, number>> = {
  [toolName.readFile]: 80_000,
  [toolName.grep]: 20_000,
  [toolName.globSearch]: 20_000,
  [toolName.listDirectory]: 20_000,
};

/*
 * Never offloaded: edit acknowledgements are small; `use_skill` instructions must arrive whole; `test_model` retains its
 * own oversized verdicts; screenshots and other image results belong to the image trimmer; the todo list and the
 * workbench and question records are read back by the UI as they are.
 */
const neverOffloaded: ReadonlySet<string> = new Set([
  toolName.editFile,
  toolName.createFile,
  toolName.deleteFile,
  toolName.useSkill,
  toolName.testModel,
  toolName.screenshot,
  toolName.updateTodos,
  toolName.askQuestions,
  toolName.arrangeWorkbench,
]);

/** The longest text a preview shows of one string. */
const previewTextLimit = 4000;
/** The most a preview shows of one nested list, in serialized characters. */
const previewListLimit = 8000;
/** Strings at least this long, or holding a line break, are written as their own text block. */
const textBlockThreshold = 200;

const carriesImage = /"dataUrl"|data:image\/|"type":"file-ref"/u;

/**
 * The serialized size above which a tool's result is retained instead of returned whole.
 *
 * @param name - The tool name.
 * @returns The limit in serialized characters.
 * @public
 */
export const toolResultLimit = (name: string): number => perToolLimit[name] ?? defaultLimit;

/**
 * Where a call's retained result is written: a file in the project's read-only artifacts record, which `read_file`
 * and `grep` can read.
 *
 * @param toolCallId - The provider's tool call id.
 * @returns The project-relative path.
 * @public
 */
export const retainedResultPath = (toolCallId: string): string =>
  `.tau/artifacts/${slugifyTargetFile(toolCallId)}__tool-result-txt/result.txt`;

const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isJsonArray = (value: JsonValue): value is readonly JsonValue[] => Array.isArray(value);

/**
 * Render a result for reading back with `read_file`: plain text as it is; anything else as indented JSON in which each
 * long or multi-line string is a placeholder, followed by those strings as text blocks.
 */
const renderForReading = (content: JsonValue): string => {
  if (typeof content === 'string') {
    return content;
  }
  const blocks: Array<{ path: string; text: string }> = [];
  const lift = (value: JsonValue, path: string): JsonValue => {
    if (typeof value === 'string') {
      if (value.length < textBlockThreshold && !value.includes('\n')) {
        return value;
      }
      blocks.push({ path, text: value });
      return `[text block ${String(blocks.length)} below]`;
    }
    if (isJsonArray(value)) {
      return value.map((item, index) => lift(item, `${path}[${String(index)}]`));
    }
    if (isJsonObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, lift(entry, path === '' ? key : `${path}.${key}`)]),
      );
    }
    return value;
  };
  const skeleton = JSON.stringify(lift(content, ''), undefined, 2);
  return [
    skeleton,
    ...blocks.map(
      ({ path, text }, index) => `\n--- text block ${String(index + 1)} (${path || 'result'}) ---\n${text}`,
    ),
  ].join('\n');
};

const cutText = (text: string, path: string): string => {
  if (text.length <= previewTextLimit) {
    return text;
  }
  const slice = text.slice(0, previewTextLimit);
  const lastNewline = slice.lastIndexOf('\n');
  const head = lastNewline > previewTextLimit / 2 ? slice.slice(0, lastNewline) : slice;
  return (
    `${head}\n\n[${String(text.length - head.length)} more characters not shown. The full result is in ${path}; ` +
    'page it with read_file offset and limit, or grep it.]'
  );
};

/** A preview of the same shape: long strings cut, nested lists shortened, the top-level list kept whole. */
const previewOf = (content: JsonValue, path: string): JsonValue => {
  const shrink = (value: JsonValue, nested: boolean): JsonValue => {
    if (typeof value === 'string') {
      return cutText(value, path);
    }
    if (isJsonArray(value)) {
      const kept: JsonValue[] = [];
      let used = 0;
      for (const item of value) {
        const small = shrink(item, true);
        const size = JSON.stringify(small).length;
        if (nested && kept.length > 0 && used + size > previewListLimit) {
          break;
        }
        kept.push(small);
        used += size;
      }
      return kept;
    }
    if (isJsonObject(value)) {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, shrink(entry, true)]));
    }
    return value;
  };
  return shrink(content, false);
};

/** Options for {@link withToolResultOffload}. @public */
export type ToolResultOffloadOptions = Readonly<{
  /** The record filesystem retained results are written through, bound to the call's cancellation. */
  fileSystemFor: (signal: AbortSignal) => RpcFileSystem;
}>;

/**
 * Wrap a registry's dispatch so a result too large for context, alone or within its batch, is retained and previewed.
 *
 * @param invoke - The registry's own dispatch.
 * @param options - Where retained results are written.
 * @returns The dispatch with offloading.
 * @public
 */
export const withToolResultOffload =
  (
    invoke: (invocation: HostToolInvocation) => Promise<HostToolResult>,
    options: ToolResultOffloadOptions,
  ): ((invocation: HostToolInvocation) => Promise<HostToolResult>) =>
  async (invocation) => {
    const result = await invoke(invocation);
    const budget = invocation.resultBudget;
    const serialized = JSON.stringify(result.content);
    const size = serialized.length;
    if (result.isError || neverOffloaded.has(invocation.toolName) || carriesImage.test(serialized)) {
      budget?.charge(size);
      return result;
    }
    if (size <= toolResultLimit(invocation.toolName) && (budget?.admit(size) ?? true)) {
      return result;
    }
    const text = renderForReading(result.content);
    const [written] =
      (await writeArtifactSet(
        {
          toolCallId: invocation.toolCallId,
          targetFile: 'tool-result',
          format: 'txt',
          files: [{ name: 'result.txt', mimeType: 'text/plain', bytes: new TextEncoder().encode(text) }],
        },
        options.fileSystemFor(invocation.signal),
      )) ?? [];
    if (written === undefined) {
      /* Nothing retained: the model gets the whole result rather than a pointer to nothing. */
      budget?.charge(size);
      return result;
    }
    const preview = previewOf(result.content, written.artifactPath);
    const content = isJsonObject(preview)
      ? { ...preview, offloadedTo: { path: written.artifactPath, characters: size } }
      : preview;
    budget?.charge(JSON.stringify(content).length);
    return { ...result, content };
  };
