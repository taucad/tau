import type {
  AfterToolCallContext,
  AfterToolCallResult,
  AgentTool,
  AgentToolResult,
} from '@earendil-works/pi-agent-core';
import type { ImageContent, TextContent } from '@earendil-works/pi-ai';
import { util as zodUtility } from 'zod';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { HostToolInvocation, HostToolResult, ToolRegistry } from '#waist/ports.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { JsonValue } from '#log/event-types.js';

const bracketArrayAlias = /^(files|include|exclude)\[(0|[1-9][0-9]*)\]$/u;
const pathFields = new Map<string, string>([
  ['read_file', 'targetFile'],
  ['edit_file', 'targetFile'],
  ['create_file', 'targetFile'],
  ['delete_file', 'targetFile'],
  ['get_kernel_result', 'targetFile'],
  ['export_geometry', 'targetFile'],
  ['screenshot', 'targetFile'],
  ['list_directory', 'path'],
  ['grep', 'path'],
  ['glob_search', 'path'],
]);

const normalizeBracketArrays = (input: Record<string, unknown>): Record<string, unknown> => {
  const aliases = new Map<string, Array<{ readonly index: number; readonly key: string; readonly value: unknown }>>();
  for (const [key, value] of Object.entries(input)) {
    const match = bracketArrayAlias.exec(key);
    if (!match) {
      continue;
    }
    const field = match[1]!;
    const values = aliases.get(field) ?? [];
    values.push({ index: Number(match[2]), key, value });
    aliases.set(field, values);
  }
  if (aliases.size === 0) {
    return input;
  }

  const sorted = [...aliases].map(([field, values]) => [field, values.toSorted((a, b) => a.index - b.index)] as const);
  if (
    sorted.some(
      ([field, values]) => Object.hasOwn(input, field) || values.some((value, index) => value.index !== index),
    )
  ) {
    return input;
  }

  const healedKeys = new Set(sorted.flatMap(([, values]) => values.map(({ key }) => key)));
  const normalized = Object.fromEntries(Object.entries(input).filter(([key]) => !healedKeys.has(key)));
  for (const [field, values] of sorted) {
    normalized[field] = values.map(({ value }) => value);
  }
  return normalized;
};

const uriScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/u;

const normalizeProjectPath = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const candidate = value.startsWith('/') && !value.startsWith('//') ? value.slice(1) : value;
  if (candidate.startsWith('/') || candidate.includes('\\') || uriScheme.test(candidate)) {
    return undefined;
  }
  for (const character of candidate) {
    const point = character.codePointAt(0);
    if (point !== undefined && (point <= 0x1f || (point >= 0x7f && point <= 0x9f))) {
      return undefined;
    }
  }

  const segments: string[] = [];
  for (const segment of candidate.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (segments.pop() === undefined) {
        return undefined;
      }
      continue;
    }
    segments.push(segment);
  }
  const normalized = segments.join('/');
  return normalized === value ? undefined : normalized;
};

/** Canonicalize the two model-emitted alias families accepted by Tau tools. @public */
export const normalizeToolInput = (toolName: string, input: unknown): unknown => {
  if (!zodUtility.isObject(input)) {
    return input;
  }

  let normalized = toolName === 'test_model' ? normalizeBracketArrays(input) : input;
  if (toolName === 'test_model' && Array.isArray(normalized['files'])) {
    const { files } = normalized as { readonly files: unknown[] };
    const repaired = files.map((value) => normalizeProjectPath(value) ?? value);
    if (repaired.some((value, index) => value !== files[index])) {
      normalized = { ...normalized, files: repaired };
    }
    return normalized;
  }

  const field = pathFields.get(toolName);
  if (!field || !Object.hasOwn(normalized, field)) {
    return normalized;
  }
  const repaired = normalizeProjectPath(normalized[field]);
  return repaired === undefined ? normalized : { ...normalized, [field]: repaired };
};

const isPiContent = (value: unknown): value is TextContent | ImageContent =>
  zodUtility.isObject(value) &&
  ((value['type'] === 'text' && typeof value['text'] === 'string') ||
    (value['type'] === 'image' && typeof value['data'] === 'string' && typeof value['mimeType'] === 'string'));

