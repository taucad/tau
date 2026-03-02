import type { useChat } from '@ai-sdk/react';
import type {
  MessageRole,
  MyMetadata,
  MyMessagePart,
  MyToolPart,
  MyUIMessage,
  ToolInvocation,
  MyTools,
  UsageData,
} from '@taucad/chat';
import { isToolPart } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { idPrefix } from '@taucad/types/constants';
import { DefaultChatTransport, getStaticToolName } from 'ai';
import { generatePrefixedId } from '@taucad/utils/id';
import { ENV } from '#environment.config.js';
import { metaConfig } from '#constants/meta.constants.js';
import { formatExportDate } from '#utils/date.utils.js';

export const useChatConstants: Parameters<typeof useChat>[0] = {
  transport: new DefaultChatTransport({
    api: `${ENV.TAU_API_URL}/v1/chat`,
    credentials: 'include',
  }),
};

/**
 * Extract the mime type from a data URL
 *
 * @example
 * extractMimeTypeFromDataUrl('data:image/webp;base64,UklGRu6VAQBXR')
 * // -> 'image/webp'
 *
 * @param dataUrl
 * @returns
 */
const extractMimeTypeFromDataUrl = (dataUrl: string): string => {
  const mimeType = dataUrl.split(',')[0]?.split(':')[1]?.split(';')[0];
  if (!mimeType) {
    throw new Error('Invalid data URL');
  }

  return mimeType;
};

/**
 * The maximum number of characters to include in a snippet of web search results.
 */
const maxSnippetLength = 200;

const joinLines = (...lines: Array<string | undefined | false>): string => lines.filter(Boolean).join('\n');

const serializeToolState = (part: { state: string; errorText?: string }): string | undefined => {
  switch (part.state) {
    case 'input-streaming': {
      return '[Streaming...]';
    }

    case 'input-available': {
      return '[Pending...]';
    }

    case 'output-error': {
      return `[Error: ${part.errorText}]`;
    }

    default: {
      return undefined;
    }
  }
};

type ToolOutputOf<T extends keyof MyTools> = Extract<ToolInvocation<T>, { state: 'output-available' }>['output'];

type ToolSerializer<T extends keyof MyTools> = {
  readonly input: (input: NonNullable<ToolInvocation<T>['input']>) => string;
  readonly output: (output: ToolOutputOf<T>) => string;
};

const toolSerializers = {
  [toolName.webSearch]: {
    input: (input) => `query: ${input.query}`,
    output: (output) =>
      output
        .map(
          (result) =>
            `- [${result.title}](${result.url})\n  ${result.content.slice(0, maxSnippetLength)}${result.content.length > maxSnippetLength ? '...' : ''}`,
        )
        .join('\n'),
  },
  [toolName.webBrowser]: {
    input: (input) =>
      joinLines(`urls: ${(input.urls ?? []).join(', ')}`, input.query ? `query: ${input.query}` : undefined),
    output: (output) => output.map((result) => `- [${result.url}]\n  ${result.content.slice(0, 200)}...`).join('\n'),
  },
  [toolName.editFile]: {
    input: (input) => `targetFile: ${input.targetFile}\ncodeEdit: <${input.codeEdit?.length ?? 0} chars>`,
    output(output) {
      const { diffStats } = output;
      const lines = [`+${diffStats.linesAdded}/-${diffStats.linesRemoved} lines`];
      if (diffStats.modifiedContent.length > 0) {
        lines.push('```', diffStats.modifiedContent, '```');
      }

      return joinLines(...lines);
    },
  },
  [toolName.testModel]: {
    input: () => '',
    output(output) {
      const lines = [`${output.passed}/${output.total} passed`];
      for (const failure of output.failures) {
        lines.push(`- FAIL: ${failure.requirement}`, `  ${failure.reason}`);
      }

      return joinLines(...lines);
    },
  },
  [toolName.editTests]: {
    input: (input) => `codeEdit: <${input.codeEdit?.length ?? 0} chars>`,
    output(output) {
      const { diffStats } = output;
      const lines = [`+${diffStats.linesAdded}/-${diffStats.linesRemoved} lines`];
      if (diffStats.modifiedContent.length > 0) {
        lines.push('```', diffStats.modifiedContent, '```');
      }

      return joinLines(...lines);
    },
  },
  [toolName.transferToCadExpert]: {
    input: () => '',
    output: (output) => output,
  },
  [toolName.transferToResearchExpert]: {
    input: () => '',
    output: (output) => output,
  },
  [toolName.transferBackToSupervisor]: {
    input: () => '',
    output: (output) => output,
  },
  [toolName.readFile]: {
    input: (input) =>
      joinLines(
        `targetFile: ${input.targetFile}`,
        input.offset === undefined ? undefined : `offset: ${input.offset}`,
        input.limit === undefined ? undefined : `limit: ${input.limit}`,
      ),
    output: (output) => `Line ${output.startLine}:\n\`\`\`\n${output.content}\n\`\`\``,
  },
  [toolName.listDirectory]: {
    input: (input) => `path: ${input.path}`,
    output(output) {
      const header = output.path ? `Path: ${output.path}\n` : '';
      const list = output.entries.map((entry) => `  ${entry.type === 'dir' ? '[dir]' : ''} ${entry.name}`).join('\n');

      return header + list;
    },
  },
  [toolName.createFile]: {
    input: (input) => `targetFile: ${input.targetFile}\ncontent: <${input.content?.length ?? 0} chars>`,
    output(output) {
      const lines = [`+${output.diffStats.linesAdded}/-${output.diffStats.linesRemoved} lines`];
      if (output.diffStats.modifiedContent.length > 0) {
        lines.push('```', output.diffStats.modifiedContent, '```');
      }

      return joinLines(output.message, ...lines);
    },
  },
  [toolName.deleteFile]: {
    input: (input) => `targetFile: ${input.targetFile}`,
    output: (output) => output.message,
  },
  [toolName.grep]: {
    input: (input) =>
      joinLines(
        `pattern: ${input.pattern}`,
        input.path ? `path: ${input.path}` : undefined,
        input.caseSensitive ? 'caseSensitive: true' : undefined,
      ),
    output: (output) =>
      joinLines(
        `Total: ${output.totalMatches}`,
        output.matches.map((match) => `${match.file}:${match.line}: ${match.content}`).join('\n'),
      ),
  },
  [toolName.globSearch]: {
    input: (input) => joinLines(`pattern: ${input.pattern}`, input.path ? `path: ${input.path}` : undefined),
    output: (output) => joinLines(`Total: ${output.totalFiles}`, output.files.join('\n')),
  },
  [toolName.getKernelResult]: {
    input: (input) => `targetFile: ${input.targetFile}`,
    output(output) {
      const lines = [`Status: ${output.status}`];
      if (output.kernelIssues && output.kernelIssues.length > 0) {
        const issues = output.kernelIssues.map((issue) => `  - ${issue.message}`).join('\n');
        lines.push('Issues:', issues);
      }

      return joinLines(...lines);
    },
  },
  [toolName.screenshot]: {
    input: (input) => `mode: ${input.mode}`,
    output: (output) => `Captured ${output.images.length} image(s)`,
  },
} satisfies { [K in keyof MyTools]: ToolSerializer<K> };

