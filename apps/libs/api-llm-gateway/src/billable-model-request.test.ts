/* eslint-disable @typescript-eslint/naming-convention -- native provider wire keys. */
import { attachmentImageMediaTypes } from '@taucad/agent-host/wire';
import { describe, expect, it } from 'vitest';
import { safeParseBillableModelRequest } from '#billable-model-request.js';

/* `GIF89a`, a 1×1 screen and a trailer: enough bytes to be a GIF a chat stored. */
const gifBase64 = 'R0lGODlhAQABAAAAADs=';

const anthropicImage = (mediaType: string, data: string) => ({
  model: 'claude-sonnet-5',
  stream: true,
  max_tokens: 16,
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'what is this?' },
        { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
      ],
    },
  ],
});
const responsesImage = (url: string) => ({
  model: 'gpt-5.6-luna',
  stream: true,
  max_output_tokens: 16,
  input: [
    {
      role: 'user',
      content: [
        { type: 'input_text', text: 'what is this?' },
        { type: 'input_image', image_url: url },
      ],
    },
  ],
});
const completionsImage = (url: string) => ({
  model: 'google/gemini-3.5-flash',
  stream: true,
  max_completion_tokens: 16,
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'what is this?' },
        { type: 'image_url', image_url: { url } },
      ],
    },
  ],
});

describe('billable-model-request image admission', () => {
  it('should accept a stored GIF on every provider wire, so chats that already hold one still send', () => {
    expect(safeParseBillableModelRequest(anthropicImage('image/gif', gifBase64), 'anthropic').success).toBe(true);
    expect(
      safeParseBillableModelRequest(responsesImage(`data:image/gif;base64,${gifBase64}`), 'openai-responses').success,
    ).toBe(true);
    expect(
      safeParseBillableModelRequest(completionsImage(`data:image/gif;base64,${gifBase64}`), 'openai-completions')
        .success,
    ).toBe(true);
  });

  it.each(attachmentImageMediaTypes)('should accept a %s data URL, a stored image type', (mediaType) => {
    expect(
      safeParseBillableModelRequest(responsesImage(`data:${mediaType};base64,${gifBase64}`), 'openai-responses')
        .success,
    ).toBe(true);
  });

  it.each(['image/heic', 'image/avif', 'image/jpg', 'image/svg+xml'])(
    'should refuse %s, which Tau does not store',
    (mediaType) => {
      expect(safeParseBillableModelRequest(anthropicImage(mediaType, gifBase64), 'anthropic').success).toBe(false);
      expect(
        safeParseBillableModelRequest(responsesImage(`data:${mediaType};base64,${gifBase64}`), 'openai-responses')
          .success,
      ).toBe(false);
    },
  );
});
