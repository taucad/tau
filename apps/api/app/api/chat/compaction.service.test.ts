/* eslint-disable @typescript-eslint/naming-convention -- LangChain and Morph payloads use snake_case fields. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { CompactionService } from '#api/chat/compaction.service.js';
import {
  MorphCompactionContractError,
  MorphCompactionHttpError,
  MorphCompactionTransportError,
} from '#api/chat/utils/compaction-errors.js';

describe('CompactionService', () => {
  let service: CompactionService;
  let moduleRef: TestingModule | undefined;
  const originalFetch = globalThis.fetch;

  const createService = async (morphApiKey: string | undefined): Promise<CompactionService> => {
    moduleRef = await Test.createTestingModule({
      providers: [
        CompactionService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue(morphApiKey),
          },
        },
      ],
    }).compile();

    return moduleRef.get<CompactionService>(CompactionService);
  };

  beforeEach(async () => {
    service = await createService('test-key');
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    if (moduleRef) {
      await moduleRef.close();
      moduleRef = undefined;
    }
  });

  it('throws when MORPH_API_KEY is missing', async () => {
    await expect(createService(undefined)).rejects.toThrow(
      'MORPH_API_KEY is required for context compaction functionality',
    );
  });

  it('calls Morph native compact API with provider-neutral transcript fields', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output: 'Compacted transcript' }),
    });

    await service.compact({
      messages: [
        new HumanMessage('Hello'),
        new AIMessage({
          content: [
            { type: 'reasoning', reasoning: 'hidden reasoning', signature: 'opaque' },
            { type: 'text', text: 'Visible assistant text' },
          ],
          tool_calls: [{ id: 'call_read', name: 'read_file', args: { targetFile: 'main.ts' }, type: 'tool_call' }],
        }),
      ],
      query: 'What matters next?',
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.morphllm.com/v1/compact',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    );
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(fetchCall[1].body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      query: 'What matters next?',
      compression_ratio: 0.35,
      preserve_recent: 0,
    });
    expect(body['model']).toBeUndefined();
    expect(body['messages']).toBeUndefined();
    expect(body['input']).toContain('--- message 1 role=user');
    expect(body['input']).toContain('Visible assistant text');
    expect(body['input']).toContain('<tool_call index=0 id=call_read name=read_file>');
    expect(body['input']).not.toContain('hidden reasoning');
    expect(body['input']).not.toContain('opaque');
  });

  it('returns a compacted HumanMessage seeded with Morph output', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output: 'The user greeted; the assistant answered.' }),
    });

    const { compactedMessages } = await service.compact({
      messages: [new HumanMessage('Hello'), new AIMessage('Hi')],
      query: 'Summary',
    });

    expect(compactedMessages).toHaveLength(1);
    expect(compactedMessages[0]).toBeInstanceOf(HumanMessage);
    expect(compactedMessages[0]!.content).toContain('The user greeted');
  });

  it('throws MorphCompactionHttpError on non-2xx responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'temporarily unavailable',
    });

    await expect(service.compact({ messages: [new HumanMessage('test')], query: 'test' })).rejects.toMatchObject({
      name: 'MorphCompactionHttpError',
      status: 503,
      responseBody: 'temporarily unavailable',
      failureKind: 'morph_http_error',
    } satisfies Partial<MorphCompactionHttpError>);
  });

  it('throws MorphCompactionTransportError when fetch rejects', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(service.compact({ messages: [new HumanMessage('test')], query: 'test' })).rejects.toBeInstanceOf(
      MorphCompactionTransportError,
    );
  });

  it('throws MorphCompactionContractError when output is missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ compacted_line_ranges: [] }] }),
    });

    await expect(service.compact({ messages: [new HumanMessage('test')], query: 'test' })).rejects.toBeInstanceOf(
      MorphCompactionContractError,
    );
  });

  it('throws MorphCompactionContractError when output is empty', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output: '   \n' }),
    });

    await expect(service.compact({ messages: [new HumanMessage('test')], query: 'test' })).rejects.toThrow(
      'output" was empty',
    );
  });

  it('calculates compression stats from native input/output text', async () => {
    const longContent = 'A'.repeat(4000);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output: 'Short compacted transcript.' }),
    });

    const { stats } = await service.compact({
      messages: [new HumanMessage(longContent), new AIMessage(longContent)],
      query: 'Summarize',
    });

    expect(stats.tokensBeforeCompaction).toBeGreaterThan(stats.tokensAfterCompaction);
    expect(stats.compressionRatio).toBeLessThan(1);
    expect(stats.messagesEvicted).toBe(1);
  });

  it('includes image count in compacted summary when images were evicted', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output: 'User showed a design and asked for feedback.' }),
    });

    const { compactedMessages } = await service.compact({
      messages: [
        new HumanMessage([
          { type: 'text', text: 'Look at this:' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
        ]),
        new AIMessage('Nice design!'),
        new HumanMessage([{ type: 'file', mediaType: 'image/jpeg', data: 'def' }]),
      ],
      query: 'Summarize',
    });

    expect(compactedMessages[0]!.content).toContain('2 image(s)');
    expect(compactedMessages[0]!.content).toContain('omitted');
  });
});