const dataUrl = /^data:([^;,]+);base64,(.+)$/u;

/**
 * Turn a `screenshot` result into image blocks and one short instruction.
 *
 * Detected by shape rather than by tool name because both call sites that
 * build model-visible content from a durable result — the live tool execution
 * in {@link createAgentTools} and the rehydration in
 * `providerMessageToPi` — must agree, and the transport rebuilds pi's context
 * from the durable row on every request (`piContextFor`). Stringifying instead
 * cost ~27 500 tokens per 1600² view: six of them were ~165 000 against a
 * 200 000-token window, and compaction measured that and failed the run.
 *
 * @param value - A durable tool result.
 * @returns Image blocks, or `undefined` when the result carries no capture.
 */
const screenshotContent = (value: JsonValue): Array<TextContent | ImageContent> | undefined => {
  if (!zodUtility.isObject(value) || !Array.isArray(value['images'])) {
    return undefined;
  }
  const candidates: unknown[] = value['images'];
  const images = candidates.flatMap((image): Array<TextContent | ImageContent> => {
    if (!zodUtility.isObject(image) || typeof image['dataUrl'] !== 'string') {
      return [];
    }
    const match = dataUrl.exec(image['dataUrl']);
    return match ? [{ type: 'image', mimeType: match[1]!, data: match[2]! }] : [];
  });
  if (images.length === 0) {
    return undefined;
  }
  return [
    {
      type: 'text',
      text: `Captured ${images.length} screenshot(s). You are now a quality inspector, not the designer. Examine every surface for defects, discontinuities, artifacts, or geometry that does not match design intent.`,
    },
    ...images,
  ];
};

/** Convert a durable JSON tool result into pi's model-visible content blocks. @public */
export const toPiToolContent = (content: JsonValue): Array<TextContent | ImageContent> => {
  if (Array.isArray(content)) {
    const blocks: unknown[] = content;
    if (blocks.every((block) => isPiContent(block))) {
      return [...blocks];
    }
  }
  return (
    screenshotContent(content) ?? [
      { type: 'text', text: typeof content === 'string' ? content : JSON.stringify(content) },
    ]
  );
};

/** Original host result retained behind pi's model-visible tool content. @public */
export type HostToolExecutionDetails = HostToolResult & { readonly substituted: boolean };

/** Optional eager/cache result source checked before the real tool registry. @public */
export type ToolResultSubstituter = (
  invocation: HostToolInvocation,
) => Promise<HostToolResult | undefined> | HostToolResult | undefined;

type CreateAgentToolsOptions = {
  readonly registry: ToolRegistry;
  readonly substitute?: ToolResultSubstituter | undefined;
};

/** Wrap the waist tool registry as pi `AgentTool`s, including T4 result substitution. @public */
export const createAgentTools = (options: CreateAgentToolsOptions): AgentTool[] =>
  options.registry.list().map((definition) => ({
    name: definition.name,
    label: definition.name,
    description: definition.description,
    parameters: definition.inputSchema,
    prepareArguments: (input) => normalizeToolInput(definition.name, input),
    execute: async (toolCallId, input, signal): Promise<AgentToolResult<HostToolExecutionDetails>> => {
      const invocation: HostToolInvocation = {
        toolCallId,
        toolName: definition.name,
        input: input as JsonValue,
        signal: signal ?? new AbortController().signal,
      };
      const substituted = await options.substitute?.(invocation);
      const result = substituted ?? (await options.registry.invoke(invocation));
      return {
        content: toPiToolContent(result.content),
        details: { ...result, substituted: substituted !== undefined },
      };
    },
  }));

/** Restore the waist's explicit error bit after pi executes a wrapped tool. @public */
export const applyHostToolResult = (context: Pick<AfterToolCallContext, 'result'>): AfterToolCallResult | undefined => {
  const details = context.result.details as HostToolExecutionDetails | undefined;
  return details ? { isError: details.isError } : undefined;
};
