import { AIMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { decodeProviderErrorBody } from '#api/chat/utils/provider-error-decoder.js';

export type ProviderDiagnosticsLogger = {
  debug?: (payload: Record<string, unknown>, message: string) => void;
  error: (payload: Record<string, unknown>, message: string) => void;
};

export type ProviderDiagnosticsContext = {
  chatId: string;
  modelId: string;
  providerId: string;
  verbose: boolean;
  logger: ProviderDiagnosticsLogger;
  nextProviderAttemptId: () => number;
  setLatestModelCallSummary: (summary: ProviderModelCallSummary) => void;
  getLatestModelCallSummary: () => ProviderModelCallSummary | undefined;
};

export type ProviderModelCallSummary = {
  messageCount: number;
  tail: MessageSummary[];
  diagnosticFlags: string[];
};

export type ProviderModelCallDebugSummary = {
  messageCount: number;
  tailCount: number;
  diagnosticFlags: string[];
};

type MessageSummary = {
  index: number;
  role: string;
  content: unknown;
  toolCalls?: ToolCallSummary[];
  invalidToolCalls?: InvalidToolCallSummary[];
  legacyToolCalls?: LegacyToolCallSummary[];
  legacyFunctionCall?: LegacyToolCallSummary;
  toolResult?: ToolResultSummary;
};

type ToolCallSummary = {
  id?: string;
  name?: string;
  args: unknown;
};

type InvalidToolCallSummary = {
  id?: string;
  name?: string;
  args: unknown;
  error?: string;
};

type LegacyToolCallSummary = {
  id?: string;
  name?: string;
  args: unknown;
  validName: boolean;
  validArgs: boolean;
};

type ToolResultSummary = {
  toolCallId?: string;
  name?: string;
  status?: string;
  contentLength: number;
  errorCode?: string;
  toolName?: string;
};

type FetchLike = typeof fetch;

const messageTailLimit = 12;
const contentPartLimit = 20;
const keyLimit = 30;
const schemaKeywords = [
  '$defs',
  'additionalProperties',
  'allOf',
  'anyOf',
  'const',
  'enum',
  'format',
  'nullable',
  'oneOf',
  'prefixItems',
  'propertyNames',
  'required',
  'type',
] as const;

export const createProviderDiagnosticsContext = (options: {
  chatId: string;
  modelId: string;
  providerId: string;
  verbose: boolean;
  logger: ProviderDiagnosticsLogger;
}): ProviderDiagnosticsContext => {
  let latestModelCallSummary: ProviderModelCallSummary | undefined;
  let providerAttemptSequence = 0;

  return {
    ...options,
    nextProviderAttemptId: () => {
      providerAttemptSequence += 1;
      return providerAttemptSequence;
    },
    setLatestModelCallSummary: (summary) => {
      latestModelCallSummary = summary;
    },
    getLatestModelCallSummary: () => latestModelCallSummary,
  };
};

export const summarizeModelCallMessages = (messages: BaseMessage[]): ProviderModelCallSummary => {
  const tailStart = Math.max(0, messages.length - messageTailLimit);
  const tail = messages.slice(tailStart).map((message, offset) => summarizeMessage(message, tailStart + offset));

  return {
    messageCount: messages.length,
    tail,
    diagnosticFlags: collectMessageDiagnosticFlags(messages),
  };
};

export const summarizeModelCallForDebugLog = (
  summary: ProviderModelCallSummary | undefined,
): ProviderModelCallDebugSummary | undefined => {
  if (!summary) {
    return undefined;
  }

  return {
    messageCount: summary.messageCount,
    tailCount: summary.tail.length,
    diagnosticFlags: summary.diagnosticFlags,
  };
};

export const createGoogleProviderDiagnosticsFetch = (options: {
  baseFetch: FetchLike;
  context: ProviderDiagnosticsContext;
}): FetchLike => {
  const { baseFetch, context } = options;

  return (async (input, init) => {
    const providerAttemptId = context.nextProviderAttemptId();
    const startedAt = Date.now();
    const requestSummary = summarizeFetchRequest(input, init);

    try {
      const response = await baseFetch(input, init);
      const elapsed = Date.now() - startedAt;

      if (!response.ok) {
        const responseBody = await readClonedResponseBody(response);
        context.logger.error(
          {
            chatId: context.chatId,
            modelId: context.modelId,
            providerId: context.providerId,
            providerDiagnostics: {
              providerAttemptId,
              elapsed,
              modelCall: context.getLatestModelCallSummary(),
              request: requestSummary,
              response: {
                status: response.status,
                statusText: response.statusText,
                body: summarizeDecodedBody(responseBody),
              },
            },
          },
          `Google Vertex request failed for ${context.modelId}`,
        );
      } else if (context.verbose && context.logger.debug) {
        context.logger.debug(
          {
            chatId: context.chatId,
            modelId: context.modelId,
            providerId: context.providerId,
            providerDiagnostics: {
              providerAttemptId,
              elapsed,
              modelCall: summarizeModelCallForDebugLog(context.getLatestModelCallSummary()),
              request: summarizeFetchRequestForDebugLog(requestSummary),
              response: {
                status: response.status,
                statusText: response.statusText,
              },
            },
          },
          `Google Vertex request completed for ${context.modelId}`,
        );
      }

      return response;
    } catch (error) {
      context.logger.error(
        {
          chatId: context.chatId,
          modelId: context.modelId,
          providerId: context.providerId,
          providerDiagnostics: {
            providerAttemptId,
            elapsed: Date.now() - startedAt,
            modelCall: context.getLatestModelCallSummary(),
            request: requestSummary,
            transportError: summarizeError(error),
          },
        },
        `Google Vertex request transport failed for ${context.modelId}`,
      );
      throw error;
    }
  }) as FetchLike;
};

const summarizeMessage = (message: BaseMessage, index: number): MessageSummary => {
  const role = normalizeMessageRole(message);
  const summary: MessageSummary = {
    index,
    role,
    content: summarizeMessageContent(message.content),
  };

  if (AIMessage.isInstance(message) && message.tool_calls && message.tool_calls.length > 0) {
    summary.toolCalls = message.tool_calls.map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.name,
      args: summarizeValueShape(toolCall.args),
    }));
  }

  if (AIMessage.isInstance(message) && message.invalid_tool_calls && message.invalid_tool_calls.length > 0) {
    summary.invalidToolCalls = message.invalid_tool_calls.map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.name,
      args: summarizeValueShape(toolCall.args),
      error: typeof toolCall.error === 'string' ? toolCall.error : undefined,
    }));
  }

  if (AIMessage.isInstance(message)) {
    const legacyToolCalls = summarizeLegacyToolCalls(message.additional_kwargs);
    if (legacyToolCalls.length > 0) {
      summary.legacyToolCalls = legacyToolCalls;
    }

    const legacyFunctionCall = summarizeLegacyFunctionCall(message.additional_kwargs);
    if (legacyFunctionCall) {
      summary.legacyFunctionCall = legacyFunctionCall;
    }
  }

  if (ToolMessage.isInstance(message)) {
    summary.toolResult = summarizeToolResult(message);
  }

  return summary;
};

