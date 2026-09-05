import { HttpStatus } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import type { LlmGatewayErrorType } from '#api/llm/llm-gateway.error.js';

const allowedAnthropicVersions = new Set(['2023-06-01']);
const allowedAnthropicBetas = new Set(['fine-grained-tool-streaming-2025-05-14', 'interleaved-thinking-2025-05-14']);

export const readSingleHeader = (
  request: FastifyRequest,
  name: string,
  duplicateErrorType: LlmGatewayErrorType = 'INVALID_REQUEST',
): string | undefined => {
  const values: string[] = [];
  const rawHeaders = request.raw.rawHeaders;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === name) {
      values.push(rawHeaders[index + 1] ?? '');
    }
  }
  const normalized = request.headers[name];
  if (values.length === 0) {
    if (Array.isArray(normalized)) {
      values.push(...normalized);
    } else if (normalized !== undefined) {
      values.push(normalized);
    }
  }
  if (values.length > 1) {
    throw new LlmGatewayError(HttpStatus.BAD_REQUEST, duplicateErrorType, `Duplicate ${name} headers are not allowed.`);
  }
  return values[0];
};

export const validateAnthropicHeaders = (input: {
  readonly version?: string;
  readonly beta?: string;
}): { readonly version: string; readonly beta?: string } => {
  const version = input.version?.trim() || '2023-06-01';
  if (!allowedAnthropicVersions.has(version)) {
    throw new LlmGatewayError(HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', 'Unsupported anthropic-version header.');
  }
  if (input.beta === undefined || input.beta.trim() === '') {
    return { version };
  }
  const betas = input.beta.split(',').map((value) => value.trim());
  if (betas.some((value) => value === '') || new Set(betas).size !== betas.length) {
    throw new LlmGatewayError(HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', 'Invalid anthropic-beta header.');
  }
  if (betas.some((value) => !allowedAnthropicBetas.has(value))) {
    throw new LlmGatewayError(HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', 'Unsupported anthropic-beta header.');
  }
  return { version, beta: betas.join(',') };
};
