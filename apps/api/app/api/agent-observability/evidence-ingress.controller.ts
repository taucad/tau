/* oxlint-disable new-cap -- NestJS parameter decorators are factories */
import { Controller, HttpCode, HttpStatus, Post, Req, UnsupportedMediaTypeException } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { evidenceLimits } from '@taucad/agent-observability/contract';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import type { EvidenceReceipt } from '#api/agent-observability/evidence-admission.js';
import { EvidenceIngressService } from '#api/agent-observability/evidence-ingress.service.js';

/** The only media type this route reads; any other body is refused before parsing. */
export const evidenceContentType = 'application/vnd.tau.agent-evidence+json';

/**
 * Agent-evidence ingress (blueprint T06). The envelope arrives as bytes under
 * its own media type and body limit, so the general 50 MiB JSON parser and its
 * validation diagnostics never see it.
 */
@UseAuth()
@Controller({ path: 'agent-observability', version: '1' })
export class EvidenceIngressController implements OnModuleInit {
  public constructor(
    private readonly ingress: EvidenceIngressService,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  /** Admit one evidence envelope and answer with its durable receipt. */
  @Post('evidence')
  @HttpCode(HttpStatus.OK)
  public async admit(@User('id') userId: string, @Req() request: FastifyRequest): Promise<EvidenceReceipt> {
    if (!Buffer.isBuffer(request.body)) {
      throw new UnsupportedMediaTypeException({
        code: 'EVIDENCE_MEDIA_TYPE',
        message: `Send the evidence as ${evidenceContentType}.`,
      });
    }
    return this.ingress.admit(userId, Uint8Array.from(request.body));
  }

  public onModuleInit(): void {
    const fastify = this.adapterHost.httpAdapter.getInstance<FastifyInstance>();
    if (!fastify.hasContentTypeParser(evidenceContentType)) {
      fastify.addContentTypeParser(
        evidenceContentType,
        { parseAs: 'buffer', bodyLimit: evidenceLimits.bytes },
        (_request, body, done) => {
          done(null, body);
        },
      );
    }
  }
}
