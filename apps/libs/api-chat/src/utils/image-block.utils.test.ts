/* eslint-disable @typescript-eslint/naming-convention -- LangChain content blocks use snake_case (image_url) */
import { describe, it, expect } from 'vitest';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import {
  isImageBlock,
  stripImageBlocks,
  countImageBlocks,
  extractTextFromContent,
  IMAGE_TOKEN_ESTIMATE,
} from '#utils/image-block.utils.js';

describe('isImageBlock', () => {
  it('should detect image_url blocks', () => {
    expect(isImageBlock({ type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } })).toBe(true);
  });

  it('should detect image blocks (Anthropic format)', () => {
    expect(isImageBlock({ type: 'image', source: { data: 'abc' } })).toBe(true);
  });

  it('should detect file parts with image mediaType', () => {
    expect(isImageBlock({ type: 'file', mediaType: 'image/jpeg', data: 'abc' })).toBe(true);
    expect(isImageBlock({ type: 'file', mediaType: 'image/png', data: 'abc' })).toBe(true);
    expect(isImageBlock({ type: 'file', mediaType: 'image/webp', data: 'abc' })).toBe(true);
  });

  it('should not detect text blocks', () => {
    expect(isImageBlock({ type: 'text', text: 'hello' })).toBe(false);
  });

  it('should not detect file parts with non-image mediaType', () => {
    expect(isImageBlock({ type: 'file', mediaType: 'application/pdf', data: 'abc' })).toBe(false);
  });

  it('should not detect reasoning blocks', () => {
    expect(isImageBlock({ type: 'reasoning', reasoning: 'thinking...' })).toBe(false);
  });
});

describe('stripImageBlocks', () => {
  it('should replace image_url blocks with [image] markers', () => {
    const messages = [
      new HumanMessage([
        { type: 'text', text: 'Look at this:' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
      ]),
    ];

    const result = stripImageBlocks(messages);
    expect(result).toHaveLength(1);
    const content = result[0]!.content as Array<{ type: string; text?: string }>;
    expect(content[0]).toEqual({ type: 'text', text: 'Look at this:' });
    expect(content[1]).toEqual({ type: 'text', text: '[image]' });
  });

  it('should replace file parts with image mediaType with [image] markers', () => {
    const messages = [new HumanMessage([{ type: 'file', mediaType: 'image/jpeg', data: 'abc' }])];

    const result = stripImageBlocks(messages);
    const content = result[0]!.content as Array<{ type: string; text?: string }>;
    expect(content[0]).toEqual({ type: 'text', text: '[image]' });
  });

  it('should preserve string-content messages', () => {
    const messages = [new HumanMessage('just text')];
    const result = stripImageBlocks(messages);
    expect(result[0]!.content).toBe('just text');
  });

  it('should preserve text and reasoning blocks', () => {
    const messages = [
      new AIMessage([
        { type: 'reasoning', reasoning: 'thinking' },
        { type: 'text', text: 'response' },
      ]),
    ];

    const result = stripImageBlocks(messages);
    const content = result[0]!.content as Array<Record<string, unknown>>;
    expect(content[0]).toEqual({ type: 'reasoning', reasoning: 'thinking' });
    expect(content[1]).toEqual({ type: 'text', text: 'response' });
  });
});

describe('countImageBlocks', () => {
  it('should count images across all messages', () => {
    const messages = [
      new HumanMessage([
        { type: 'text', text: 'Look:' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,a' } },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,b' } },
      ]),
      new HumanMessage([{ type: 'file', mediaType: 'image/jpeg', data: 'c' }]),
    ];

    expect(countImageBlocks(messages)).toBe(3);
  });

  it('should return 0 for text-only messages', () => {
    const messages = [new HumanMessage('no images'), new AIMessage('also no images')];
    expect(countImageBlocks(messages)).toBe(0);
  });
});

describe('extractTextFromContent', () => {
  it('should return string content directly', () => {
    expect(extractTextFromContent('hello')).toBe('hello');
  });

  it('should extract only text parts from multimodal content', () => {
    const content = [
      { type: 'text', text: 'Look at this:' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
      { type: 'text', text: 'What do you think?' },
    ];

    expect(extractTextFromContent(content)).toBe('Look at this:\nWhat do you think?');
  });

  it('should handle content with only images', () => {
    const content = [{ type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }];

    expect(extractTextFromContent(content)).toBe('');
  });

  it('should extract reasoning blocks', () => {
    const content = [
      { type: 'reasoning', reasoning: 'thinking...' },
      { type: 'text', text: 'answer' },
    ];

    expect(extractTextFromContent(content)).toBe('thinking...\nanswer');
  });
});

describe('IMAGE_TOKEN_ESTIMATE', () => {
  it('should be 2000 (conservative cross-provider upper bound)', () => {
    expect(IMAGE_TOKEN_ESTIMATE).toBe(2000);
  });
});