const normalizeMessageRole = (message: BaseMessage): string => {
  const typeGetter = (message as { _getType?: () => string })._getType;
  const type = typeof typeGetter === 'function' ? typeGetter.call(message) : message.constructor.name;
  switch (type) {
    case 'ai': {
      return 'assistant';
    }
    case 'human': {
      return 'user';
    }
    default: {
      return type;
    }
  }
};

const summarizeMessageContent = (content: BaseMessage['content']): unknown => {
  if (typeof content === 'string') {
    return { type: 'text', length: content.length, empty: content.length === 0 };
  }

  if (Array.isArray(content)) {
    return {
      type: 'parts',
      count: content.length,
      parts: content.slice(0, contentPartLimit).map((part) => summarizeContentPart(part)),
    };
  }

  return summarizeValueShape(content);
};

const summarizeContentPart = (part: unknown): unknown => {
  const record = asRecord(part);
  if (!record) {
    return summarizeValueShape(part);
  }

  const type = readString(record, 'type') ?? 'unknown';
  if (type === 'text') {
    return { type, length: readString(record, 'text')?.length ?? 0 };
  }

  if (
    type === 'tool_call' ||
    type === 'tool_use' ||
    type === 'tool_call_chunk' ||
    type === 'input_json_delta' ||
    type === 'server_tool_use'
  ) {
    return {
      type,
      id: readString(record, 'id'),
      name: readString(record, 'name'),
      keys: Object.keys(record).slice(0, keyLimit),
    };
  }

  return {
    type,
    keys: Object.keys(record).slice(0, keyLimit),
  };
};