const serializeToolPart = (part: MyToolPart): string => {
  const name = getStaticToolName<MyTools>(part);
  const serializer = toolSerializers[name];
  const inputString =
    part.state !== 'input-streaming' && part.input !== undefined
      ? serializer.input(part.input as NonNullable<typeof part.input>)
      : '';
  const resultString =
    serializeToolState(part) ??
    (part.state === 'output-available' ? (serializer as ToolSerializer<keyof MyTools>).output(part.output) : '');

  return joinLines(
    `<tool_call name="${name}">`,
    inputString,
    '</tool_call>',
    '<tool_result>',
    resultString,
    '</tool_result>',
  );
};

function serializePart(part: MyMessagePart): string {
  switch (part.type) {
    case 'text': {
      return part.text;
    }

    case 'reasoning': {
      return `<thinking>\n${part.text}\n</thinking>`;
    }

    case 'step-start': {
      return '';
    }

    case 'file': {
      const label = part.filename ? `Attached file: ${part.filename}` : 'Attached image';
      return `[${label} (${part.mediaType})]`;
    }

    case 'source-url': {
      const title = part.title ?? part.url;
      return `[${title}](${part.url})`;
    }

    case 'source-document': {
      return `[Document: ${part.title}]`;
    }

    case 'data-usage': {
      // Usage is aggregated in serializeMessage; no per-part segment
      return '';
    }

    case 'dynamic-tool': {
      const rawInput = part.input;
      const inputString =
        rawInput === null
          ? '(none)'
          : typeof rawInput === 'object'
            ? JSON.stringify(rawInput, null, 2)
            : typeof rawInput === 'string'
              ? rawInput
              : `[Unserializable input: ${Object.prototype.toString.call(rawInput)}]`;
      const resultString =
        part.state === 'output-error'
          ? `[Error: ${part.errorText}]`
          : part.state === 'output-available' && part.output !== undefined
            ? typeof part.output === 'string'
              ? part.output
              : JSON.stringify(part.output, null, 2)
            : part.state === 'input-streaming'
              ? '[Streaming...]'
              : '[Pending...]';
      return joinLines(
        `<tool_call name="${part.toolName}">`,
        'input:',
        inputString,
        '</tool_call>',
        '<tool_result>',
        resultString,
        '</tool_result>',
      );
    }

    default: {
      if (isToolPart(part)) {
        return serializeToolPart(part);
      }

      const _exhaustiveCheck: never = part;
      return String(_exhaustiveCheck);
    }
  }
}

