import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Environment } from '#config/environment.config.js';
import { OpenAiTranscriptionProvider } from '#api/voice/openai-transcription.provider.js';

const key = process.env.OPENAI_API_KEY ?? '';
const phrase = 'Create a simple bracket with two mounting holes.';

// Speech comes from macOS `say`; the suite skips without the key or off macOS.
describe.skipIf(key === '' || process.platform !== 'darwin')('OpenAI dictation transcription (OPENAI_API_KEY)', () => {
  it('should transcribe synthesized speech', { timeout: 60_000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-voice-live-'));
    try {
      const wavPath = join(directory, 'speech.wav');
      await promisify(execFile)('say', ['-o', wavPath, '--data-format=LEI16@24000', phrase]);
      // Only the key is read; a stub keeps the live suite free of the whole environment schema.
      const config = {
        get: (name: string) => (name === 'OPENAI_API_KEY' ? key : undefined),
      } as unknown as ConfigService<Environment, true>;
      const provider = new OpenAiTranscriptionProvider(config);

      let final = '';
      for await (const event of provider.transcribe({
        audio: new Uint8Array(await readFile(wavPath)),
        contentType: 'audio/wav',
        signal: AbortSignal.timeout(50_000),
      })) {
        if (event.type === 'done') {
          final = event.text;
        }
      }

      expect(final.toLowerCase().replaceAll(/[^a-z ]/gu, '')).toContain(
        'create a simple bracket with two mounting holes',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
