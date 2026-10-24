/**
 * The `shell` tool (desktop shell blueprint W4; D1, D2, D13, D23). A direct host tool like the machine tools, not an
 * RPC: it needs the invocation's run, call id and approval, which the RPC dispatcher does not carry.
 *
 * The registry lists it only when the host hands in a {@link ShellClient}, which only the desktop services host does
 * once its contained shell probed ready. The browser, `tau mcp` and the daemon never do, so a call there is unknown.
 *
 * @module
 */
import type {
  ShellInput,
  ShellNotStartedCode,
  ShellOutput,
  ShellToolIdentity,
  ToolInputValidationError,
} from '@taucad/chat';
import { isShellError, shellHostDescription, shellInputSchema } from '@taucad/chat';
import { toolDescriptions, toolName } from '@taucad/chat/constants';
import { toProviderToolJsonSchema } from '@taucad/chat/schemas/provider-tool-schemas';
import { z } from 'zod';

import type { HostToolDefinition, HostToolInvocation, HostToolResult, JsonObject, JsonValue } from '@taucad/agent-host';

/**
 * One call, as the registry hands it to the shell client. Every field comes from the trusted invocation or the host,
 * never from model input. `runId` is required: an unknown run never falls back to the live project (F5).
 *
 * @public
 */
export type ShellRunRequest = Pick<HostToolInvocation, 'toolCallId' | 'signal' | 'approve'> &
  Readonly<{ runId: string; input: ShellInput }>;

/**
 * The narrow, browser-safe client the registry needs (D2): the host's probed shell. `@taucad/host`'s shell service
 * satisfies it.
 *
 * @public
 */
export type ShellClient = Readonly<{
  identity: ShellToolIdentity;
  /** Run one call. Settles once; never throws for a command's own failure. */
  run: (request: ShellRunRequest) => Promise<ShellOutput>;
}>;

/**
 * Where a registry finds the host's shell: the client itself, or a function read at every listing and call for a host
 * whose probe settles after the registry is built.
 *
 * @public
 */
export type ShellSource = ShellClient | (() => ShellClient | undefined);

/**
 * Read a {@link ShellSource}, building each client's definition once.
 *
 * @param source - The registry's shell option.
 * @returns The current client and its definition, or `undefined` while there is none.
 */
export const createShellSource = (
  source: ShellSource | undefined,
): (() => Readonly<{ client: ShellClient; definition: HostToolDefinition }> | undefined) => {
  let cached: Readonly<{ client: ShellClient; definition: HostToolDefinition }> | undefined;
  return () => {
    const client = typeof source === 'function' ? source() : source;
    if (client === undefined) {
      return undefined;
    }
    if (cached?.client !== client) {
      cached = { client, definition: shellToolDefinition(client) };
    }
    return cached;
  };
};

/**
 * The `shell` definition for one host: the shared description plus the line naming this host's language and version.
 *
 * @param client - The host's shell.
 * @returns The tool definition.
 */
export const shellToolDefinition = (client: ShellClient): HostToolDefinition => ({
  name: toolName.shell,
  description: `${toolDescriptions[toolName.shell]}\n\n${shellHostDescription(client.identity)}`,
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- draft-7 JSON Schema is JSON by construction.
  inputSchema: toProviderToolJsonSchema(shellInputSchema) as JsonObject,
  /* A command can write anywhere in the checkout, so a batch runs in call order. */
  executionMode: 'sequential',
});

const notStarted = (code: ShellNotStartedCode, message: string): HostToolResult => ({
  content: { status: 'not-started', code, message },
  isError: true,
});

/**
 * Validate and run one `shell` call through the host's client.
 *
 * @param client - The host's shell.
 * @param invocation - The call.
 * @returns The tool result; `isError` follows {@link isShellError}.
 */
export const invokeShell = async (client: ShellClient, invocation: HostToolInvocation): Promise<HostToolResult> => {
  const parsed = shellInputSchema.safeParse(invocation.input);
  if (!parsed.success) {
    return {
      content: {
        errorCode: 'TOOL_INPUT_VALIDATION_FAILED',
        message: z.prettifyError(parsed.error),
        toolName: invocation.toolName,
        toolCallId: invocation.toolCallId,
        validationErrors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      } satisfies ToolInputValidationError,
      isError: true,
    };
  }
  if (invocation.runId === undefined) {
    return notStarted(
      'checkout-unavailable',
      'This call belongs to no Tau run, so it has no admitted project folder and the command did not run.',
    );
  }
  try {
    const output = await client.run({
      toolCallId: invocation.toolCallId,
      signal: invocation.signal,
      approve: invocation.approve,
      runId: invocation.runId,
      input: parsed.data,
    });
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the shell output is JSON by construction.
    return { content: structuredClone(output) as JsonValue, isError: isShellError(output) };
  } catch (error) {
    /* A pausing approval and a cancelled turn end the attempt; the host records them, not this tool. */
    if (invocation.signal.aborted) {
      throw invocation.signal.reason instanceof Error
        ? invocation.signal.reason
        : new DOMException('The operation was aborted.', 'AbortError');
    }
    throw error;
  }
};
