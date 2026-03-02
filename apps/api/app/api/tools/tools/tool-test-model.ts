import type { ToolRuntime } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import { testModelInputSchema, testFileSchema, isRpcClientError } from '@taucad/chat';
import { assertRpcExecution, assertRpcSuccess } from '@taucad/chat/utils';
import type { ChatTool, TestModelInput, TestModelOutput } from '@taucad/chat';
import { rpcName, toolName } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';

export const testModelToolDefinition = {
  name: toolName.testModel,
  description: `Run all tests from test.json against the current 3D model.

Fetches the model geometry and evaluates measurement requirements (bounding box, mesh count, vertex count) deterministically.

Returns:
- failures: Array of failed tests with actionable feedback (reason + suggestion)
- passes: Array of passed tests
- passed: Number of tests that passed
- total: Total number of tests run

If failures is empty, all tests passed.

Note: Reads requirements from test.json. Use edit_tests to add/modify requirements first.`,
  schema: testModelInputSchema,
} as const;

export const testModelTool: ChatTool<
  typeof testModelInputSchema,
  TestModelInput,
  TestModelOutput,
  typeof toolName.testModel
> = tool(async (_input, runtime: ToolRuntime) => {
  const { chatRpcService, geometryAnalysisService, thread_id: chatId } = runtime.configurable as ChatRpcConfigurable;
  const { toolCallId } = runtime;

  // Step 1: Read test.json to get requirements
  const testFileContent = await chatRpcService.sendRpcRequest({
    chatId,
    toolCallId,
    rpcName: rpcName.readFile,
    args: { targetFile: 'test.json' },
  });

  assertRpcExecution(testFileContent, toolName.testModel, toolCallId);

  if (isRpcClientError(testFileContent)) {
    const result: TestModelOutput = {
      failures: [
        {
          id: 'missing_test_file',
          requirement: 'test.json file must exist',
          reason: 'No test.json file found in project root',
          suggestion: 'Use edit_tests to create test.json with requirements before running tests',
        },
      ],
      passes: [],
      passed: 0,
      total: 0,
    };

    return result;
  }

  if (testFileContent.content === '') {
    const result: TestModelOutput = {
      failures: [
        {
          id: 'empty_test_file',
          requirement: 'test.json file must have content',
          reason: 'test.json file is empty',
          suggestion: 'Use edit_tests to add requirements to test.json',
        },
      ],
      passes: [],
      passed: 0,
      total: 0,
    };

    return result;
  }

  let testFile;
  try {
    const parsed = JSON.parse(testFileContent.content) as unknown;
    testFile = testFileSchema.parse(parsed);
  } catch {
    const result: TestModelOutput = {
      failures: [
        {
          id: 'invalid_test_file',
          requirement: 'test.json must be valid JSON with correct schema',
          reason: 'Failed to parse test.json - invalid format',
          suggestion: 'Ensure test.json has valid JSON with a "requirements" array',
        },
      ],
      passes: [],
      passed: 0,
      total: 0,
    };

    return result;
  }

  const { requirements } = testFile;

  if (requirements.length === 0) {
    const result: TestModelOutput = {
      failures: [
        {
          id: 'no_requirements',
          requirement: 'test.json must contain at least one requirement',
          reason: 'No requirements found in test.json',
          suggestion: 'Use edit_tests to add measurement requirements to test.json',
        },
      ],
      passes: [],
      passed: 0,
      total: 0,
    };

    return result;
  }

  // Step 2: Fetch geometry from the client via RPC
  const geometryResult = await chatRpcService.sendRpcRequest({
    chatId,
    toolCallId,
    rpcName: rpcName.fetchGeometry,
    args: { artifactId: toolCallId },
  });

  assertRpcSuccess(geometryResult, {
    toolName: toolName.testModel,
    toolCallId,
    clientErrorMessage: 'Failed to fetch geometry for testing',
  });

  // Step 3: Run measurement tests via GeometryAnalysisService
  const result = await geometryAnalysisService.runMeasurementTests(geometryResult.glb, requirements);

  return {
    failures: result.failures,
    passes: result.passes,
    passed: result.passes.length,
    total: result.failures.length + result.passes.length,
    geometryArtifactPath: geometryResult.artifactPath,
  };
}, testModelToolDefinition);
