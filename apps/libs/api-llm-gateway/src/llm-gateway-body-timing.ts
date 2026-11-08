/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
import { Transform } from 'node:stream';
import type { Readable } from 'node:stream';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { llmGatewayWires, llmRequestEncodings } from '@taucad/telemetry';
import { MetricsService } from '@taucad/api-observability/metrics';

type GatewayWire = (typeof llmGatewayWires)[number];
type RequestEncoding = (typeof llmRequestEncodings)[number];

/** The funded gateway's route prefix; every other request passes through untouched. */
const gatewayPathPrefix = '/v1/llm/';

/**
 * The route family a gateway path belongs to, known from the URL before the body is read.
 *
 * @param url - The request URL, with or without a query.
 * @returns The wire label, or undefined when the request is not a gateway call.
 */
export const gatewayWireOf = (url: string): GatewayWire | undefined => {
  const path = url.split('?', 1)[0] ?? '';
  if (!path.startsWith(gatewayPathPrefix)) {
    return undefined;
  }
  const rest = path.slice(gatewayPathPrefix.length);
  if (rest.startsWith('anthropic/')) {
    return 'anthropic';
  }
  if (rest === 'openai/v1/chat/completions') {
    return 'openai-completions';
  }
  if (rest === 'openai/v1/responses') {
    return 'openai-responses';
  }
  return 'other';
};

/**
 * The request body's content coding as a bounded label.
 *
 * @param header - The `content-encoding` header value, when present.
 * @returns `identity`, `gzip` or `other`.
 */
export const requestEncodingOf = (header: string | string[] | undefined): RequestEncoding => {
  const value = (Array.isArray(header) ? header.join(',') : (header ?? '')).trim().toLowerCase();
  return value === '' || value === 'identity' ? 'identity' : value === 'gzip' ? 'gzip' : 'other';
};

/** The request members the hooks read; the request object itself keys its timing. */
type GatewayRequest = Pick<FastifyRequest, 'url' | 'headers'>;

type BodyTiming = {
  readonly wire: GatewayWire;
  readonly encoding: RequestEncoding;
  readonly headersAt: number;
  bytes: number;
  lastByteAt?: number;
};

/**
 * Measures how long the browser's upload of a gateway request takes, as the API sees it: request
 * headers received (`onRequest`) to the last body byte, counted by a pass-through on the payload
 * stream (`preParsing`), then parse time to `preValidation`. Server-side, so it covers every
 * caller, signed out and headless included, with no client change. Body bytes that arrived in the
 * same read as the headers make a receive time slightly short, never long.
 */
@Injectable()
export class LlmGatewayBodyTiming implements OnModuleInit {
  private readonly timings = new WeakMap<GatewayRequest, BodyTiming>();

  public constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
    @Optional() @Inject(MetricsService) private readonly metrics?: MetricsService,
  ) {}

  public onModuleInit(): void {
    if (!this.metrics) {
      return;
    }
    this.register(this.adapterHost.httpAdapter.getInstance<FastifyInstance>());
  }

  /**
   * Adds the three hooks to a Fastify instance.
   *
   * @param instance - The Fastify instance serving the gateway routes.
   */
  public register(instance: Pick<FastifyInstance, 'addHook'>): void {
    instance.addHook('onRequest', async (request) => {
      this.start(request);
    });
    instance.addHook('preParsing', async (request, _reply, payload) => this.observe(request, payload));
    instance.addHook('preValidation', async (request) => {
      this.finish(request);
    });
  }

  /** `onRequest`: stamps the headers' arrival for a gateway call. */
  public start(request: GatewayRequest): void {
    const wire = gatewayWireOf(request.url);
    if (wire === undefined) {
      return;
    }
    this.timings.set(request, {
      wire,
      encoding: requestEncodingOf(request.headers['content-encoding']),
      headersAt: performance.now(),
      bytes: 0,
    });
  }

  /** `preParsing`: wraps the payload in a byte-counting pass-through that stamps the last byte. */
  public observe<T extends Readable>(request: GatewayRequest, payload: T): T | Transform {
    const timing = this.timings.get(request);
    if (timing === undefined) {
      return payload;
    }
    const counted = new Transform({
      transform(chunk: Uint8Array<ArrayBuffer>, _encoding, callback) {
        timing.bytes += chunk.byteLength;
        timing.lastByteAt = performance.now();
        callback(null, chunk);
      },
    });
    payload.on('error', (error) => counted.destroy(error));
    return payload.pipe(counted);
  }

  /** `preValidation`: records receive, parse and size once the body is parsed. */
  public finish(request: GatewayRequest): void {
    const timing = this.timings.get(request);
    this.timings.delete(request);
    if (timing?.lastByteAt === undefined || !this.metrics) {
      return;
    }
    const wire = { 'tau.llm.wire': timing.wire };
    const coded = { ...wire, 'http.request.encoding': timing.encoding };
    this.metrics.llmGatewayRequestReceiveDuration.record((timing.lastByteAt - timing.headersAt) / 1000, coded);
    this.metrics.llmGatewayRequestParseDuration.record((performance.now() - timing.lastByteAt) / 1000, wire);
    this.metrics.llmGatewayRequestSize.record(timing.bytes, coded);
  }
}
