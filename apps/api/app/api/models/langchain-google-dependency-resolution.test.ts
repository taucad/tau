// @vitest-environment node
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';

type PackageJson = {
  name: string;
  version: string;
};

type GeminiFunctionCallPart = {
  functionCall: {
    name: string;
    args: Record<string, unknown>;
  };
  thoughtSignature?: string;
};

type GeminiMessageContentBlock =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'reasoning';
      reasoning: string;
    };

type GeminiChatGeneration = {
  text?: string;
  message?: {
    content?: string | GeminiMessageContentBlock[];
    tool_call_chunks?: unknown[];
    tool_calls?: unknown[];
    invalid_tool_calls?: unknown[];
  };
};

type GoogleCommonUtils = {
  readonly ['getGeminiAPI']: () => {
    responseToParts?: (response: { data: unknown }) => unknown[];
    responseToChatGeneration: (response: { data: unknown }) => GeminiChatGeneration | undefined;
    responseToChatResult: (response: { data: unknown }) => {
      generations: GeminiChatGeneration[];
    };
    formatData: (
      input: unknown,
      parameters: Record<string, unknown>,
    ) => Promise<{
      contents?: Array<{
        role?: string;
        parts?: GeminiFunctionCallPart[];
      }>;
      generationConfig?: {
        thinkingConfig?: {
          thinkingLevel?: string;
          thinkingBudget?: number;
          includeThoughts?: boolean;
        };
      };
    }>;
  };
};

type RepeatedReadFileToolCall = {
  id: string;
  name: 'read_file';
  args: {
    targetFile: string;
  };
  type: 'tool_call';
};

const toolCallsField = 'tool_calls';
const additionalKwargsField = 'additional_kwargs';
const toolCallIdField = 'tool_call_id';

