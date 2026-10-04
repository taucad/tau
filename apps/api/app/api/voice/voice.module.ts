import { Module } from '@nestjs/common';
import { OpenAiTranscriptionProvider } from '#api/voice/openai-transcription.provider.js';
import { VoiceController } from '#api/voice/voice.controller.js';
import { VoiceService } from '#api/voice/voice.service.js';
import { transcriptionProvidersKey } from '#api/voice/voice.types.js';

@Module({
  controllers: [VoiceController],
  providers: [
    OpenAiTranscriptionProvider,
    {
      provide: transcriptionProvidersKey,
      useFactory: (openAi: OpenAiTranscriptionProvider) => [openAi],
      inject: [OpenAiTranscriptionProvider],
    },
    VoiceService,
  ],
})
export class VoiceModule {}
