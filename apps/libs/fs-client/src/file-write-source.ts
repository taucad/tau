/**
 * The source of a main-thread file write for cache / tree coordination.
 *
 * - **`editor`**: Write came from the Monaco editor (used to avoid redundant refresh work).
 * - **`user`**: Explicit user action (create file, upload, etc.).
 * - **`machine`**: Programmatic source (e.g. AI chat tooling).
 *
 * @public
 * @example <caption>Tag a programmatic write via FileContentService</caption>
 * ```typescript
 * import type { FileContentService } from '@taucad/fs-client/file-content-service';
 * export async function exampleMachineWrite(
 *   content: FileContentService,
 *   bytes: Uint8Array<ArrayBuffer>,
 * ): Promise<void> {
 *   await content.write('main.ts', bytes, 'machine');
 * }
 * ```
 */
export type FileWriteSource = 'editor' | 'user' | 'machine';