const summarizeToolResult = (message: ToolMessage): ToolResultSummary => {
  const content = messageContentToString(message.content);
  const parsed = parseJsonObject(content);

  return {
    toolCallId: message.tool_call_id,
    name: typeof message.name === 'string' ? message.name : undefined,
    status: typeof message.status === 'string' ? message.status : undefined,
    contentLength: content.length,
    errorCode: readString(parsed, 'errorCode'),
    toolName: readString(parsed, 'toolName'),
  };
};

const collectMessageDiagnosticFlags = (messages: BaseMessage[]): string[] => {
  const flags = new Set<string>();
  const toolCallIds = new Set<string>();
  const toolResultIds = new Set<string>();

  for (const message of messages) {
    if (AIMessage.isInstance(message)) {
      if (isEmptyAssistantMessage(message)) {
        flags.add('empty_assistant_message');
      }

      for (const toolCall of message.tool_calls ?? []) {
        if (toolCall.id) {
          toolCallIds.add(toolCall.id);
        }
        collectToolArgumentFlags(toolCall.args, flags);
      }

      collectLegacyToolMetadataFlags(message, flags);
    }

    if (ToolMessage.isInstance(message)) {
      if (message.tool_call_id) {
        toolResultIds.add(message.tool_call_id);
      }

      const parsed = parseJsonObject(messageContentToString(message.content));
      const errorCode = readString(parsed, 'errorCode');
      if (errorCode === 'USER_INTERRUPTED' || errorCode === 'CLIENT_DISCONNECTED' || errorCode === 'STREAM_ERROR') {
        flags.add('interrupted_tool_result');
      }
    }
  }

  for (const toolCallId of toolCallIds) {
    if (!toolResultIds.has(toolCallId)) {
      flags.add('missing_tool_result');
    }
  }

  for (const toolResultId of toolResultIds) {
    if (!toolCallIds.has(toolResultId)) {
      flags.add('orphan_tool_result');
    }
  }

  return [...flags].sort();
};

const collectLegacyToolMetadataFlags = (message: AIMessage, flags: Set<string>): void => {
  const legacyToolCalls = summarizeLegacyToolCalls(message.additional_kwargs);
  const legacyFunctionCall = summarizeLegacyFunctionCall(message.additional_kwargs);
  const legacyCount = legacyToolCalls.length + (legacyFunctionCall ? 1 : 0);
  if (legacyCount === 0) {
    return;
  }

  const canonicalToolCalls = message.tool_calls ?? [];
  if (canonicalToolCalls.length === 0) {
    flags.add('legacy_tool_calls_without_canonical_tool_calls');
  }

  if ((message.invalid_tool_calls?.length ?? 0) > 0) {
    flags.add('invalid_tool_call_with_legacy_fallback');
  }

  const legacyCalls = legacyFunctionCall ? [...legacyToolCalls, legacyFunctionCall] : legacyToolCalls;
  if (legacyCalls.some((toolCall) => !toolCall.validName)) {
    flags.add('legacy_empty_tool_call_name');
  }

  if (legacyCalls.some((toolCall) => !toolCall.validArgs)) {
    flags.add('malformed_legacy_tool_call_args');
  }

  if (
    canonicalToolCalls.length > 0 &&
    legacyToolCalls.length > 0 &&
    !legacyMatchesCanonical(legacyToolCalls, canonicalToolCalls)
  ) {
    flags.add('legacy_tool_calls_canonical_divergence');
  }
};

const legacyMatchesCanonical = (
  legacyToolCalls: LegacyToolCallSummary[],
  canonicalToolCalls: NonNullable<AIMessage['tool_calls']>,
): boolean => {
  const canonicalById = new Map(canonicalToolCalls.map((toolCall) => [toolCall.id, toolCall.name]));
  return legacyToolCalls.every((legacyToolCall) => {
    if (!legacyToolCall.id || !legacyToolCall.validName) {
      return false;
    }
    return canonicalById.get(legacyToolCall.id) === legacyToolCall.name;
  });
};

