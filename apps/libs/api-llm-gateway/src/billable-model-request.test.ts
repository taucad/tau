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
  model: 'gpt-6-luna',
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

/* Chat performance WP-14 step 6: the loop that replaced the regular expressions admits exactly what they did. */
describe('billable-model-request base64 admission', () => {
  const regexBase64 = (value: string): boolean => value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/u.test(value);
  const regexImageUrl = (value: string): boolean => {
    const match = /^data:(image\/[\w.+-]+);base64,(.*)$/u.exec(value);
    return (
      match !== null &&
      (attachmentImageMediaTypes as readonly string[]).includes(match[1] ?? '') &&
      regexBase64(match[2] ?? '')
    );
  };
  const cases = [
    '',
    gifBase64,
    'AAAA',
    'AAA=',
    'AA==',
    'A===',
    'AA=A',
    '=AAA',
    'AAAAA',
    'AA\nA',
    'AA-_',
    'AA AA',
    'ÀAAA',
    'AAA=AAAA',
    'R0lGODlhAQABAAAAADs==',
  ];

  it.each(cases)('should treat the base64 %j as the regular expression did on every wire', (data) => {
    expect(safeParseBillableModelRequest(anthropicImage('image/gif', data), 'anthropic').success).toBe(
      regexBase64(data),
    );
    for (const url of [
      `data:image/gif;base64,${data}`,
      `data:image/png;base64,${data}`,
      `data:image/svg+xml;base64,${data}`,
      `data:image/gif;foo;base64,${data}`,
      `data:;base64,${data}`,
      `xdata:image/gif;base64,${data}`,
      `data:image/gif,${data}`,
    ]) {
      expect(safeParseBillableModelRequest(responsesImage(url), 'openai-responses').success, url).toBe(
        regexImageUrl(url),
      );
    }
  });
});
