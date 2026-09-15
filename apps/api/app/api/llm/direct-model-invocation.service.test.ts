/* eslint-disable @typescript-eslint/naming-convention -- LangChain usage metadata uses snake_case. */
import type { ConfigService } from '@nestjs/config';
import { AIMessageChunk } from '@langchain/core/messages';
import { DefaultChatTransport, readUIMessageStream } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { ChatService } from '#api/chat/chat.service.js';
import { DirectModelInvocationService } from '#api/llm/direct-model-invocation.service.js';
import type { ModelService } from '#api/models/model.service.js';
import type { Environment } from '#config/environment.config.js';

describe('DirectModelInvocationService', () => {
  it('runs API helper prompts through an advertised non-OpenAI self-host model', async () => {
    async function* chunks(): AsyncGenerator<AIMessageChunk> {
      yield new AIMessageChunk({ content: 'Named part' });
      yield new AIMessageChunk({
        content: '',
        usage_metadata: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
      });
    }
    const buildModel = vi.fn(() => ({ model: { stream: vi.fn(async () => chunks()) } }));
    const models = {
      getModels: vi.fn(async () => [{ id: 'anthropic-claude-fable-5', recommended: true }]),
      buildModel,
    } as unknown as ModelService;
    const config = { get: vi.fn() } as unknown as ConfigService<Environment, true>;
    const chat = new ChatService(new DirectModelInvocationService(config, models));

    const result = await chat.getBuildNameGenerator(
      [{ role: 'user', content: 'Name this part' }],
      'owner',
      'attempt',
      'project',
      new AbortController().signal,
    );
    if (result.state !== 'streaming') {
      throw new Error('Expected stream');
    }
    const stream = await new DefaultChatTransport({
      api: 'http://fixture.invalid/chat',
      fetch: async () => result.response,
    }).sendMessages({
      chatId: 'chat',
      messages: [],
      trigger: 'submit-message',
      messageId: undefined,
      abortSignal: new AbortController().signal,
    });
    let text = '';
    for await (const message of readUIMessageStream({ stream })) {
      text = message.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('');
    }

    expect(text).toBe('Named part');
    expect(buildModel).toHaveBeenCalledWith('anthropic-claude-fable-5', { maximumOutputTokens: 64 });
    await result.completion;
  });
});
