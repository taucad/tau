// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { JsonObject, JsonValue, ProviderMessage, UserProviderMessage } from '#log/event-types.js';

const interruptCauses = ['USER_INTERRUPTED', 'CLIENT_DISCONNECTED', 'STREAM_ERROR'] as const;
type InterruptCause = (typeof interruptCauses)[number];

const isJsonObject = (value: unknown): value is JsonObject =>
  value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);

type RecoveryToolCall = JsonObject & { readonly id: string; readonly name: string };

const objectContent = (content: JsonValue): JsonObject | undefined => {
  if (isJsonObject(content)) {
    return content;
  }
  if (typeof content !== 'string') {
    return undefined;
  }
  try {
    const parsed = JSON.parse(content) as JsonValue;
    return isJsonObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const interruptCause = (message: ProviderMessage): InterruptCause | undefined => {
  if (message.role !== 'tool-output' || !message.isError) {
    return undefined;
  }
  const code = objectContent(message.content)?.['errorCode'];
  return interruptCauses.find((candidate) => candidate === code);
};

const toolCalls = (message: ProviderMessage | undefined) =>
  message?.role === 'assistant' && Array.isArray(message.content)
    ? message.content.filter(
        (block): block is RecoveryToolCall =>
          isJsonObject(block) &&
          block['type'] === 'toolCall' &&
          typeof block['id'] === 'string' &&
          typeof block['name'] === 'string',
      )
    : [];

const shortHash = async (value: string): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
};

const reminderBody = (input: {
  readonly completedCount: number;
  readonly interruptedCount: number;
  readonly cause: InterruptCause;
}): string => {
  const opening =
    input.cause === 'USER_INTERRUPTED'
      ? 'The previous turn was interrupted by the user.'
      : input.cause === 'CLIENT_DISCONNECTED'
        ? 'The previous turn was cut short by a network drop.'
        : 'The previous turn ended with a stream error.';
  return `${opening} ${input.completedCount} tool call(s)
completed successfully and ${input.interruptedCount} were cancelled before they
finished. Tools that mutate state (file writes, edits, deletes) may have
partially executed.

Before retrying, verify the current state of any file or resource you were
operating on (read_file / list_directory / get_kernel_result) and only then
decide whether to repeat, adjust, or skip the cancelled work. Do NOT assume
the cancelled tools left the system unchanged.`;
};

/** Build the canonical API-compatible reminder for the trailing interrupted tool block. */
export const createInterruptRecoveryMessage = async (input: {
  readonly messages: readonly ProviderMessage[];
  readonly timestamp: number;
}): Promise<UserProviderMessage | undefined> => {
  let index = input.messages.length - 1;
  const outputs: Array<Extract<ProviderMessage, { readonly role: 'tool-output' }>> = [];
  while (index >= 0) {
    const message = input.messages[index]!;
    if (message.role === 'tool-output') {
      outputs.unshift(message);
      index--;
      continue;
    }
    if (message.role === 'tool-input') {
      index--;
      continue;
    }
    break;
  }

  let parent = input.messages[index];
  let calls = toolCalls(parent);
  const interrupted = outputs.filter((message) => interruptCause(message) !== undefined);
  if (calls.length === 0 || interrupted.length === 0) {
    const tail = input.messages.at(-1);
    if (
      tail?.role !== 'assistant' ||
      (tail.metadata?.['stopReason'] !== 'aborted' && tail.metadata?.['stopReason'] !== 'error')
    ) {
      return undefined;
    }
    parent = tail;
    calls = [];
  }

  const tallies = new Map<InterruptCause, number>();
  for (const output of interrupted) {
    const cause = interruptCause(output);
    if (cause) {
      tallies.set(cause, (tallies.get(cause) ?? 0) + 1);
    }
  }
  let cause: InterruptCause = 'CLIENT_DISCONNECTED';
  let causeCount = -1;
  for (const candidate of interruptCauses) {
    const count = tallies.get(candidate) ?? 0;
    if (interrupted.length > 0 && count > causeCount) {
      cause = candidate;
      causeCount = count;
    }
  }
  const byCall = new Map(outputs.map((output) => [output.toolCallId, output]));
  const completedCount = calls.filter((call) => {
    const output = byCall.get(call.id);
    return output !== undefined && interruptCause(output) === undefined;
  }).length;
  const interruptedCount = calls.filter((call) => {
    const output = byCall.get(call.id);
    return output !== undefined && interruptCause(output) !== undefined;
  }).length;
  const seed =
    parent?.id ??
    calls
      .map((call) => call.id)
      .toSorted((left, right) => left.localeCompare(right))
      .join(':');
  const signature = await shortHash(`${seed}:${cause}`);
  const id = `tau:interrupt-recovery:${signature}`;
  if (input.messages.some((message) => message.id === id)) {
    return undefined;
  }
  return {
    id,
    role: 'user',
    content: `<system-reminder>\n${reminderBody({ completedCount, interruptedCount, cause })}\n</system-reminder>`,
    metadata: {
      tauInternal: {
        kind: 'interrupt-recovery',
        anchorId: signature,
        pruning: 'preserve-until-compaction',
      },
      timestamp: input.timestamp,
    },
  };
};
