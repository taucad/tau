import { describe, it, expect } from 'vitest';
import type { MyUIMessage } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import {
  hasModelVisibleImagePart,
  validateImageParts,
  validateModelImageInputSupport,
} from '#api/chat/utils/validate-image-parts.js';

function makeMessage(parts: MyUIMessage['parts']): MyUIMessage {
  const message: MyUIMessage = {
    id: 'msg-1',
    role: 'user',
    parts,
    createdAt: new Date(),
  } as unknown as MyUIMessage;
  return message;
}

describe('validateImageParts', () => {
  it('should pass messages with no image parts', () => {
    const messages = [makeMessage([{ type: 'text', text: 'Hello' }])];
    expect(() => {
      validateImageParts(messages);
    }).not.toThrow();
  });

  it('should pass messages with small image parts', () => {
    const smallBase64 = 'A'.repeat(1000);
    const messages = [
      makeMessage([{ type: 'file', mediaType: 'image/jpeg', url: `data:image/jpeg;base64,${smallBase64}` }]),
    ];
    expect(() => {
      validateImageParts(messages);
    }).not.toThrow();
  });

  it('should throw for image parts exceeding 5 MB base64', () => {
    const largeBase64 = 'A'.repeat(6 * 1024 * 1024);
    const messages = [
      makeMessage([{ type: 'file', mediaType: 'image/png', url: `data:image/png;base64,${largeBase64}` }]),
    ];
    expect(() => {
      validateImageParts(messages);
    }).toThrow('Image exceeds 5 MB base64 limit');
  });

  it('should include human-readable error with image size info', () => {
    const largeBase64 = 'A'.repeat(6 * 1024 * 1024);
    const messages = [
      makeMessage([{ type: 'file', mediaType: 'image/png', url: `data:image/png;base64,${largeBase64}` }]),
    ];
    expect(() => {
      validateImageParts(messages);
    }).toThrow(/\d+\.\d+ MB/);
  });

  it('should validate across all messages, not just the last', () => {
    const largeBase64 = 'A'.repeat(6 * 1024 * 1024);
    const messages = [
      makeMessage([{ type: 'file', mediaType: 'image/jpeg', url: `data:image/jpeg;base64,${largeBase64}` }]),
      makeMessage([{ type: 'text', text: 'Another message' }]),
    ];
    expect(() => {
      validateImageParts(messages);
    }).toThrow('Image exceeds 5 MB base64 limit');
  });

  it('should not validate non-image file parts', () => {
    const largeBase64 = 'A'.repeat(6 * 1024 * 1024);
    const messages = [
      makeMessage([{ type: 'file', mediaType: 'application/pdf', url: `data:application/pdf;base64,${largeBase64}` }]),
    ];
    expect(() => {
      validateImageParts(messages);
    }).not.toThrow();
  });
});

describe('validateModelImageInputSupport', () => {
  it('should pass text-only messages for a text-only model', () => {
    const messages = [makeMessage([{ type: 'text', text: 'Hello' }])];

    expect(hasModelVisibleImagePart(messages)).toBe(false);
    expect(() => {
      validateModelImageInputSupport({
        messages,
        modelName: 'together-glm-5.2',
        supportsImageInput: false,
      });
    }).not.toThrow();
  });

  it('should reject image file parts for a text-only model', () => {
    const messages = [makeMessage([{ type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,AAA' }])];

    expect(hasModelVisibleImagePart(messages)).toBe(true);
    expect(() => {
      validateModelImageInputSupport({
        messages,
        modelName: 'together-glm-5.2',
        supportsImageInput: false,
      });
    }).toThrow('together-glm-5.2 cannot read image attachments');
  });

  it('should reject screenshot tool image outputs for a text-only model', () => {
    const messages = [
      makeMessage([
        {
          type: `tool-${toolName.screenshot}`,
          output: { images: [{ view: 'front', dataUrl: 'data:image/png;base64,AAA' }] },
        },
      ] as unknown as MyUIMessage['parts']),
    ];

    expect(hasModelVisibleImagePart(messages)).toBe(true);
    expect(() => {
      validateModelImageInputSupport({
        messages,
        modelName: 'together-glm-5.2',
        supportsImageInput: false,
      });
    }).toThrow('Switch to a vision-capable model or remove the image');
  });

  it('should allow image parts for a vision-capable model', () => {
    const messages = [makeMessage([{ type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,AAA' }])];

    expect(() => {
      validateModelImageInputSupport({
        messages,
        modelName: 'anthropic-claude-sonnet-5',
        supportsImageInput: true,
      });
    }).not.toThrow();
  });
});
