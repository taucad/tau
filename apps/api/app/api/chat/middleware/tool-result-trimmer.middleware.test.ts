import { ToolMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { toolName } from '@taucad/chat/constants';
import type { TestModelOutput, TestFailure } from '@taucad/testing';
import type { CreateFileOutput, EditFileOutput, GetKernelResultOutput, ScreenshotOutput } from '@taucad/chat';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toolResultTrimmerMiddleware } from '#api/chat/middleware/tool-result-trimmer.middleware.js';

const defaultTargetFile = 'main.scad';

/**
 * Creates a mock TestModelOutput with the given failures.
 *
 * Per the multi-file test.json migration every failure/pass carries a
 * `targetFile`. Tests pass already-tagged failures in; this helper tags any
 * passes with the same default file so fixtures stay terse.
 */
function createTestModelOutput(failures: TestFailure[], passed: number): TestModelOutput {
  return {
    failures,
    passes: Array.from({ length: passed }, (_, index) => ({
      id: `pass_${index + 1}`,
      requirement: `Passed requirement ${index + 1}`,
      targetFile: defaultTargetFile,
    })),
    passed,
    total: failures.length + passed,
    geometryArtifactPaths: { [defaultTargetFile]: `.tau/artifacts/call_default__${defaultTargetFile}.glb` },
  };
}

/**
 * Creates a ToolMessage with TestModelOutput content.
 * @param failures - Array of test failures
 * @param passed - Number of passed tests
 * @param options - Additional options
 * @param options.includeName - Whether to include the tool name
 * @param options.toolCallId - The tool call ID
 */
function createTestModelToolMessage(
  failures: TestFailure[],
  passed: number,
  options: { includeName?: boolean; toolCallId?: string } = {},
): ToolMessage {
  const { includeName = true, toolCallId = 'call_123' } = options;
  const output = createTestModelOutput(failures, passed);

  return new ToolMessage({
    content: JSON.stringify(output),
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
    tool_call_id: toolCallId,
    ...(includeName ? { name: toolName.testModel } : {}),
  });
}

/**
 * Creates a plain object that looks like a deserialized ToolMessage.
 * This simulates what happens when messages are loaded from PostgresSaver checkpoint.
 */
function createDeserializedToolMessage(
  failures: TestFailure[],
  passed: number,
  options: { includeName?: boolean; toolCallId?: string } = {},
): unknown {
  const { includeName = true, toolCallId = 'call_123' } = options;
  const output = createTestModelOutput(failures, passed);

  return {
    type: 'tool',
    content: JSON.stringify(output),
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
    tool_call_id: toolCallId,
    ...(includeName ? { name: toolName.testModel } : {}),
    id: ['tool', toolCallId],
    lc: 1,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
    lc_serializable: true,
  };
}

/**
 * Helper to parse the content of a ToolMessage.
 */
function parseTestModelOutput(message: ToolMessage): TestModelOutput {
  const content = message.content as string;

  return JSON.parse(content) as TestModelOutput;
}

// Helper type for the request shape we're testing
type TestRequest = { messages: BaseMessage[] };

// Helper to call wrapModelCall with proper typing
async function callWrapModelCall(request: TestRequest, handler: ReturnType<typeof vi.fn>): Promise<void> {
  const { wrapModelCall } = toolResultTrimmerMiddleware;
  if (!wrapModelCall) {
    throw new Error('wrapModelCall is not defined on middleware');
  }

  // Cast to the expected types - in tests we only care about messages
  await wrapModelCall(request as Parameters<typeof wrapModelCall>[0], handler as Parameters<typeof wrapModelCall>[1]);
}

