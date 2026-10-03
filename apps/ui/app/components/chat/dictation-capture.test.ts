// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { encodeDictationWav } from '#components/chat/dictation-capture.js';

describe('encodeDictationWav', () => {
  it('should write a mono PCM16 WAV header and clamped little-endian samples across chunks', async () => {
    const wav = encodeDictationWav([new Float32Array([-2, -0.5]), new Float32Array([0, 0.5, 2])], 24_000);
    const view = new DataView(await wav.arrayBuffer());
    const text = (offset: number) => String.fromCodePoint(...new Uint8Array(view.buffer, offset, 4));

    expect(wav.type).toBe('audio/wav');
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect({
      riffSize: view.getUint32(4, true),
      format: view.getUint16(20, true),
      channels: view.getUint16(22, true),
      sampleRate: view.getUint32(24, true),
      byteRate: view.getUint32(28, true),
      bitsPerSample: view.getUint16(34, true),
      dataSize: view.getUint32(40, true),
    }).toEqual({
      riffSize: 36 + 10,
      format: 1,
      channels: 1,
      sampleRate: 24_000,
      byteRate: 48_000,
      bitsPerSample: 16,
      dataSize: 10,
    });
    expect(Array.from({ length: 5 }, (_, index) => view.getInt16(44 + index * 2, true))).toEqual([
      -32_768, -16_384, 0, 16_384, 32_767,
    ]);
  });
});