const collectToolArgumentFlags = (args: unknown, flags: Set<string>): void => {
  const record = asRecord(args);
  if (!record) {
    flags.add('non_object_tool_args');
    return;
  }

  const entries = Object.entries(record);
  if (entries.length === 0) {
    flags.add('empty_tool_args');
  }

  for (const [, value] of entries) {
    if (value === undefined) {
      flags.add('undefined_tool_arg');
    }
  }
};

const summarizeLegacyToolCalls = (
  additionalKwargs: AIMessage['additional_kwargs'] | undefined,
): LegacyToolCallSummary[] => {
  const rawToolCalls = (additionalKwargs as Record<string, unknown> | undefined)?.tool_calls;
  if (!Array.isArray(rawToolCalls)) {
    return [];
  }

  return rawToolCalls.flatMap((rawToolCall) => {
    const summary = summarizeLegacyToolCall(rawToolCall);
    return summary ? [summary] : [];
  });
};

const summarizeLegacyFunctionCall = (
  additionalKwargs: AIMessage['additional_kwargs'] | undefined,
): LegacyToolCallSummary | undefined => {
  const functionCall = (additionalKwargs as Record<string, unknown> | undefined)?.function_call;
  if (!functionCall) {
    return undefined;
  }

  return summarizeLegacyFunctionRecord(undefined, functionCall);
};

const summarizeLegacyToolCall = (value: unknown): LegacyToolCallSummary | undefined => {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return summarizeLegacyFunctionRecord(readString(record, 'id'), record['function']);
};

const summarizeLegacyFunctionRecord = (id: string | undefined, value: unknown): LegacyToolCallSummary | undefined => {
  const functionRecord = asRecord(value);
  if (!functionRecord) {
    return undefined;
  }

  const name = readString(functionRecord, 'name');
  const args = summarizeLegacyToolArguments(functionRecord['arguments']);

  return {
    id,
    name,
    args: args.summary,
    validName: typeof name === 'string' && name.trim().length > 0,
    validArgs: args.valid,
  };
};

const summarizeLegacyToolArguments = (value: unknown): { readonly summary: unknown; readonly valid: boolean } => {
  if (value === undefined) {
    return { summary: summarizeValueShape({}), valid: true };
  }

  if (typeof value !== 'string') {
    return { summary: summarizeValueShape(value), valid: isNonArrayRecord(value) };
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return { summary: summarizeValueShape(parsed), valid: isNonArrayRecord(parsed) };
  } catch {
    return { summary: summarizeValueShape(value), valid: false };
  }
};

const isEmptyAssistantMessage = (message: AIMessage): boolean => {
  if (message.tool_calls && message.tool_calls.length > 0) {
    return false;
  }

  if (typeof message.content === 'string') {
    return message.content.length === 0;
  }

  if (Array.isArray(message.content)) {
    return message.content.length === 0;
  }

  return false;
};

const summarizeFetchRequest = (
  input: Parameters<FetchLike>[0],
  init: Parameters<FetchLike>[1] | undefined,
): unknown => {
  const url = extractFetchUrl(input);
  const body = summarizeRequestBody(init?.body ?? undefined);

  return {
    method: init?.method ?? extractFetchMethod(input),
    url: summarizeUrl(url),
    body,
  };
};

const summarizeFetchRequestForDebugLog = (summary: unknown): unknown => {
  const request = asRecord(summary);
  const body = asRecord(request?.['body']);
  const gemini = asRecord(body?.['gemini']);

  return {
    method: request?.['method'],
    url: request?.['url'],
    body: body
      ? {
          kind: body['kind'],
          byteLength: body['byteLength'],
          gemini: gemini
            ? {
                contentCount: gemini['contentCount'],
                diagnosticFlags: gemini['diagnosticFlags'],
                mediaPartCount: gemini['mediaPartCount'],
                functionDeclarationCount: gemini['functionDeclarationCount'],
              }
            : undefined,
        }
      : undefined,
  };
};

