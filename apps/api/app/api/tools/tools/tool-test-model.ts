import type { ToolRuntime } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import { assertRpcSuccess } from '@taucad/chat/utils';
import type { ChatTool } from '@taucad/chat';
import { testModelInputSchema } from '@taucad/chat/schemas/tools/test-model';
import type { TestModelInput, TestModelOutput } from '@taucad/chat/schemas/tools/test-model';
import type { KernelProvider } from '@taucad/runtime';
import { rpcName, toolName } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';

/**
 * Build the kernel-aware definition (description + schema) for the
 * `test_model` tool. The description focuses on tool mechanics; the
 * project-wide top-level-export policy lives in the system prompt's
 * `<test_requirements>` block (single source of truth).
 */
export const createTestModelToolDefinition = (
  _kernel: KernelProvider,
): { name: typeof toolName.testModel; description: string; schema: typeof testModelInputSchema } => {
  return {
    name: toolName.testModel,
    description: `Run GeoSpec tests against the current 3D model(s).

No input recursively runs all *.geospec.ts or *.geospec.js files. Tests load
Tau model files through geospec/model and assert geometry with expectGeo.

Filter examples:
- Run one file: { files: ['main.geospec.ts'] }
- Run one directory subtree: { files: ['lib'] }
- Skip one known failing check: { testNamePattern: '^(?!.*no meshing interference).*' }
- Skip slow files: { exclude: ['**/*.slow.geospec.ts'] }

Returns compact pass/fail rows tagged by targetFile. Empty failures with total > 0 means all selected tests passed.

When NOT to use:
- NOT as a substitute for \`get_kernel_result\` when you only need compile status; \`test_model\` measures geometry against requirements.`,
    schema: testModelInputSchema,
  } as const;
};

/**
 * Build the kernel-aware `test_model` tool.
 *
 * The API intentionally does not import GeoSpec, parse geometry, or receive
 * GLB payloads. It asks the browser-connected Tau runtime to execute GeoSpec
 * in-process and returns the compact result object.
 */
export const createTestModelTool = (
  _kernel: KernelProvider,
): ChatTool<typeof testModelInputSchema, TestModelInput, TestModelOutput, typeof toolName.testModel> => {
  const definition = createTestModelToolDefinition(_kernel);

  return tool(async (input, runtime: ToolRuntime) => {
    const { chatRpcService, thread_id: chatId } = runtime.configurable as ChatRpcConfigurable;
    const { toolCallId } = runtime;

    const result = await chatRpcService.sendRpcRequest({
      chatId,
      toolCallId,
      rpcName: rpcName.runGeoSpecTests,
      args: {
        ...(input.files === undefined ? {} : { files: input.files }),
        ...(input.include === undefined ? {} : { include: input.include }),
        ...(input.exclude === undefined ? {} : { exclude: input.exclude }),
        ...(input.testNamePattern === undefined ? {} : { testNamePattern: input.testNamePattern }),
        ...(input.testTimeout === undefined ? {} : { testTimeout: input.testTimeout }),
      },
    });

    assertRpcSuccess(result, {
      toolName: toolName.testModel,
      toolCallId,
      clientErrorMessage(error) {
        return `GeoSpec tests could not run in the browser-connected Tau runtime (${error.errorCode}: ${error.message})`;
      },
    });

    return result;
  }, definition);
};
