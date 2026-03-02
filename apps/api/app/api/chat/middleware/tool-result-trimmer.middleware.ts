import { createMiddleware } from 'langchain';
import { ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { PartialDeep } from 'type-fest';
import { toolName } from '@taucad/chat/constants';
import type { ToolOutputRegistry } from '@taucad/chat';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Type for a content shape detector function.
 * Returns true if the parsed content matches the expected shape for a tool.
 */
type ContentShapeDetector = (content: unknown) => boolean;

/**
 * Creates a type-safe trimmer function for a specific tool.
 * The inner function receives properly typed input based on ToolOutputRegistry,
 * while the returned function accepts unknown for use in the registry.
 *
 * The return type uses PartialDeep to allow returning a subset of the original
 * structure with some properties removed (e.g., removing large content fields
 * to reduce token usage). This provides type safety while allowing any depth
 * of the structure to be partially returned, including array elements.
 *
 * @param _toolName - The tool name (used only for type inference)
 * @param fn - The trimmer function with typed input, returns a trimmed structure
 * @returns A function that accepts unknown and returns unknown
 */
function createTrimmer<T extends keyof ToolOutputRegistry>(
  _toolName: T,
  fn: (result: ToolOutputRegistry[T]) => PartialDeep<ToolOutputRegistry[T], { recurseIntoArrays: true }>,
): (result: unknown) => unknown {
  return fn as (result: unknown) => unknown;
}

// =============================================================================
// Content Shape Detectors
// =============================================================================
// These functions detect tool output shapes when message.name is undefined
// (common with messages created by @ai-sdk/langchain adapter).
// Order matters: more specific detectors should be checked first.

/**
 * Helper to check if value is a non-null object.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Checks if an object has a defined (non-undefined) property at runtime.
 * Useful for defensive checks when TypeScript types don't match runtime data
 * (e.g., error responses, malformed data from external sources).
 */
function hasDefined<K extends string>(object: unknown, key: K): boolean {
  return isObject(object) && object[key] !== undefined;
}

/**
 * Checks if content has the shape of TestModelOutput.
 * Unique: has failures array + total count (no other tool has this combination).
 */
function isTestModelShape(content: unknown): boolean {
  if (!isObject(content)) {
    return false;
  }

  return Array.isArray(content['failures']) && typeof content['total'] === 'number';
}

/**
 * Checks if content has the shape of CreateFileOutput or EditFileOutput.
 * Both have diffStats with linesAdded/linesRemoved.
 * We use the same detector for both since they have identical shapes.
 */
function isDiffStatsShape(content: unknown): boolean {
  if (!isObject(content)) {
    return false;
  }

  const { diffStats } = content;
  if (!isObject(diffStats)) {
    return false;
  }

  return typeof diffStats['linesAdded'] === 'number' && typeof diffStats['linesRemoved'] === 'number';
}

/**
 * Checks if content has the shape of GetKernelResultOutput.
 * Unique: has status enum ('ready' | 'error' | 'pending') + optional kernelIssues array.
 */
function isGetKernelResultShape(content: unknown): boolean {
  if (!isObject(content)) {
    return false;
  }

  const { status, kernelIssues } = content;
  if (status !== 'ready' && status !== 'error' && status !== 'pending') {
    return false;
  }

  // KernelIssues is optional, but if present must be an array
  if (kernelIssues !== undefined && !Array.isArray(kernelIssues)) {
    return false;
  }

  return true;
}

/**
 * Checks if content has the shape of ReadFileOutput.
 * Unique: has content string + totalLines number.
 */
function isReadFileShape(content: unknown): boolean {
  if (!isObject(content)) {
    return false;
  }

  return typeof content['content'] === 'string' && typeof content['totalLines'] === 'number';
}

/**
 * Checks if content has the shape of ListDirectoryOutput.
 * Unique: has entries array + path string.
 */
function isListDirectoryShape(content: unknown): boolean {
  if (!isObject(content)) {
    return false;
  }

  return Array.isArray(content['entries']) && typeof content['path'] === 'string';
}

/**
 * Checks if content has the shape of GrepOutput.
 * Unique: has matches array + totalMatches number.
 */
function isGrepShape(content: unknown): boolean {
  if (!isObject(content)) {
    return false;
  }

  return Array.isArray(content['matches']) && typeof content['totalMatches'] === 'number';
}

/**
 * Checks if content has the shape of GlobSearchOutput.
 * Unique: has files array + totalFiles number.
 */
function isGlobSearchShape(content: unknown): boolean {
  if (!isObject(content)) {
    return false;
  }

  return Array.isArray(content['files']) && typeof content['totalFiles'] === 'number';
}

/**
 * Registry of content shape detectors.
 * Maps tool names to functions that detect if content matches that tool's output shape.
 * Used as a fallback when message.name is undefined.
 *
 * Note: create_file and edit_file share the same detector (isDiffStatsShape) since
 * they have identical output shapes. The trimmer for both is also functionally identical.
 */
const contentShapeDetectors: Record<string, ContentShapeDetector> = {
  [toolName.testModel]: isTestModelShape,
  [toolName.createFile]: isDiffStatsShape,
  [toolName.editFile]: isDiffStatsShape,
  [toolName.getKernelResult]: isGetKernelResultShape,
  [toolName.readFile]: isReadFileShape,
  [toolName.listDirectory]: isListDirectoryShape,
  [toolName.grep]: isGrepShape,
  [toolName.globSearch]: isGlobSearchShape,
};

/**
 * Detects the tool name based on the shape of the parsed content.
 * Returns undefined if no matching shape is found.
 */
function detectToolNameFromContent(content: unknown): string | undefined {
  for (const [name, detector] of Object.entries(contentShapeDetectors)) {
    if (detector(content)) {
      return name;
    }
  }

  return undefined;
}

/**
 * Registry of tool result trimmers.
 * Each key is a tool name, and the value is a function that trims the result.
 *
 * These trimmers remove redundant data that the LLM doesn't need to see again,
 * significantly reducing token usage in long conversations.
 *
 * Uses createTrimmer for type-safe trimmer definitions - the inner function
 * receives properly typed input based on ToolOutputRegistry.
 *
 * Note: Tool results are validated upstream via the ChatController / ChatRpc service
 * (using Zod schemas) before being stored in messages. Error results
 * (ToolExecutionError, ToolValidationError) are serialized differently and won't
 * match the content shape detectors, so trimmers won't be called for them.
 */
const toolResultTrimmers: Record<string, (result: unknown) => unknown> = {
  /**
   * Trims the test model result by removing the 'passed' count.
   * The LLM can infer it from total - failures.length if needed.
   */
  [toolName.testModel]: createTrimmer(toolName.testModel, (result) => {
    // Guard: return unchanged if expected structure is missing (error/malformed response)
    if (!Array.isArray(result.failures) || typeof result.total !== 'number') {
      return result;
    }

    return {
      failures: result.failures,
      total: result.total,
      // REMOVED: passed, passes - LLM can infer from total - failures.length
    };
  }),

  /**
   * Trims create_file result by removing full file content from diffStats.
   * The LLM just wrote this content, so it doesn't need to see it again.
   * Keeps only line change counts.
   */
  [toolName.createFile]: createTrimmer(toolName.createFile, (result) => {
    // Guard: return unchanged if diffStats is missing (error/malformed response)
    // Uses hasDefined to bypass TypeScript's type narrowing for runtime safety
    if (!hasDefined(result, 'diffStats')) {
      return result;
    }

    return {
      ...(result.message ? { message: result.message } : {}),
      diffStats: {
        linesAdded: result.diffStats.linesAdded,
        linesRemoved: result.diffStats.linesRemoved,
        // REMOVED: originalContent, modifiedContent - LLM just wrote this
      },
    };
  }),

  /**
   * Trims edit_file result by removing full file content from diffStats.
   * The LLM just wrote this content, so it doesn't need to see it again.
   * Keeps only line change counts.
   */
  [toolName.editFile]: createTrimmer(toolName.editFile, (result) => {
    // Guard: return unchanged if diffStats is missing (error/malformed response)
    // Uses hasDefined to bypass TypeScript's type narrowing for runtime safety
    if (!hasDefined(result, 'diffStats')) {
      return result;
    }

    return {
      diffStats: {
        linesAdded: result.diffStats.linesAdded,
        linesRemoved: result.diffStats.linesRemoved,
        // REMOVED: originalContent, modifiedContent - LLM just wrote this
      },
    };
  }),

  /**
   * Trims get_kernel_result by removing verbose stack traces.
   * The message and location are sufficient for debugging.
   */
  [toolName.getKernelResult]: createTrimmer(toolName.getKernelResult, (result) => {
    // Guard: return unchanged if status is missing (error/malformed response)
    // Uses hasDefined to bypass TypeScript's type narrowing for runtime safety
    if (!hasDefined(result, 'status')) {
      return result;
    }

    return {
      status: result.status,
      ...(result.kernelIssues
        ? {
            kernelIssues: result.kernelIssues.map((issue) => ({
              message: issue.message,
              ...(issue.location ? { location: issue.location } : {}),
              severity: issue.severity,
              ...(issue.type ? { type: issue.type } : {}),
              // Keep stack and stackFrames - important for LLM to debug error origins
              ...(issue.stack ? { stack: issue.stack } : {}),
              ...(issue.stackFrames ? { stackFrames: issue.stackFrames } : {}),
            })),
          }
        : {}),
    };
  }),
};

/**
 * Type guard to check if a message is a ToolMessage or a deserialized plain object
 * that represents a ToolMessage.
 *
 * Handles three cases:
 * 1. Actual ToolMessage instances (via ToolMessage.isInstance)
 * 2. Plain objects deserialized from checkpoint storage with type: "tool"
 * 3. Messages that have getType method returning "tool" (deprecated LangChain pattern)
 */
function isToolMessage(message: BaseMessage): message is ToolMessage {
  // Check for actual ToolMessage instances first
  if (ToolMessage.isInstance(message)) {
    return true;
  }

  // Check for deserialized plain objects with type: "tool"
  // These lose their prototype chain when stored/loaded from PostgresSaver
  // Cast through unknown to access properties on potentially deserialized objects
  const messageRecord = message as unknown as Record<string, unknown>;

  // Check for type property (present on deserialized messages)
  if (messageRecord['type'] === 'tool') {
    return true;
  }

  // Check for getType method (deprecated but still used in some places)
  if (typeof messageRecord['getType'] === 'function') {
    return (messageRecord['getType'] as () => string)() === 'tool';
  }

  return false;
}

/**
 * Attempts to parse JSON content from a tool message.
 * Returns undefined if parsing fails.
 */
function parseToolContent(content: string): unknown | undefined {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Trims tool message content if a trimmer is registered for the tool.
 * Falls back to content-based detection when message.name is undefined
 * (common with messages created by `@ai-sdk/langchain` adapter).
 *
 * Handles both proper ToolMessage instances and deserialized plain objects.
 *
 * @param message - The tool message to trim
 */
function trimToolMessage(message: ToolMessage): BaseMessage {
  // Access properties defensively to handle both ToolMessage and plain objects
  const messageRecord = message as unknown as Record<string, unknown>;
  const {
    content,
    name,
    tool_call_id: toolCallId,
  } = messageRecord as {
    content: unknown;
    name: string | undefined;
    tool_call_id: string;
  };

  // Handle multi-modal content (arrays with image blocks from screenshot tool)
  if (Array.isArray(content)) {
    const hasImages = content.some(
      (block: unknown) => isObject(block) && (block['type'] === 'image_url' || block['type'] === 'image'),
    );

    if (hasImages) {
      const trimmedBlocks = (content as Array<Record<string, unknown>>).map((block) => {
        if (block['type'] === 'image_url' || block['type'] === 'image') {
          return { type: 'text', text: '[screenshot image - previously captured]' };
        }

        return block;
      });

      return new ToolMessage({
        content: trimmedBlocks as ToolMessage['content'],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_call_id: toolCallId,
        name,
      });
    }

    return message;
  }

  // Only handle string content (JSON)
  if (typeof content !== 'string') {
    return message;
  }

  const parsed = parseToolContent(content);
  if (parsed === undefined) {
    return message;
  }

  // Try to find trimmer by message.name first, fall back to content detection
  const toolNameValue = name ?? detectToolNameFromContent(parsed);

  // Apply trimmer (if available)
  const trimmer = toolNameValue ? toolResultTrimmers[toolNameValue] : undefined;
  const trimmed = trimmer ? trimmer(parsed) : parsed;

  // If no trimming was done, return original message
  if (trimmed === parsed) {
    return message;
  }

  // Create a proper ToolMessage instance with trimmed content
  // This also rehydrates deserialized plain objects into proper instances
  return new ToolMessage({
    content: JSON.stringify(trimmed),
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
    tool_call_id: toolCallId,
    name: toolNameValue,
  });
}

/**
 * Converts a screenshot tool ToolMessage from schema output format
 * `{"images":[{view,dataUrl},...]}` into multi-modal content blocks
 * so the LLM can visually process the captured images.
 */
function injectScreenshotImages(message: ToolMessage): ToolMessage {
  const messageRecord = message as unknown as Record<string, unknown>;
  const { content, name, tool_call_id: toolCallId } = messageRecord as {
    content: unknown;
    name: string | undefined;
    tool_call_id: string;
  };

  if (typeof content !== 'string') {
    return message;
  }

  const parsed = parseToolContent(content);
  if (!isObject(parsed) || !Array.isArray(parsed['images'])) {
    return message;
  }

  const images = parsed['images'] as Array<Record<string, unknown>>;
  const imageBlocks = images
    .filter((img) => typeof img['dataUrl'] === 'string')
    .map((img) => ({
      type: 'image_url' as const,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain multimodal content block format
      image_url: { url: img['dataUrl'] as string },
    }));

  if (imageBlocks.length === 0) {
    return message;
  }

  return new ToolMessage({
    content: [{ type: 'text', text: `Captured ${imageBlocks.length} screenshot(s)` }, ...imageBlocks],
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
    tool_call_id: toolCallId,
    name,
  });
}

/**
 * Finds the index of the last screenshot tool ToolMessage in the messages array.
 */
function findLastScreenshotIndex(messages: BaseMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (!isToolMessage(message)) {
      continue;
    }

    const record = message as unknown as Record<string, unknown>;
    const name = record['name'] as string | undefined;

    if (name === toolName.screenshot) {
      return index;
    }

    if (typeof record['content'] === 'string') {
      const parsed = parseToolContent(record['content'] as string);
      if (isObject(parsed) && Array.isArray(parsed['images'])) {
        return index;
      }
    }
  }

  return -1;
}

/**
 * Middleware that trims tool call results before sending to the LLM.
 *
 * Uses the `wrapModelCall` hook to intercept model requests and trim
 * ToolMessage content based on registered trimmers for each tool.
 *
 * This helps reduce token usage by removing unnecessary data
 * from the message history that the LLM doesn't need to see again.
 *
 * For screenshot tool results: the latest screenshot is converted to
 * multi-modal image content blocks so the LLM can see the images.
 * Older screenshot results are trimmed to text placeholders.
 *
 * Trimming is applied uniformly to all messages to ensure stable content
 * for Anthropic prompt caching. Consistent content enables cache hits
 * across conversation turns.
 */
export const toolResultTrimmerMiddleware = createMiddleware({
  name: 'ToolResultTrimmer',

  async wrapModelCall(request, handler) {
    const { messages } = request;

    const lastScreenshotIndex = findLastScreenshotIndex(messages);

    const trimmedMessages = messages.map((message, index) => {
      if (!isToolMessage(message)) {
        return message;
      }

      // Inject images for the latest screenshot tool result so LLM can see them
      if (index === lastScreenshotIndex) {
        return injectScreenshotImages(message);
      }

      return trimToolMessage(message);
    });

    return handler({
      ...request,
      messages: trimmedMessages,
    });
  },
});