const summarizeRequestBody = (body: BodyInit | undefined): unknown => {
  if (body === undefined) {
    return { kind: 'empty' };
  }

  if (typeof body === 'string') {
    const { byteLength } = new TextEncoder().encode(body);
    const parsed = parseJsonObject(body);
    return {
      kind: 'string',
      byteLength,
      gemini: parsed ? summarizeGeminiRequest(parsed) : undefined,
    };
  }

  if (body instanceof URLSearchParams) {
    return { kind: 'url_search_params', byteLength: body.toString().length };
  }

  if (body instanceof ArrayBuffer) {
    return { kind: 'array_buffer', byteLength: body.byteLength };
  }

  if (ArrayBuffer.isView(body)) {
    return { kind: 'typed_array', byteLength: body.byteLength };
  }

  return { kind: body.constructor.name };
};

export const summarizeGeminiRequest = (body: Record<string, unknown>): unknown => {
  const contents = readArray(body, 'contents') ?? [];
  const tools = readArray(body, 'tools') ?? [];
  const functionDeclarations = tools.flatMap((tool) => readArray(asRecord(tool), 'functionDeclarations') ?? []);

  return {
    bodyKeys: Object.keys(body).sort(),
    contentCount: contents.length,
    contents: contents.slice(-messageTailLimit).map((content) => summarizeGeminiContent(content)),
    diagnosticFlags: collectGeminiRequestDiagnosticFlags(contents),
    mediaPartCount: countGeminiMediaParts(contents),
    hasSystemInstruction: body['systemInstruction'] !== undefined,
    generationConfigKeys: Object.keys(asRecord(body['generationConfig']) ?? {}).sort(),
    toolConfigKeys: Object.keys(asRecord(body['toolConfig']) ?? {}).sort(),
    functionDeclarationCount: functionDeclarations.length,
    functionNames: functionDeclarations
      .map((declaration) => readString(asRecord(declaration), 'name'))
      .filter((name): name is string => typeof name === 'string')
      .slice(0, 50),
    schemaKeywordCounts: collectSchemaKeywordCounts(functionDeclarations),
  };
};

const countGeminiMediaParts = (contents: unknown[]): number => {
  let count = 0;

  for (const content of contents) {
    const parts = readArray(asRecord(content), 'parts') ?? [];
    for (const part of parts) {
      const record = asRecord(part);
      if (!record) {
        continue;
      }

      const hasMediaPart = ['inlineData', 'inline_data', 'fileData', 'file_data'].some(
        (key) => asRecord(record[key]) !== undefined,
      );
      if (hasMediaPart) {
        count += 1;
      }
    }
  }

  return count;
};

const collectGeminiRequestDiagnosticFlags = (contents: unknown[]): string[] => {
  const flags = new Set<string>();

  for (const content of contents) {
    const parts = readArray(asRecord(content), 'parts') ?? [];
    for (const part of parts) {
      const partRecord = asRecord(part);
      const functionCall = asRecord(partRecord?.functionCall) ?? asRecord(partRecord?.function_call);
      if (!functionCall) {
        continue;
      }

      const name = readString(functionCall, 'name');
      if (!name || name.trim().length === 0) {
        flags.add('gemini_request_empty_function_call_name');
      }
    }
  }

  return [...flags].sort();
};

const summarizeGeminiContent = (content: unknown): unknown => {
  const record = asRecord(content);
  const parts = readArray(record, 'parts') ?? [];

  return {
    role: readString(record, 'role'),
    partCount: parts.length,
    parts: parts.slice(0, contentPartLimit).map((part) => summarizeGeminiPart(part)),
  };
};

