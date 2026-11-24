import { describe, expect, it } from 'vitest';
import type { Root } from 'hast';
import { createChatStreamingFadePlugin, getStreamingArrivalStart } from '#components/markdown/chat-streaming-fade.js';

describe('chat streaming fade', () => {
  it('should find the newly arrived suffix for append-only and rolling streams', () => {
    expect(getStreamingArrivalStart('Alpha', 'Alpha Beta')).toBe(5);
    expect(getStreamingArrivalStart('prefix stable tail', 'stable tail new')).toBe('stable tail'.length);
    expect(getStreamingArrivalStart('same', 'same')).toBe(4);
    expect(getStreamingArrivalStart('old', 'new')).toBe(0);
  });

  it('should leave chat chips stable while adjacent prose fades', () => {
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [
            { type: 'text', value: 'Before ' },
            { type: 'element', tagName: 'mark', properties: {}, children: [{ type: 'text', value: '@main.ts' }] },
            { type: 'text', value: ' after' },
          ],
        },
      ],
    };
    createChatStreamingFadePlugin({ committed: 'Before ' }, () => true)()(tree);

    expect(tree).toMatchObject({
      children: [
        {
          children: [
            { value: 'Before ' },
            { tagName: 'mark', children: [{ value: '@main.ts' }] },
            {
              tagName: 'span',
              properties: { 'data-chat-streaming-fade': '' },
              children: [{ value: ' after' }],
            },
          ],
        },
      ],
    });
  });
});
