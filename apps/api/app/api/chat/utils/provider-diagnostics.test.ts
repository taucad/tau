import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { describe, expect, it, vi } from 'vitest';
import {
  createGoogleProviderDiagnosticsFetch,
  createProviderDiagnosticsContext,
  summarizeGeminiRequest,
  summarizeModelCallMessages,
} from '#api/chat/utils/provider-diagnostics.js';

describe('provider diagnostics', () => {
  it('should summarize interrupted tool tails without logging argument values', () => {
    const aiMessage = new AIMessage({
      content: '',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain tool call shape
      tool_calls: [
        {
          id: 'call_read',
          name: 'read_file',
          args: {
            targetFile: undefined,
            limit: 100,
          },
          type: 'tool_call',
        },
      ],
    });
    const toolMessage = new ToolMessage({
      content: JSON.stringify({
        errorCode: 'USER_INTERRUPTED',
        message: 'Interrupted by user.',
        toolCallId: 'call_read',
        toolName: 'read_file',
      }),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain constructor shape
      tool_call_id: 'call_read',
      name: 'read_file',
      status: 'error',
    });

    const summary = summarizeModelCallMessages([new HumanMessage('continue'), aiMessage, toolMessage]);
    const serialized = JSON.stringify(summary);

    expect(summary.diagnosticFlags).toEqual(['interrupted_tool_result', 'undefined_tool_arg']);
    expect(serialized).toContain('"key":"targetFile"');
    expect(serialized).toContain('"type":"undefined"');
    expect(serialized).not.toContain('Interrupted by user.');
  });

  it('should flag hidden legacy tool metadata that can be replayed by provider formatters', () => {
    const aiMessage = new AIMessage({
      content: [],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain tool call shape
      tool_calls: [],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain tool call shape
      invalid_tool_calls: [
        {
          id: 'call_malformed_read',
          name: 'read_file',
          args: '{"limit":40}{"targetFile":"main.ts"}',
          error: 'Malformed args.',
          type: 'invalid_tool_call',
        },
      ],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain metadata shape
      additional_kwargs: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI-compatible legacy metadata uses snake_case
        tool_calls: [
          {
            id: '218421',
            type: 'function',
            function: { name: '', arguments: '{}' },
          },
          {
            id: 'call_bad_args',
            type: 'function',
            function: { name: 'read_file', arguments: '{"limit":40}{"targetFile":"main.ts"}' },
          },
        ],
      },
    });

    const summary = summarizeModelCallMessages([new HumanMessage('continue'), aiMessage]);
    expect(summary.diagnosticFlags).toEqual([
      'empty_assistant_message',
      'invalid_tool_call_with_legacy_fallback',
      'legacy_empty_tool_call_name',
      'legacy_tool_calls_without_canonical_tool_calls',
      'malformed_legacy_tool_call_args',
    ]);

    const assistant = summary.tail[1];
    expect(assistant?.legacyToolCalls?.[0]).toEqual({
      id: '218421',
      name: '',
      args: { type: 'object', keyCount: 0, keys: [] },
      validName: false,
      validArgs: true,
    });
    expect(assistant?.legacyToolCalls?.[1]).toMatchObject({
      id: 'call_bad_args',
      name: 'read_file',
      validName: true,
      validArgs: false,
    });
    expect(assistant?.legacyToolCalls?.[1]?.args).toEqual(expect.objectContaining({ type: 'string', empty: false }));
    expect(assistant?.legacyToolCalls).toHaveLength(2);
    expect(JSON.stringify(summary)).not.toContain('main.ts');
  });

  it('should summarize Gemini request bodies with content lengths and schema keyword counts', () => {
    const summary = summarizeGeminiRequest({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'SECRET PROMPT SHOULD NOT LOG' }],
        },
      ],
      tools: [
        {
          functionDeclarations: [
            {
              name: 'read_file',
              parameters: {
                type: 'object',
                properties: {
                  targetFile: { const: 'main.kcl' },
                },
                propertyNames: { pattern: '^[a-z]' },
              },
            },
          ],
        },
      ],
    }) as {
      contents: Array<{ parts: Array<{ length?: number }> }>;
      diagnosticFlags?: string[];
      schemaKeywordCounts?: Record<string, number>;
    };
    const serialized = JSON.stringify(summary);

    expect(summary.contents[0]?.parts[0]?.length).toBe('SECRET PROMPT SHOULD NOT LOG'.length);
    expect(summary.diagnosticFlags).toEqual([]);
    expect(serialized).toContain('"functionNames":["read_file"]');
    expect(serialized).toContain('"const":1');
    expect(serialized).toContain('"propertyNames":1');
    expect(serialized).not.toContain('SECRET PROMPT SHOULD NOT LOG');
    expect(serialized).not.toContain('main.kcl');
  });

  it('should flag empty and unsigned function-call names in Gemini request summaries', () => {
    const summary = summarizeGeminiRequest({
      contents: [
        {
          role: 'model',
          parts: [{ functionCall: { name: '', args: {} } }],
        },
      ],
    }) as { diagnosticFlags?: string[]; contents: Array<{ parts: Array<Record<string, unknown>> }> };

    expect(summary.diagnosticFlags).toEqual([
      'gemini_request_empty_function_call_name',
      'gemini_request_missing_function_call_thought_signature',
    ]);
    expect(summary.contents[0]?.parts[0]).toMatchObject({
      type: 'functionCall',
      hasThoughtSignature: false,
    });
  });

  it('should report Gemini function-call thought signatures without logging the signature value', () => {
    const summary = summarizeGeminiRequest({
      contents: [
        {
          role: 'model',
          parts: [{ functionCall: { name: 'edit_file', args: {} }, thoughtSignature: 'SECRET_SIGNATURE' }],
        },
      ],
    }) as { diagnosticFlags?: string[]; contents: Array<{ parts: Array<Record<string, unknown>> }> };
    const serialized = JSON.stringify(summary);

    expect(summary.diagnosticFlags).toEqual([]);
    expect(summary.contents[0]?.parts[0]).toMatchObject({
      type: 'functionCall',
      name: 'edit_file',
      hasThoughtSignature: true,
    });
    expect(serialized).not.toContain('SECRET_SIGNATURE');
  });

  it('should summarize Gemini inline media separately from function-call diagnostics', () => {
    const summary = summarizeGeminiRequest({
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'see image' },
            { inlineData: { mimeType: 'image/png', data: 'BASE64_IMAGE_BYTES_SHOULD_NOT_LOG' } },
          ],
        },
      ],
    }) as {
      diagnosticFlags?: string[];
      mediaPartCount?: number;
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
    };

    expect(summary.diagnosticFlags).toEqual([]);
    expect(summary.mediaPartCount).toBe(1);
    expect(summary.contents[0]?.parts[1]).toEqual({
      type: 'inlineData',
      mimeType: 'image/png',
      dataLength: 'BASE64_IMAGE_BYTES_SHOULD_NOT_LOG'.length,
    });
    expect(JSON.stringify(summary)).not.toContain('BASE64_IMAGE_BYTES_SHOULD_NOT_LOG');
  });

  it('should log compact Google request diagnostics on verbose successful fetch responses', async () => {
    const logger = { error: vi.fn(), debug: vi.fn() };
    const context = createProviderDiagnosticsContext({
      chatId: 'chat_google_success',
      modelId: 'google-gemini-3.5-flash',
      providerId: 'vertexai',
      verbose: true,
      logger,
    });
    context.setLatestModelCallSummary({
      messageCount: 56,
      tail: [
        {
          index: 55,
          role: 'user',
          content: { type: 'text', length: 353, empty: false },
        },
      ],
      diagnosticFlags: ['interrupted_tool_result'],
    });

    const baseFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200, statusText: 'OK' }));
    const fetchWithDiagnostics = createGoogleProviderDiagnosticsFetch({ baseFetch, context });

    const response = await fetchWithDiagnostics(
      'https://aiplatform.googleapis.com/v1/projects/p/locations/global/models/gemini:streamGenerateContent',
      {
        method: 'POST',
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'SECRET PROMPT SHOULD NOT LOG' }] }],
          tools: [{ functionDeclarations: [{ name: 'read_file', parameters: { type: 'object' } }] }],
        }),
      },
    );

    expect(await response.text()).toBe('ok');
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledOnce();

    const [payload, message] = logger.debug.mock.calls[0] as [Record<string, unknown>, string];
    const serialized = JSON.stringify(payload);

    expect(message).toBe('Google Vertex request completed for google-gemini-3.5-flash');
    expect(serialized).toContain('"providerAttemptId":1');
    expect(serialized).toContain('"messageCount":56');
    expect(serialized).toContain('"tailCount":1');
    expect(serialized).toContain('"byteLength"');
    expect(serialized).toContain('"contentCount":1');
    expect(serialized).toContain('"functionDeclarationCount":1');
    expect(serialized).toContain('"interrupted_tool_result"');
    expect(serialized).not.toContain('"tail"');
    expect(serialized).not.toContain('"contents"');
    expect(serialized).not.toContain('"functionNames"');
    expect(serialized).not.toContain('SECRET PROMPT SHOULD NOT LOG');
  });

  it('should log sanitized Google request and response diagnostics on non-OK fetch responses', async () => {
    const logger = { error: vi.fn(), debug: vi.fn() };
    const context = createProviderDiagnosticsContext({
      chatId: 'chat_google_400',
      modelId: 'google-gemini-3.5-flash',
      providerId: 'vertexai',
      verbose: false,
      logger,
    });
    context.setLatestModelCallSummary({
      messageCount: 1,
      tail: [],
      diagnosticFlags: ['undefined_tool_arg'],
    });

    const responseBody = JSON.stringify([
      {
        error: {
          code: 400,
          message: 'Request contains an invalid argument.',
          status: 'INVALID_ARGUMENT',
        },
      },
    ]);
    const baseFetch = vi.fn().mockResolvedValue(new Response(responseBody, { status: 400, statusText: 'Bad Request' }));
    const fetchWithDiagnostics = createGoogleProviderDiagnosticsFetch({ baseFetch, context });

    const response = await fetchWithDiagnostics(
      'https://aiplatform.googleapis.com/v1/projects/p/locations/global/models/gemini:streamGenerateContent',
      {
        method: 'POST',
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: 'SECRET PROMPT SHOULD NOT LOG' }] },
            { role: 'model', parts: [{ functionCall: { name: 'edit_file', args: { targetFile: 'main.ts' } } }] },
          ],
          tools: [{ functionDeclarations: [{ name: 'read_file', parameters: { type: 'object' } }] }],
        }),
      },
    );

    expect(await response.text()).toBe(responseBody);
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.debug).not.toHaveBeenCalled();

    const [payload, message] = logger.error.mock.calls[0] as [Record<string, unknown>, string];
    const serialized = JSON.stringify(payload);

    expect(message).toBe('Google Vertex request failed for google-gemini-3.5-flash');
    expect(serialized).toContain('"providerAttemptId":1');
    expect(serialized).toContain('"providerStatus":"INVALID_ARGUMENT"');
    expect(serialized).toContain('"providerMessage":"Request contains an invalid argument."');
    expect(serialized).toContain('"functionNames":["read_file"]');
    expect(serialized).toContain('"gemini_request_missing_function_call_thought_signature"');
    expect(serialized).toContain('"hasThoughtSignature":false');
    expect(serialized).toContain('"undefined_tool_arg"');
    expect(serialized).not.toContain('SECRET PROMPT SHOULD NOT LOG');
    expect(serialized).not.toContain('main.ts');
  });
});
