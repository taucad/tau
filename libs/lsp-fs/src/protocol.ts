/**
 * Custom LSP-style requests for workspace filesystem access (VS Code html/css pattern).
 *
 * @public
 */

import { RequestType } from 'vscode-languageserver-protocol';
import { z } from 'zod';

import { bytesToBase64Wire } from '#base64-wire.js';

/**
 * JSON-RPC server-error reserved range for `fs/*` semantic failures.
 * Values stay inside the JSON-RPC spec's -32099..-32000 implementation-defined window.
 *
 * @public
 */
export const lspFsErrorCode = {
  fileNotFound: -32_802,
} as const;

/** @public */
export type LspFsErrorCode = (typeof lspFsErrorCode)[keyof typeof lspFsErrorCode];

/**
 * VS Code-compatible file entry kind for `fs/readDir` results.
 *
 * @public
 */
export const fileType = {
  unknown: 0,
  file: 1,
  directory: 2,
  symbolicLink: 64,
} as const;

/** @public */
export type FileType = (typeof fileType)[keyof typeof fileType];

/** @public */
export const fileTypeSchema = z.union([
  z.literal(fileType.unknown),
  z.literal(fileType.file),
  z.literal(fileType.directory),
  z.literal(fileType.symbolicLink),
]);

/**
 * File or directory metadata returned by `fs/stat`.
 *
 * @public
 */
export type FileStat = {
  type: FileType;
  /** Milliseconds since Unix epoch. */
  ctime: number;
  /** Milliseconds since Unix epoch. */
  mtime: number;
  /** Bytes. */
  size: number;
};

/** @public */
export const fileStatSchema = z.object({
  type: fileTypeSchema,
  ctime: z.number(),
  mtime: z.number(),
  size: z.number(),
});

/**
 * Payload for `fs/content` responses on the JSON-RPC wire (binary-safe without structured clone).
 *
 * @public
 */
export type FsContentWire = {
  /** Base64 payload of file bytes. */
  dataBase64: string;
};

/** @public */
export const fsContentWireSchema = z.object({
  dataBase64: z.string(),
});

/** @public */
export const fsContentParamsSchema = z.object({
  uri: z.string(),
});

/** @public */
export const fsStatParamsSchema = z.object({
  uri: z.string(),
});

/** @public */
export const fsReadDirectoryParamsSchema = z.object({
  uri: z.string(),
});

/** @public */
export const fsFindFilesParamsSchema = z.object({
  pattern: z.string(),
  max: z.number().optional(),
});

/** @public */
export const fsReadDirectoryResultSchema = z.array(z.tuple([z.string(), fileTypeSchema]));

/** @public */
export const fsFindFilesResultSchema = z.array(z.string());

/**
 * Encode raw file bytes for an `fs/content` JSON-RPC result object.
 *
 * @public
 */
export function encodeFsContentWire(content: Uint8Array<ArrayBuffer>): FsContentWire {
  return { dataBase64: bytesToBase64Wire(content) };
}

/** @public */
export const fsContentRequest = new RequestType<{ uri: string }, FsContentWire, void>('fs/content');

/** @public */
export const fsStatRequest = new RequestType<{ uri: string }, FileStat, void>('fs/stat');

/** @public */
export const fsReadDirectoryRequest = new RequestType<{ uri: string }, Array<[string, FileType]>, void>('fs/readDir');

/** @public */
export const fsFindFilesRequest = new RequestType<{ pattern: string; max?: number }, string[], void>('fs/findFiles');
