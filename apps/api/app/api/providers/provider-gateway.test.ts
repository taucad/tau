/* eslint-disable @typescript-eslint/naming-convention -- Vertex's OpenAI wire uses image_url. */
import { describe, expect, it } from 'vitest';
import { vertexUpstreamBody } from '#api/providers/provider-gateway.js';

const pdfDataUrl = 'data:application/pdf;base64,JVBERg==';

describe('vertexUpstreamBody', () => {
  it('should send a Vertex PDF as an image_url data URI', () => {
    const body = {
      model: 'google/gemini-3.8-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What hole diameter does the spec require?' },
            { type: 'file', file: { filename: 'bracket-spec.pdf', file_data: pdfDataUrl } },
          ],
        },
      ],
    };

    expect(vertexUpstreamBody(body)).toEqual({
      model: 'google/gemini-3.8-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What hole diameter does the spec require?' },
            { type: 'image_url', image_url: { url: pdfDataUrl } },
          ],
        },
      ],
    });
    expect(body.messages[0]?.content[1]).toEqual({
      type: 'file',
      file: { filename: 'bracket-spec.pdf', file_data: pdfDataUrl },
    });
  });
});