describe('LangChain Google dependency resolution', () => {
  it('loads upstream google-vertexai with only the forked google-common override', () => {
    const rootRequire = createRequire(import.meta.url);
    const vertexPackageJsonPath = rootRequire.resolve('@langchain/google-vertexai/package.json');
    const vertexRequire = createRequire(vertexPackageJsonPath);
    const vertexPackageJson = vertexRequire('@langchain/google-vertexai/package.json') as PackageJson;

    expect(vertexPackageJson).toMatchObject({
      name: '@langchain/google-vertexai',
      version: '2.2.0',
    });
    expect(vertexPackageJsonPath).not.toContain('langchain-fork');

    const gauthPackageJsonPath = vertexRequire.resolve('@langchain/google-gauth/package.json');
    const gauthPackageJson = vertexRequire('@langchain/google-gauth/package.json') as PackageJson;

    expect(gauthPackageJson).toMatchObject({
      name: '@langchain/google-gauth',
      version: '2.2.0',
    });
    expect(gauthPackageJsonPath).not.toContain('langchain-fork');

    const googleCommonPackageJsonPath = vertexRequire.resolve('@langchain/google-common/package.json');
    const googleCommonPackageJson = vertexRequire('@langchain/google-common/package.json') as PackageJson;

    expect(googleCommonPackageJson).toMatchObject({
      name: '@langchain/google-common',
      version: '2.2.0-beta.0',
    });
    expect(googleCommonPackageJsonPath).toContain('file+tarballs+langchain-fork');
  });

  it('loads installed Google common with reasoning thoughts requested for symbolic levels', async () => {
    const rootRequire = createRequire(import.meta.url);
    const vertexPackageJsonPath = rootRequire.resolve('@langchain/google-vertexai/package.json');
    const vertexRequire = createRequire(vertexPackageJsonPath);
    const googleCommonUtilsPath = vertexRequire.resolve('@langchain/google-common/utils');
    const googleCommonUtils = (await import(pathToFileURL(googleCommonUtilsPath).href)) as GoogleCommonUtils;
    const api = googleCommonUtils.getGeminiAPI();

    const thinkingLevelData = await api.formatData([new HumanMessage('Think briefly.')], {
      thinkingLevel: 'MEDIUM',
    });
    expect(thinkingLevelData.generationConfig?.thinkingConfig).toMatchObject({
      thinkingLevel: 'MEDIUM',
      includeThoughts: true,
    });

    const reasoningLevelData = await api.formatData([new HumanMessage('Think briefly.')], {
      reasoningLevel: 'high',
    });
    expect(reasoningLevelData.generationConfig?.thinkingConfig).toMatchObject({
      thinkingLevel: 'HIGH',
      includeThoughts: true,
    });

    const zeroBudgetData = await api.formatData([new HumanMessage('Do not think.')], {
      maxReasoningTokens: 0,
    });
    expect(zeroBudgetData.generationConfig?.thinkingConfig).toMatchObject({
      thinkingBudget: 0,
      includeThoughts: false,
    });
  });

  it('loads installed Google common with Gemini thought parts preserved as reasoning blocks', async () => {
    const rootRequire = createRequire(import.meta.url);
    const vertexPackageJsonPath = rootRequire.resolve('@langchain/google-vertexai/package.json');
    const vertexRequire = createRequire(vertexPackageJsonPath);
    const googleCommonUtilsPath = vertexRequire.resolve('@langchain/google-common/utils');
    const googleCommonUtils = (await import(pathToFileURL(googleCommonUtilsPath).href)) as GoogleCommonUtils;
    const result = googleCommonUtils.getGeminiAPI().responseToChatResult({
      data: {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'Hidden reasoning.', thought: true }, { text: 'Visible answer.' }],
            },
          },
        ],
        promptFeedback: { safetyRatings: [] },
      },
    });
    const [generation] = result.generations;

    expect(generation?.text).toBe('Visible answer.');
    expect(generation?.message?.content).toEqual([
      { type: 'reasoning', reasoning: 'Hidden reasoning.' },
      { type: 'text', text: 'Visible answer.' },
    ]);
  });

  it('formats repeated Gemini tool calls with their installed thought signatures', async () => {
    const rootRequire = createRequire(import.meta.url);
    const vertexPackageJsonPath = rootRequire.resolve('@langchain/google-vertexai/package.json');
    const vertexRequire = createRequire(vertexPackageJsonPath);
    const googleCommonUtilsPath = vertexRequire.resolve('@langchain/google-common/utils');
    const googleCommonUtils = (await import(pathToFileURL(googleCommonUtilsPath).href)) as GoogleCommonUtils;
    const toolCalls: RepeatedReadFileToolCall[] = [
      {
        id: 'call_read_main',
        name: 'read_file',
        args: { targetFile: 'main.kcl' },
        type: 'tool_call',
      },
      {
        id: 'call_read_spec',
        name: 'read_file',
        args: { targetFile: 'main.geospec.ts' },
        type: 'tool_call',
      },
      {
        id: 'call_read_types',
        name: 'read_file',
        args: { targetFile: 'node_modules/geospec/index.d.ts' },
        type: 'tool_call',
      },
    ];

    const data = await googleCommonUtils.getGeminiAPI().formatData(
      [
        new HumanMessage('Read the project files.'),
        new AIMessage({
          content: '',
          [toolCallsField]: toolCalls,
          [additionalKwargsField]: {
            functionCallSignatureParts: [
              {
                id: 'call_read_main',
                index: 0,
                name: 'read_file',
                thoughtSignature: 'sig_main_kcl',
              },
              {
                id: 'call_read_spec',
                index: 1,
                name: 'read_file',
                thoughtSignature: 'sig_geospec',
              },
              {
                id: 'call_read_types',
                index: 2,
                name: 'read_file',
                thoughtSignature: 'sig_geospec_types',
              },
            ],
          },
        }),
        ...toolCalls.map(
          (toolCall) =>
            new ToolMessage({
              content: JSON.stringify({ ok: true, path: toolCall.args.targetFile }),
              name: toolCall.name,
              [toolCallIdField]: toolCall.id,
            }),
        ),
      ],
      {},
    );
    const modelContent = data.contents?.find((content) => content.role === 'model');
    if (!modelContent?.parts) {
      throw new Error('Expected formatted Gemini model content with function-call parts.');
    }

    expect(modelContent.parts).toEqual([
      {
        functionCall: {
          name: 'read_file',
          args: { targetFile: 'main.kcl' },
        },
        thoughtSignature: 'sig_main_kcl',
      },
      {
        functionCall: {
          name: 'read_file',
          args: { targetFile: 'main.geospec.ts' },
        },
        thoughtSignature: 'sig_geospec',
      },
      {
        functionCall: {
          name: 'read_file',
          args: { targetFile: 'node_modules/geospec/index.d.ts' },
        },
        thoughtSignature: 'sig_geospec_types',
      },
    ]);
  });

  it('loads installed Google common without anonymous Gemini partialArgs chunks', async () => {
    const rootRequire = createRequire(import.meta.url);
    const vertexPackageJsonPath = rootRequire.resolve('@langchain/google-vertexai/package.json');
    const vertexRequire = createRequire(vertexPackageJsonPath);
    const googleCommonUtilsPath = vertexRequire.resolve('@langchain/google-common/utils');
    const googleCommonUtils = (await import(pathToFileURL(googleCommonUtilsPath).href)) as GoogleCommonUtils;
    const response = {
      data: {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                { text: 'Inspecting project files.' },
                {
                  functionCall: {
                    name: 'read_file',
                    partialArgs: [{ jsonPath: '$.targetFile', stringValue: 'main.kcl' }],
                  },
                },
              ],
            },
            index: 0,
          },
        ],
      },
    };

    const api = googleCommonUtils.getGeminiAPI();
    expect(api.responseToParts?.(response)).toHaveLength(2);

    const generation = api.responseToChatGeneration(response);
    expect(generation?.message?.tool_call_chunks).toEqual([]);
    expect(generation?.message?.tool_calls).toEqual([]);
    expect(generation?.message?.invalid_tool_calls).toEqual([]);
  });
});
