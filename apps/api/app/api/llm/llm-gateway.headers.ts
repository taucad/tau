import { BadRequestException, HttpStatus } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import { financialIdentitySchema } from '@taucad/billing';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import type { LlmGatewayErrorType } from '#api/llm/llm-gateway.error.js';
import { httpHeader } from '#constants/http-header.constant.js';

const allowedAnthropicVersions = new Set(['2023-06-01']);
const allowedAnthropicBetas = new Set(['fine-grained-tool-streaming-2025-05-14', 'interleaved-thinking-2025-05-14']);

/** Rejects query inputs that are absent from the funded request identity. */
export const assertNoQuery = (request: FastifyRequest): void => {
  if (request.query === null || typeof request.query !== 'object' || Object.keys(request.query).length > 0) {
    throw new BadRequestException('Query parameters are not supported');
  }
};

/** Cancels provider work when either side of the caller transport closes prematurely. */
export const invocationSignal = (request: FastifyRequest, reply: FastifyReply): AbortSignal => {
  const controller = new AbortController();
  request.raw.once('aborted', () => {
    controller.abort(new DOMException('Request aborted', 'AbortError'));
  });
  reply.raw.once('close', () => {
    if (!reply.raw.writableFinished) {
      controller.abort(new DOMException('Response closed', 'AbortError'));
    }
  });
  return controller.signal;
};

export const readSingleHeader = (
  request: FastifyRequest,
  name: string,
  duplicateErrorType: LlmGatewayErrorType = 'INVALID_REQUEST',
): string | undefined => {
  const values: string[] = [];
  const { rawHeaders } = request.raw;
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
  const version = input.version?.trim() ?? '2023-06-01';
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

/**
 * Reads an optional header against its contract, keeping only a value that
 * satisfies it. Unlike `validateAttemptId` this never refuses: the members it
 * feeds are nullable at every layer, and a malformed one must not refuse a turn
 * the caller is paying for. A *duplicated* header is still a 400 — that is
 * `readSingleHeader`'s contract, shared with `x-tau-attempt-id`.
 *
 * @param value - The single header value, or undefined when it was not sent.
 * @param contract - What the value must satisfy to be kept.
 * @returns The parsed value, or undefined when it was absent or malformed.
 */
export const readOptionalHeader = <T>(value: string | undefined, contract: ZodType<T>): T | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const parsed = contract.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

/**
 * Best-effort attribution: the opaque owner-scoped id a project or chat hint
 * carries, held to the same bound the ledger admits it under so a hint can never
 * reach `admissionHistorySchema` as a 500.
 *
 * @param value - The header value, or undefined when it was not sent.
 * @returns The id, or undefined when it was absent or not an admissible identity.
 */
export const readHint = (value: string | undefined): string | undefined =>
  readOptionalHeader(value, financialIdentitySchema);

/**
 * The optional attribution every gateway route reads the same way, as members
 * ready to spread into a relay input.
 *
 * @param request - The incoming gateway request.
 * @returns The hints the caller sent, each present only when it parsed.
 */
export const readAttribution = (
  request: FastifyRequest,
): { readonly projectHint?: string; readonly chatHint?: string } => {
  const projectHint = readHint(readSingleHeader(request, httpHeader.xTauProjectId));
  const chatHint = readHint(readSingleHeader(request, httpHeader.xTauChatId));
  return {
    ...(projectHint === undefined ? {} : { projectHint }),
    ...(chatHint === undefined ? {} : { chatHint }),
  };
};

/** Validates the required opaque version-1 invocation identity. */
export const validateAttemptId = (value: string | undefined): string => {
  if (value === undefined || !/^[\u0021-\u007E]{1,128}$/u.test(value)) {
    throw new LlmGatewayError(
      HttpStatus.BAD_REQUEST,
      'INVALID_REQUEST',
      'A valid x-tau-attempt-id header is required.',
    );
  }
  return value;
};
