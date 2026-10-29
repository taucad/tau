import type { JSONRPCRequest, JSONRPCResponse } from 'json-rpc-2.0';
import { z } from 'zod';

/** Content identity of the prepared browser bundle, injected by the UI build. */
export type OpenscadLanguageAssets = Readonly<{ url: string; sha256: string }>;

const sha256 = z.string().regex(/^[a-f\d]{64}$/u);
const assetPath = z
  .string()
  .regex(/^[\w./-]+$/u)
  .refine((value) => value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'));

/** The manifest written by prepare-openscad-language-server.mts. */
export const openscadLanguageManifestSchema = z.object({
  format: z.literal('tau-openscad-language-v1'),
  toolchain: z.object({ rust: z.string(), treeSitter: z.string(), grammar: z.string() }),
  module: z.object({ path: assetPath, sha256, byteLength: z.number().int().positive() }),
});

export type OpenscadLanguageManifest = z.infer<typeof openscadLanguageManifestSchema>;

/** Main thread to worker. */
export type OpenscadWorkerCommand =
  | Readonly<{
      type: 'init';
      assets: OpenscadLanguageAssets;
      /** Absolute workspace root, for Tier 0 file-pool keys. */
      rootDirectory: string;
      filePoolBuffer?: SharedArrayBuffer;
    }>
  | Readonly<{ type: 'lsp'; message: string }>
  | Readonly<{ type: 'fs-response'; response: JSONRPCResponse }>
  | Readonly<{ type: 'refresh' }>;

/** Worker to main thread. */
export type OpenscadWorkerEvent =
  | Readonly<{ type: 'ready'; files: number }>
  | Readonly<{ type: 'lsp'; message: string }>
  | Readonly<{ type: 'fs-request'; request: JSONRPCRequest }>
  | Readonly<{ type: 'fatal'; message: string }>;

/** Bounds shared with the server's workspace limits (`MAXIMUM_FILES` in workspace.rs). */
export const openscadWorkspaceLimits = { maximumFiles: 2000 } as const;

/** URI of the generated built-in declarations the server returns for OpenSCAD built-ins. */
export const openscadBuiltinsUri = 'file:///__openscad_builtins__/builtins.scad';
