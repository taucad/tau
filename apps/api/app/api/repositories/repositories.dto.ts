import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const defaultPageSize = 100;

const parsePageSize = (value: unknown): number => {
  const parsed = Number.parseInt(typeof value === 'string' ? value : '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, defaultPageSize) : defaultPageSize;
};

export const branchesQuerySchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  cursor: z.string().optional(),
  pageSize: z.preprocess(parsePageSize, z.number().int().min(1).max(defaultPageSize)),
});

export class BranchesQueryDto extends createZodDto(branchesQuerySchema) {}

export const archiveQuerySchema = z.object({
  provider: z.string().optional(),
  target: z.string().optional(),
  owner: z.string().optional(),
  repo: z.string().optional(),
  ref: z.string().optional(),
});

export class ArchiveQueryDto extends createZodDto(archiveQuerySchema) {}

export type GithubBranchesResponse = {
  readonly branches: ReadonlyArray<{ name: string; sha: string; updatedAt: number }>;
  readonly hasMore: boolean;
  readonly endCursor: string | undefined;
};
