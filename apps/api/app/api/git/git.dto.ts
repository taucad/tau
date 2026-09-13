/* eslint-disable @typescript-eslint/naming-convention -- git-lfs wire fields are snake_case */
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * The git-lfs batch API as the client sends it (git-lfs's own v1 shape, which
 * the browser client in `packages/revisions` mirrors — S49).
 */
export const lfsBatchSchema = z.object({
  operation: z.enum(['upload', 'download']),
  transfers: z.array(z.string()).optional(),
  ref: z.object({ name: z.string() }).optional(),
  hash_algo: z.string().optional(),
  objects: z
    .array(
      z.object({
        oid: z.string().regex(/^[\da-f]{64}$/u),
        size: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      }),
    )
    .min(1)
    .max(1000),
});
export class LfsBatchDto extends createZodDto(lfsBatchSchema) {}

export const lfsVerifySchema = z.object({
  oid: z.string().regex(/^[\da-f]{64}$/u),
  size: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
export class LfsVerifyDto extends createZodDto(lfsVerifySchema) {}

/** `POST /v1/git/proxy?url=` — the remote a browser client cannot reach itself. */
export const gitProxyQuerySchema = z.object({ url: z.url().max(2048) });
export class GitProxyQueryDto extends createZodDto(gitProxyQuerySchema) {}
