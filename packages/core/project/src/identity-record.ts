import { z } from 'zod';
import { projectIdSchema } from '#project-manifest.js';

/** Generated, unversioned identity record relative to a project root. @public */
export const projectIdentityPath = '.tau/project.json';
/** Strict generated identity contract. @public */
export const projectIdentitySchema = z.object({ version: z.literal(1), projectId: projectIdSchema }).strict();
/** Durable identity, independent of authored manifest data. @public */
export type ProjectIdentityRecord = z.infer<typeof projectIdentitySchema>;
/**
 * Validate bounded identity bytes, refusing malformed or unknown records.
 * @param bytes - Encoded generated identity record.
 * @returns The validated identity.
 * @public
 */
export const parseProjectIdentityBytes = (bytes: Uint8Array<ArrayBuffer>): ProjectIdentityRecord => {
  if (bytes.byteLength > 1024) {
    throw new Error('Project identity record exceeds 1024 bytes.');
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return projectIdentitySchema.parse(value);
};
/**
 * Validate and encode the generated identity record.
 * @param record - Generated durable identity.
 * @returns Encoded identity bytes with a trailing newline.
 * @public
 */
export const serializeProjectIdentity = (record: ProjectIdentityRecord): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(`${JSON.stringify(projectIdentitySchema.parse(record))}\n`);
