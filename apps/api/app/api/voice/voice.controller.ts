import { Readable } from 'node:stream';
import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { dictationMaxAudioBytes } from '@taucad/chat/schemas';
import type { DictationStatus } from '@taucad/chat/schemas';
import { AuthGuard } from '#auth/auth.guard.js';
import { User } from '#auth/decorators/auth.decorator.js';
import { invocationSignal } from '#api/llm/llm-gateway.headers.js';
import { VoiceService } from '#api/voice/voice.service.js';

const audioContentType = 'audio/wav';

/** Provider-neutral dictation: the client posts one WAV and reads NDJSON transcript events. */
@UseGuards(AuthGuard)
@Controller({ path: 'voice', version: '1' })
export class VoiceController implements OnModuleInit {
  // ponytail: one transcription per user per process; a shared limiter when the API scales out.
  private readonly active = new Set<string>();

  public constructor(
    private readonly voice: VoiceService,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  @Get('status')
  public status(): DictationStatus {
    return this.voice.status();
  }

  @Post('transcriptions')
  public async transcribe(
    @User('id') userId: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      throw new BadRequestException(`Send the recording as ${audioContentType}.`);
    }
    if (this.active.has(userId)) {
      throw new HttpException('A dictation is already being transcribed.', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.active.add(userId);
    try {
      const events = await this.voice.transcribe({
        audio: new Uint8Array(request.body),
        contentType: audioContentType,
        signal: invocationSignal(request, reply),
      });
      void reply.status(200).header('content-type', 'application/x-ndjson').header('cache-control', 'no-store');
      await reply.send(
        Readable.from(
          (async function* () {
            for await (const event of events) {
              yield `${JSON.stringify(event)}\n`;
            }
          })(),
        ),
      );
    } finally {
      this.active.delete(userId);
    }
  }

  public onModuleInit(): void {
    const fastify = this.adapterHost.httpAdapter.getInstance<FastifyInstance>();
    if (!fastify.hasContentTypeParser(audioContentType)) {
      fastify.addContentTypeParser(
        audioContentType,
        { parseAs: 'buffer', bodyLimit: dictationMaxAudioBytes },
        (_request, body, done) => {
          done(null, body);
        },
      );
    }
  }
}
