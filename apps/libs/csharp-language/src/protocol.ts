import type { JSONRPCRequest, JSONRPCResponse } from 'json-rpc-2.0';
import { z } from 'zod';

/** Content identity of the prepared browser bundle, injected by the UI build. */
export type CsharpLanguageAssets = Readonly<{ url: string; sha256: string }>;

const sha256 = z.string().regex(/^[a-f\d]{64}$/u);
const assetPath = z
  .string()
  .regex(/^[\w./-]+$/u)
  .refine((value) => value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'));

/** The manifest written by prepare-csharp-language-server.mts. */
export const csharpLanguageManifestSchema = z.object({
  format: z.literal('tau-csharp-language-v1'),
  toolchain: z.object({ sdk: z.string(), runtime: z.string(), picoGk: z.string() }),
  bootstrap: assetPath,
  references: assetPath,
  files: z.array(z.object({ path: assetPath, sha256, byteLength: z.number().int().nonnegative() })).min(1),
});

export type CsharpLanguageManifest = z.infer<typeof csharpLanguageManifestSchema>;

/** Main thread to worker. */
export type CsharpWorkerCommand =
  | Readonly<{
      type: 'init';
      assets: CsharpLanguageAssets;
      /** Absolute workspace root, for Tier 0 file-pool keys. */
      rootDirectory: string;
      filePoolBuffer?: SharedArrayBuffer;
    }>
  | Readonly<{ type: 'lsp'; message: string }>
  | Readonly<{ type: 'fs-response'; response: JSONRPCResponse }>
  | Readonly<{ type: 'refresh' }>;

/** Worker to main thread. */
export type CsharpWorkerEvent =
  | Readonly<{ type: 'ready'; files: number }>
  | Readonly<{ type: 'lsp'; message: string }>
  | Readonly<{ type: 'fs-request'; request: JSONRPCRequest }>
  | Readonly<{ type: 'fatal'; message: string }>;

/** Bounds shared with the server's workspace limits. */
export const csharpWorkspaceLimits = { maximumFiles: 1000 } as const;

/** Prefix of the generated declaration URIs the server returns for library symbols. */
export const csharpMetadataUriPrefix = 'file:///__csharp_metadata__/';
