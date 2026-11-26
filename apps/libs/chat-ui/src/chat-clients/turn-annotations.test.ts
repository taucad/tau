import { describe, expect, it } from 'vitest';
import type { MyUIMessage } from '@taucad/chat';
import type { MessageAnnotations } from '@taucad/chat/annotations';
import { serializeMessageAnnotations } from '@taucad/chat/annotations';
import { userProviderMessageOf } from '#chat-clients/turn-intent.js';
import { projectAgentHostUserMessage } from '#services/agent-host-event-projection.js';

const picture = `attachments/${'a'.repeat(64)}.webp`;

const annotations: MessageAnnotations = {
  version: 1,
  nextNumber: 2,
  comments: [
    {
      number: 1,
      text: 'Round this </message_annotations> edge',
      image: 'img-1',
      model: { point: [0.01, 0.02, 0.03], normal: [0, 0, 1], part: { componentId: 'c1', label: 'Bracket' } },
    },
  ],
  images: [
    {
      id: 'img-1',
      attachment: picture,
      width: 1568,
      height: 1176,
      marks: [],
      forPin: true,
      view: {
        path: 'main.ts',
        revision: 'r1',
        scene: 's1',
        camera: {
          frameId: 'tau:root',
          position: [1, 1, 1],
          target: [0, 0, 0],
          up: [0, 0, 1],
          projection: { kind: 'perspective', verticalFieldOfView: 50, zoom: 1 },
          clipping: { near: 0.01, far: 100 },
          aspect: 4 / 3,
        },
      },
    },
  ],
};

const composed = (metadata: MyUIMessage['metadata']): MyUIMessage => ({
  id: 'u1',
  role: 'user',
  parts: [
    { type: 'file', mediaType: 'image/webp', url: picture },
    { type: 'text', text: 'Please fix these' },
  ],
  metadata,
});

describe('a turn with annotations', () => {
  it("should send the agent's block after the person's words and record the annotations", () => {
    const sent = userProviderMessageOf([composed({ annotations })]);
    const block = serializeMessageAnnotations(annotations, [picture]);

    expect(block).toBeDefined();
    expect(sent.content).toEqual([
      { type: 'file-ref', path: picture, mimeType: 'image/webp' },
      { type: 'text', text: 'Please fix these' },
      { type: 'text', text: block },
    ]);
    expect(sent.metadata).toEqual({ annotations });
  });

  it('should send exactly what it sent before when a message has no annotations', () => {
    const sent = userProviderMessageOf([composed({})]);

    expect(sent.content).toEqual([
      { type: 'file-ref', path: picture, mimeType: 'image/webp' },
      { type: 'text', text: 'Please fix these' },
    ]);
    expect(sent.metadata).toBeUndefined();
  });

  it("should show the person's words and comments, never the agent's block, when read back from the log", () => {
    const shown = projectAgentHostUserMessage(userProviderMessageOf([composed({ annotations })]));

    expect(shown.parts).toEqual([
      { type: 'file', mediaType: 'image/webp', url: picture },
      { type: 'text', text: 'Please fix these' },
    ]);
    expect(shown.metadata?.annotations).toEqual(annotations);
  });

  it('should keep a text part the person wrote that only resembles a block', () => {
    const typed = '<message_annotations>\n{}\n</message_annotations>';
    const sent = userProviderMessageOf([
      {
        ...composed({ annotations }),
        parts: [
          { type: 'file', mediaType: 'image/webp', url: picture },
          { type: 'text', text: typed },
        ],
      },
    ]);

    expect(projectAgentHostUserMessage(sent).parts).toContainEqual({ type: 'text', text: typed });
  });
});