function aggregateUsage(usageParts: UsageData[]): string {
  if (usageParts.length === 0) {
    return '';
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let totalCost = 0;
  for (const d of usageParts) {
    inputTokens += d.inputTokens;
    outputTokens += d.outputTokens;
    totalCost += d.totalCost;
  }

  const model = usageParts.at(-1)?.model ?? '';
  const cost = totalCost > 0 ? ` | Cost: $${totalCost.toFixed(4)}` : '';

  return `Model: ${model} | Tokens: ${inputTokens} in / ${outputTokens} out${cost}`;
}

/**
 * Serialize a UI message into a single string suitable for copy-paste into a new chat
 * or for sharing with other chat services (e.g. for debugging). The format is
 * human-readable and AI-parseable (markdown + XML-style tool_call/tool_result blocks).
 * Data-usage parts are aggregated (tokens and cost summed) and emitted once at the end.
 *
 * @param message - The message to serialize
 * @returns Serialized string with all parts (text, reasoning, files, tool calls, usage) represented
 */
export function serializeMessage(message: MyUIMessage): string {
  const segments: string[] = [];
  const usageParts: UsageData[] = [];

  for (const part of message.parts) {
    if (part.type === 'data-usage') {
      usageParts.push(part.data);
      continue;
    }

    const segment = serializePart(part);
    if (segment.length > 0) {
      segments.push(segment);
    }
  }

  const aggregatedUsage = aggregateUsage(usageParts);
  if (aggregatedUsage.length > 0) {
    segments.push(aggregatedUsage);
  }

  return segments.join('\n\n');
}

/**
 * Serialize an array of messages into a markdown transcript with role headers,
 * horizontal rule separators, and an export metadata header.
 * Uses raw message content; UI-specific edits are not applied.
 *
 * @param messages - Array of UI messages
 * @param title - Title for the transcript (e.g. the chat name)
 * @returns Markdown transcript string
 */
export function serializeTranscript(messages: MyUIMessage[], title: string): string {
  const exportDate = formatExportDate(new Date());
  const header = `# ${title}\n\n_Exported on ${exportDate} from ${metaConfig.userAgent}_`;

  if (messages.length === 0) {
    return header;
  }

  const blocks = messages
    .map((message) => {
      const role = message.role.charAt(0).toUpperCase() + message.role.slice(1);
      const body = serializeMessage(message);
      return body.length > 0 ? `**${role}**\n\n${body}` : `**${role}**`;
    })
    .join('\n\n---\n\n');

  return `${header}\n\n---\n\n${blocks}\n`;
}

/**
 * Transitions all in-progress tool parts in the last assistant message
 * to output-error state. Used when a stream is interrupted by the user
 * (stop-then-send flow).
 *
 * This ensures interrupted tools show the error state in the UI via
 * the existing `<ChatToolError>` component used by all tool renderers.
 *
 * Only modifies the last message if it's an assistant message with
 * tool parts in `input-streaming` or `input-available` state.
 * Returns the original array if no changes are needed.
 */
export function finalizeInterruptedToolParts(messages: MyUIMessage[]): MyUIMessage[] {
  const lastMessage = messages.at(-1);
  if (lastMessage?.role !== 'assistant') {
    return messages;
  }

  const hasInterruptedTools = lastMessage.parts.some(
    (part) => isToolPart(part) && (part.state === 'input-streaming' || part.state === 'input-available'),
  );

  if (!hasInterruptedTools) {
    return messages;
  }

  const updatedParts = lastMessage.parts.map((part) => {
    if (isToolPart(part) && (part.state === 'input-streaming' || part.state === 'input-available')) {
      // Assertion needed: input-streaming parts have PartialObject<Schema> for `input`,
      // but output-error expects the full Schema. The partial input is acceptable
      // for display purposes since the tool was interrupted.
      const errorText = JSON.stringify({
        errorCode: 'USER_INTERRUPTED',
        message: 'Interrupted by user.',
        toolCallId: part.toolCallId,
      });
      const interruptedPart = {
        ...part,
        state: 'output-error' as const,
        errorText,
      };
      return interruptedPart as MyMessagePart;
    }

    return part;
  });

  return [...messages.slice(0, -1), { ...lastMessage, parts: updatedParts }];
}

// Helper function to create a new message
export function createMessage({
  id,
  content,
  role,
  metadata,
  imageUrls = [],
}: {
  id?: string;
  content: string;
  role: MessageRole;
  metadata: MyMetadata;
  imageUrls?: string[];
}): MyUIMessage {
  const trimmedContent = content.trim();

  return {
    id: id ?? generatePrefixedId(idPrefix.message),
    role,
    parts: [
      // Always add image parts first so they are rendered first in the UI
      ...imageUrls.map((url) => ({
        type: 'file' as const,
        url,
        mediaType: extractMimeTypeFromDataUrl(url),
      })),
      // Only add text part if there is text content
      ...(trimmedContent.length > 0
        ? [
            {
              type: 'text' as const,
              text: trimmedContent,
            },
          ]
        : []),
    ],
    metadata: { ...metadata, createdAt: Date.now() },
  };
}