const summarizeGeminiPart = (part: unknown): unknown => {
  const record = asRecord(part);
  if (!record) {
    return summarizeValueShape(part);
  }

  if (typeof record['text'] === 'string') {
    return { type: 'text', length: record['text'].length };
  }

  const inlineData = asRecord(record['inlineData']) ?? asRecord(record['inline_data']);
  if (inlineData) {
    return {
      type: 'inlineData',
      mimeType: readString(inlineData, 'mimeType') ?? readString(inlineData, 'mime_type'),
      dataLength: readString(inlineData, 'data')?.length,
    };
  }

  const fileData = asRecord(record['fileData']) ?? asRecord(record['file_data']);
  if (fileData) {
    return {
      type: 'fileData',
      mimeType: readString(fileData, 'mimeType') ?? readString(fileData, 'mime_type'),
      fileUriHost: summarizeUrl(readString(fileData, 'fileUri') ?? readString(fileData, 'file_uri')),
    };
  }

  const functionCall = asRecord(record['functionCall']) ?? asRecord(record['function_call']);
  if (functionCall) {
    return {
      type: 'functionCall',
      name: readString(functionCall, 'name'),
      args: summarizeValueShape(functionCall['args']),
    };
  }

  const functionResponse = asRecord(record['functionResponse']) ?? asRecord(record['function_response']);
  if (functionResponse) {
    return {
      type: 'functionResponse',
      name: readString(functionResponse, 'name'),
      response: summarizeValueShape(functionResponse['response']),
    };
  }

  return {
    type: 'unknown',
    keys: Object.keys(record).slice(0, keyLimit),
  };
};

const collectSchemaKeywordCounts = (values: unknown[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  const keywordSet = new Set<string>(schemaKeywords);

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    const record = asRecord(value);
    if (!record) {
      return;
    }

    for (const [key, child] of Object.entries(record)) {
      if (keywordSet.has(key)) {
        counts[key] = (counts[key] ?? 0) + 1;
      }
      visit(child);
    }
  };

  visit(values);
  return counts;
};

const summarizeDecodedBody = (body: string | undefined): unknown => {
  if (body === undefined) {
    return { bodyKind: 'unreadable' };
  }

  const decoded = decodeProviderErrorBody(body);
  return {
    bodyKind: decoded.bodyKind,
    httpStatus: decoded.httpStatus,
    providerCode: decoded.providerCode,
    providerStatus: decoded.providerStatus,
    providerMessage: decoded.providerMessage,
    providerReason: decoded.providerReason,
  };
};

const readClonedResponseBody = async (response: Response): Promise<string | undefined> => {
  try {
    return await response.clone().text();
  } catch {
    return undefined;
  }
};

const extractFetchUrl = (input: Parameters<FetchLike>[0]): string | undefined => {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.href;
  }

  if (input instanceof Request) {
    return input.url;
  }

  return undefined;
};

const extractFetchMethod = (input: Parameters<FetchLike>[0]): string | undefined => {
  if (input instanceof Request) {
    return input.method;
  }

  return undefined;
};

const summarizeUrl = (url: string | undefined): unknown => {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    return {
      host: parsed.host,
      pathname: parsed.pathname,
    };
  } catch {
    return '[invalid-url]';
  }
};

const summarizeValueShape = (value: unknown, depth = 0): unknown => {
  if (value === undefined) {
    return { type: 'undefined' };
  }

  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return { type: value === null ? 'null' : typeof value };
  }

  if (typeof value === 'string') {
    return { type: 'string', length: value.length, empty: value.length === 0 };
  }

  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      items: depth >= 2 ? undefined : value.slice(0, 8).map((item) => summarizeValueShape(item, depth + 1)),
    };
  }

  const record = asRecord(value);
  if (!record) {
    return { type: typeof value };
  }

  const keys = Object.keys(record).slice(0, keyLimit);
  return {
    type: 'object',
    keyCount: Object.keys(record).length,
    keys: keys.map((key) => ({
      key,
      value: depth >= 2 ? { type: typeof record[key] } : summarizeValueShape(record[key], depth + 1),
    })),
  };
};

const summarizeError = (error: unknown): unknown => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return summarizeValueShape(error);
};

const parseJsonObject = (value: string): Record<string, unknown> | undefined => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return asRecord(parsed);
  } catch {
    return undefined;
  }
};

const messageContentToString = (content: ToolMessage['content']): string =>
  typeof content === 'string' ? content : JSON.stringify(content);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;

const isNonArrayRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readArray = (record: Record<string, unknown> | undefined, key: string): unknown[] | undefined => {
  const value = record?.[key];
  return Array.isArray(value) ? value : undefined;
};

const readString = (record: Record<string, unknown> | undefined, key: string): string | undefined => {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
};