describe('toolResultTrimmerMiddleware', () => {
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handler = vi.fn().mockResolvedValue({ content: 'response' });
  });

  describe('single message - with tool name', () => {
    it('should trim passed count from TestModelOutput when message has tool name', async () => {
      const failures: TestFailure[] = [
        {
          id: 'req_1',
          requirement: 'Model should be a sphere',
          reason: 'Model is a cube',
          suggestion: 'Use sphere() primitive',
          targetFile: defaultTargetFile,
        },
      ];
      const toolMessage = createTestModelToolMessage(failures, 3);

      await callWrapModelCall({ messages: [toolMessage] }, handler);

      expect(handler).toHaveBeenCalledTimes(1);
      const [request] = handler.mock.calls[0] as [TestRequest];
      const trimmedMessage = request.messages[0] as ToolMessage;

      expect(ToolMessage.isInstance(trimmedMessage)).toBe(true);
      const parsed = parseTestModelOutput(trimmedMessage);
      // Passed should be removed
      expect(parsed.passed).toBeUndefined();
      // Failures and total should be preserved
      expect(parsed.failures).toHaveLength(1);
      expect(parsed.total).toBe(4);
    });
  });

  describe('single message - without tool name (content-based detection)', () => {
    it('should trim passed count from TestModelOutput using content shape detection', async () => {
      const failures: TestFailure[] = [];
      // Simulate @ai-sdk/langchain behavior: no name property set
      const toolMessage = createTestModelToolMessage(failures, 5, { includeName: false });

      await callWrapModelCall({ messages: [toolMessage] }, handler);

      expect(handler).toHaveBeenCalledTimes(1);
      const [request] = handler.mock.calls[0] as [TestRequest];
      const trimmedMessage = request.messages[0] as ToolMessage;

      expect(ToolMessage.isInstance(trimmedMessage)).toBe(true);
      const parsed = parseTestModelOutput(trimmedMessage);
      expect(parsed.passed).toBeUndefined();
      expect(parsed.failures).toHaveLength(0);
      expect(parsed.total).toBe(5);
    });
  });

  describe('multi-message chat - multiple tool messages', () => {
    it('should trim passed count from all TestModelOutput messages in conversation', async () => {
      const failures1: TestFailure[] = [
        { id: 'req_1', requirement: 'Test 1', reason: 'Failed', suggestion: 'Fix it', targetFile: defaultTargetFile },
      ];
      const failures2: TestFailure[] = [];

      const messages: BaseMessage[] = [
        new HumanMessage('Build a sphere'),
        new AIMessage({
          content: '',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_calls: [{ id: 'call_1', name: toolName.testModel, args: {} }],
        }),
        createTestModelToolMessage(failures1, 2, { toolCallId: 'call_1' }),
        new AIMessage('Fixed the issue, testing again'),
        new AIMessage({
          content: '',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_calls: [{ id: 'call_2', name: toolName.testModel, args: {} }],
        }),
        createTestModelToolMessage(failures2, 3, { toolCallId: 'call_2' }),
        new HumanMessage('Great!'),
      ];

      await callWrapModelCall({ messages }, handler);

      expect(handler).toHaveBeenCalledTimes(1);
      const [request] = handler.mock.calls[0] as [TestRequest];

      // Find the tool messages and verify they were trimmed
      const toolMessages = request.messages.filter((message) => ToolMessage.isInstance(message)) as ToolMessage[];
      expect(toolMessages).toHaveLength(2);

      for (const toolMessage of toolMessages) {
        const parsed = parseTestModelOutput(toolMessage);
        expect(parsed.passed).toBeUndefined();
      }
    });

    it('should trim passed count from tool messages without name in multi-message chat', async () => {
      const failures1: TestFailure[] = [
        { id: 'req_1', requirement: 'Test 1', reason: 'Failed', suggestion: 'Fix it', targetFile: defaultTargetFile },
      ];
      const failures2: TestFailure[] = [];

      const messages: BaseMessage[] = [
        new HumanMessage('Check the model'),
        // Simulating messages from @ai-sdk/langchain adapter (no name)
        createTestModelToolMessage(failures1, 2, { includeName: false, toolCallId: 'call_1' }),
        new AIMessage('Fixing...'),
        createTestModelToolMessage(failures2, 3, { includeName: false, toolCallId: 'call_2' }),
      ];

      await callWrapModelCall({ messages }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      const toolMessages = request.messages.filter((message) => ToolMessage.isInstance(message)) as ToolMessage[];

      expect(toolMessages).toHaveLength(2);
      for (const toolMessage of toolMessages) {
        const parsed = parseTestModelOutput(toolMessage);
        expect(parsed.passed).toBeUndefined();
      }
    });
  });

  describe('deserialized messages from checkpoint', () => {
    it('should trim passed count from deserialized ToolMessage objects', async () => {
      const failures: TestFailure[] = [
        { id: 'req_1', requirement: 'Test 1', reason: 'Failed', suggestion: 'Fix it', targetFile: defaultTargetFile },
      ];
      // This simulates a message loaded from PostgresSaver that lost its prototype
      const deserializedMessage = createDeserializedToolMessage(failures, 2);

      await callWrapModelCall({ messages: [deserializedMessage as BaseMessage] }, handler);

      expect(handler).toHaveBeenCalledTimes(1);
      const [request] = handler.mock.calls[0] as [TestRequest];
      const trimmedMessage = request.messages[0];

      // The message should be detected as a ToolMessage and trimmed
      const { content } = trimmedMessage as { content: string };
      const parsed = JSON.parse(content) as TestModelOutput;
      expect(parsed.passed).toBeUndefined();
      expect(parsed.failures).toHaveLength(1);
      expect(parsed.total).toBe(3);
    });

    it('should trim deserialized messages without name property', async () => {
      const failures: TestFailure[] = [];
      const deserializedMessage = createDeserializedToolMessage(failures, 5, { includeName: false });

      await callWrapModelCall({ messages: [deserializedMessage as BaseMessage] }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      const message = request.messages[0] as { content: string };
      const parsed = JSON.parse(message.content) as TestModelOutput;

      expect(parsed.passed).toBeUndefined();
      expect(parsed.total).toBe(5);
    });
  });

  describe('non-matching messages', () => {
    it('should not modify non-ToolMessage messages', async () => {
      const humanMessage = new HumanMessage('Hello');
      const aiMessage = new AIMessage('Hi there');

      await callWrapModelCall({ messages: [humanMessage, aiMessage] }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      expect(request.messages[0]).toBe(humanMessage);
      expect(request.messages[1]).toBe(aiMessage);
    });

    it('should not modify ToolMessage with non-matching content shape', async () => {
      const otherToolOutput = { result: 'some data', value: 42 };
      const toolMessage = new ToolMessage({
        content: JSON.stringify(otherToolOutput),
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_call_id: 'call_other',
        name: 'other_tool',
      });

      await callWrapModelCall({ messages: [toolMessage] }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      const resultMessage = request.messages[0] as ToolMessage;
      const parsed = JSON.parse(resultMessage.content as string) as typeof otherToolOutput;

      expect(parsed).toEqual(otherToolOutput);
    });

    it('should not modify ToolMessage with invalid JSON content', async () => {
      const toolMessage = new ToolMessage({
        content: 'not valid json',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_call_id: 'call_invalid',
        name: toolName.testModel,
      });

      await callWrapModelCall({ messages: [toolMessage] }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      const resultMessage = request.messages[0] as ToolMessage;
      expect(resultMessage.content).toBe('not valid json');
    });
  });

  describe('preserves other message properties', () => {
    it('should preserve tool_call_id and other properties after trimming', async () => {
      const failures: TestFailure[] = [
        { id: 'req_1', requirement: 'Test', reason: 'Failed', suggestion: 'Fix', targetFile: defaultTargetFile },
      ];
      const toolMessage = createTestModelToolMessage(failures, 2, {
        toolCallId: 'call_preserve_test',
      });

      await callWrapModelCall({ messages: [toolMessage] }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      const trimmedMessage = request.messages[0] as ToolMessage;

      expect(trimmedMessage.tool_call_id).toBe('call_preserve_test');
      expect(trimmedMessage.name).toBe(toolName.testModel);
    });

    it('should preserve failures array content after trimming', async () => {
      const failures: TestFailure[] = [
        {
          id: 'req_sphere',
          requirement: 'Model should be a sphere',
          reason: 'Top view shows toroidal structure',
          suggestion: 'Use sphere() primitive instead of torus',
          targetFile: defaultTargetFile,
        },
        {
          id: 'req_hole',
          requirement: 'Hole should be centered',
          reason: 'Hole is offset by 5mm',
          suggestion: 'Translate hole to origin',
          targetFile: defaultTargetFile,
        },
      ];

      const toolMessage = createTestModelToolMessage(failures, 2);

      await callWrapModelCall({ messages: [toolMessage] }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      const trimmedMessage = request.messages[0] as ToolMessage;
      const parsed = parseTestModelOutput(trimmedMessage);

      // Passed should be removed
      expect(parsed.passed).toBeUndefined();

      // Failures and total should be preserved exactly
      expect(parsed.failures).toEqual(failures);
      expect(parsed.total).toBe(4);
    });
  });

  // ==========================================================================
  // Multi-file test.json migration
  // ==========================================================================

  describe('multi-file test_model trimming', () => {
    it('should preserve targetFile on every retained failure after trimming', async () => {
      const failures: TestFailure[] = [
        {
          id: 'req_main_width',
          requirement: 'Main is 100mm wide',
          reason: 'Got 80mm',
          suggestion: 'Increase width parameter to 100',
          targetFile: 'main.scad',
        },
        {
          id: 'req_lib_solid',
          requirement: 'Lib component is a single solid',
          reason: 'Got 2 components',
          suggestion: 'Union the parts',
          targetFile: 'lib/bracket.scad',
        },
      ];
      const toolMessage = createTestModelToolMessage(failures, 0);

      await callWrapModelCall({ messages: [toolMessage] }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      const trimmedMessage = request.messages[0] as ToolMessage;
      const parsed = parseTestModelOutput(trimmedMessage);

      expect(parsed.failures).toHaveLength(2);
      expect(parsed.failures.map((f) => f.targetFile)).toEqual(['main.scad', 'lib/bracket.scad']);
    });

    it('should drop geometryArtifactPaths from trimmed test_model output', async () => {
      const failures: TestFailure[] = [
        {
          id: 'req_1',
          requirement: 'Width = 100mm',
          reason: 'Width is 80mm',
          suggestion: 'Adjust',
          targetFile: 'main.scad',
        },
      ];
      const toolMessage = createTestModelToolMessage(failures, 1);

      await callWrapModelCall({ messages: [toolMessage] }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      const trimmedMessage = request.messages[0] as ToolMessage;
      const parsed = JSON.parse(trimmedMessage.content as string) as Record<string, unknown>;

      expect(parsed['geometryArtifactPaths']).toBeUndefined();
      expect(parsed['passes']).toBeUndefined();
      expect(parsed['passed']).toBeUndefined();
      expect(parsed['failures']).toBeDefined();
      expect(parsed['total']).toBe(2);
    });

    it('should still detect test_model shape via isTestModelShape on multi-file output', async () => {
      const failures: TestFailure[] = [
        {
          id: 'req_1',
          requirement: 'Width = 100mm',
          reason: 'Width is 80mm',
          suggestion: 'Adjust',
          targetFile: 'main.scad',
        },
      ];
      // Drop the message name so detection must come from content shape alone
      const toolMessage = createTestModelToolMessage(failures, 2, { includeName: false });

      await callWrapModelCall({ messages: [toolMessage] }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      const trimmedMessage = request.messages[0] as ToolMessage;
      const parsed = JSON.parse(trimmedMessage.content as string) as Record<string, unknown>;

      // If detection failed the message would pass through unchanged with passed/passes still present.
      expect(parsed['passed']).toBeUndefined();
      expect(parsed['passes']).toBeUndefined();
      expect(parsed['geometryArtifactPaths']).toBeUndefined();
    });
  });

  // ==========================================================================
  // Immediate Trimmers for File Operations
  // ==========================================================================

  describe('create_file trimmer', () => {
    function createCreateFileOutput(): CreateFileOutput {
      return {
        message: 'File created successfully',
        diffStats: {
          linesAdded: 25,
          linesRemoved: 0,
          originalContent: '',
          modifiedContent: 'const x = 1;\nconst y = 2;\n// ... many more lines',
        },
      };
    }

    it('should remove originalContent and modifiedContent from diffStats', async () => {
      const output = createCreateFileOutput();
      const toolMessage = new ToolMessage({
        content: JSON.stringify(output),
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_call_id: 'call_create_1',
        name: toolName.createFile,
      });

      await callWrapModelCall({ messages: [toolMessage] }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      const trimmedMessage = request.messages[0] as ToolMessage;
      const parsed = JSON.parse(trimmedMessage.content as string) as unknown;

      expect(parsed).toEqual({
        message: 'File created successfully',
        diffStats: {
          linesAdded: 25,
          linesRemoved: 0,
        },
      });
    });

    it('should detect create_file by content shape when name is missing', async () => {
      const output = createCreateFileOutput();
      const toolMessage = new ToolMessage({
        content: JSON.stringify(output),
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_call_id: 'call_create_2',
        // No name set
      });

      await callWrapModelCall({ messages: [toolMessage] }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      const trimmedMessage = request.messages[0] as ToolMessage;
      const parsed = JSON.parse(trimmedMessage.content as string) as unknown;

      expect(parsed).toEqual({
        message: 'File created successfully',
        diffStats: {
          linesAdded: 25,
          linesRemoved: 0,
        },
      });
    });
  });

  describe('edit_file trimmer', () => {
    function createEditFileOutput(): EditFileOutput {
      return {
        diffStats: {
          linesAdded: 10,
          linesRemoved: 5,
          originalContent: 'const old = true;',
          modifiedContent: 'const new_ = false;',
        },
      };
    }

    it('should remove originalContent and modifiedContent from diffStats', async () => {
      const output = createEditFileOutput();
      const toolMessage = new ToolMessage({
        content: JSON.stringify(output),
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_call_id: 'call_edit_1',
        name: toolName.editFile,
      });

      await callWrapModelCall({ messages: [toolMessage] }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      const trimmedMessage = request.messages[0] as ToolMessage;
      const parsed = JSON.parse(trimmedMessage.content as string) as unknown;

      expect(parsed).toEqual({
        diffStats: {
          linesAdded: 10,
          linesRemoved: 5,
        },
      });
    });
  });

  describe('get_kernel_result trimmer', () => {
    function createGetKernelResultOutput(): GetKernelResultOutput {
      return {
        status: 'error',
        kernelIssues: [
          {
            message: 'Syntax error on line 5',
            code: 'UNKNOWN',
            location: {
              fileName: 'main.scad',
              startLineNumber: 5,
              startColumn: 10,
            },
            severity: 'error',
            type: 'compilation',
            stack: 'Error: Syntax error\n  at line 5\n  at compile()',
            stackFrames: [
              { fileName: 'main.scad', lineNumber: 5, functionName: 'compile' },
              { fileName: 'kernel.js', lineNumber: 100, functionName: 'execute' },
            ],
          },
        ],
      };
    }

    it('should preserve stack and stackFrames in kernel issues for debugging', async () => {
      const output = createGetKernelResultOutput();
      const toolMessage = new ToolMessage({
        content: JSON.stringify(output),
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_call_id: 'call_kernel_1',
        name: toolName.getKernelResult,
      });

      await callWrapModelCall({ messages: [toolMessage] }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      const trimmedMessage = request.messages[0] as ToolMessage;
      const parsed = JSON.parse(trimmedMessage.content as string) as unknown;

      expect(parsed).toEqual({
        status: 'error',
        kernelIssues: [
          {
            message: 'Syntax error on line 5',
            code: 'UNKNOWN',
            location: {
              fileName: 'main.scad',
              startLineNumber: 5,
              startColumn: 10,
            },
            severity: 'error',
            type: 'compilation',
            stack: 'Error: Syntax error\n  at line 5\n  at compile()',
            stackFrames: [
              { fileName: 'main.scad', lineNumber: 5, functionName: 'compile' },
              { fileName: 'kernel.js', lineNumber: 100, functionName: 'execute' },
            ],
          },
        ],
      });
    });

    it('should handle kernel result with ready status and no issues', async () => {
      const output: GetKernelResultOutput = { status: 'ready' };
      const toolMessage = new ToolMessage({
        content: JSON.stringify(output),
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_call_id: 'call_kernel_2',
        name: toolName.getKernelResult,
      });

      await callWrapModelCall({ messages: [toolMessage] }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      const trimmedMessage = request.messages[0] as ToolMessage;
      const parsed = JSON.parse(trimmedMessage.content as string) as unknown;

      expect(parsed).toEqual({ status: 'ready' });
    });
  });

  // ==========================================================================
  // Screenshot Trimmer
  // ==========================================================================

  describe('screenshot trimmer', () => {
    const base64Stub = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ';

    function createScreenshotOutput(views: string[]): ScreenshotOutput {
      return {
        images: views.map((view) => ({ view, dataUrl: base64Stub })),
      };
    }

    it('should strip dataUrl from older screenshot messages, keeping only view names', async () => {
      const olderScreenshot = createScreenshotOutput(['front', 'back', 'top', 'bottom', 'left', 'right']);
      const latestScreenshot = createScreenshotOutput(['current']);

      const messages: BaseMessage[] = [
        new HumanMessage('Take a screenshot'),
        new AIMessage({
          content: '',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_calls: [{ id: 'call_ss_1', name: toolName.screenshot, args: {} }],
        }),
        new ToolMessage({
          content: JSON.stringify(olderScreenshot),
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_call_id: 'call_ss_1',
          name: toolName.screenshot,
        }),
        new AIMessage('Here is the model. Let me take another screenshot.'),
        new AIMessage({
          content: '',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_calls: [{ id: 'call_ss_2', name: toolName.screenshot, args: {} }],
        }),
        new ToolMessage({
          content: JSON.stringify(latestScreenshot),
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_call_id: 'call_ss_2',
          name: toolName.screenshot,
        }),
      ];

      await callWrapModelCall({ messages }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      const toolMessages = request.messages.filter((message) => ToolMessage.isInstance(message)) as ToolMessage[];
      expect(toolMessages).toHaveLength(2);

      // Older screenshot: trimmed to view names only, no dataUrl
      const olderContent = JSON.parse(toolMessages[0]!.content as string) as Record<string, unknown>;
      expect(olderContent).toEqual({
        images: [
          { view: 'front' },
          { view: 'back' },
          { view: 'top' },
          { view: 'bottom' },
          { view: 'left' },
          { view: 'right' },
        ],
        _trimmed: true,
      });

      // Latest screenshot: converted to multimodal image blocks with inspection directive
      const latestContent = toolMessages[1]!.content as Array<Record<string, unknown>>;
      expect(Array.isArray(latestContent)).toBe(true);
      expect(latestContent[0]).toHaveProperty('type', 'text');
      expect(latestContent[0]).toHaveProperty('text');
      expect(latestContent[0]!['text']).toContain('quality inspector');
      expect(latestContent[1]).toHaveProperty('type', 'image_url');
    });

    it('should trim screenshot by content shape detection when name is missing', async () => {
      const olderOutput = createScreenshotOutput(['front', 'back']);
      const latestOutput = createScreenshotOutput(['current']);

      const messages: BaseMessage[] = [
        new ToolMessage({
          content: JSON.stringify(olderOutput),
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_call_id: 'call_ss_no_name',
          // No name set — triggers content shape detection
        }),
        new ToolMessage({
          content: JSON.stringify(latestOutput),
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_call_id: 'call_ss_latest',
          name: toolName.screenshot,
        }),
      ];

      await callWrapModelCall({ messages }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      const trimmedMessage = request.messages[0] as ToolMessage;
      const parsed = JSON.parse(trimmedMessage.content as string) as Record<string, unknown>;

      expect(parsed).toEqual({
        images: [{ view: 'front' }, { view: 'back' }],
        _trimmed: true,
      });
    });

    it('should handle older screenshot with empty images array', async () => {
      const emptyOutput: ScreenshotOutput = { images: [] };
      const latestOutput = createScreenshotOutput(['current']);

      const messages: BaseMessage[] = [
        new ToolMessage({
          content: JSON.stringify(emptyOutput),
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_call_id: 'call_ss_empty',
          name: toolName.screenshot,
        }),
        new ToolMessage({
          content: JSON.stringify(latestOutput),
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_call_id: 'call_ss_latest',
          name: toolName.screenshot,
        }),
      ];

      await callWrapModelCall({ messages }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      const trimmedMessage = request.messages[0] as ToolMessage;
      const parsed = JSON.parse(trimmedMessage.content as string) as Record<string, unknown>;

      expect(parsed).toEqual({
        images: [],
        _trimmed: true,
      });
    });

    it('should not inject image blocks when dataUrl values are offloaded placeholders', async () => {
      const offloadedOutput = {
        images: [{ view: 'composite', dataUrl: '[offloaded: 50000 chars]' }],
        _offloadedTo: '.tau/tool-results/chat-1/call_ss_offloaded.txt',
      };

      const messages: BaseMessage[] = [
        new ToolMessage({
          content: JSON.stringify(offloadedOutput),
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_call_id: 'call_ss_offloaded',
          name: toolName.screenshot,
        }),
      ];

      await callWrapModelCall({ messages }, handler);

      const [request] = handler.mock.calls[0] as [TestRequest];
      const resultMessage = request.messages[0] as ToolMessage;

      // Content stays as string JSON (no multimodal image blocks injected)
      expect(typeof resultMessage.content).toBe('string');
      const parsed = JSON.parse(resultMessage.content as string) as Record<string, unknown>;
      const images = parsed['images'] as Array<Record<string, unknown>>;
      expect(images).toHaveLength(1);
      expect(images[0]!['view']).toBe('composite');
      expect(images[0]!['dataUrl']).toBe('[offloaded: 50000 chars]');
    });
  });
});
