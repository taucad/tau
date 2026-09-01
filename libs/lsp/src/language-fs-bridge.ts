import { createJSONRPCErrorResponse } from 'json-rpc-2.0';
import type { JSONRPCRequest, JSONRPCResponse, JSONRPCServer } from 'json-rpc-2.0';
import type { FileStat as TauFileStat } from '@taucad/types';
import type { FileSystemClient } from '@taucad/fs-client/file-system-client';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import type { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { SharedPool } from '@taucad/memory';
import {
  encodeFsContentWire,
  fileType,
  fsContentParamsSchema,
  fsContentRequest,
  fsFindFilesParamsSchema,
  fsFindFilesRequest,
  fsReadDirectoryParamsSchema,
  fsReadDirectoryRequest,
  fsStatParamsSchema,
  fsStatRequest,
  lspFsErrorCode,
} from '@taucad/lsp-fs/protocol';
import type { FileStat as WireFileStat, FileType } from '@taucad/lsp-fs/protocol';
import { monacoFileUriToWorkspaceRelative } from '@taucad/lsp-fs/uri';
import { getErrno } from '@taucad/utils/error';
import type { z } from 'zod';

/** @public */
export type LanguageFsBridgeFileManager = Readonly<{
  readFile: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
}>;

/** @public */
export type ServeLanguageFileSystemOptions = Readonly<{
  fileManager: LanguageFsBridgeFileManager;
  treeService: FileTreeService;
  proxy: Pick<FileSystemClient, 'searchFiles'>;
  paths: WorkspacePathResolver;
  filePoolBuffer?: SharedArrayBuffer;
}>;

/** @public */
export type LanguageFsBridgeDisposable = Readonly<{
  dispose(): void;
}>;

function invalidFsRequest(request: JSONRPCRequest, methodLabel: string): JSONRPCResponse {
  return createJSONRPCErrorResponse(request.id ?? 0, -32_600, `Invalid ${methodLabel} request`);
}

type ParseFsParamsResult<S extends z.ZodType> =
  | { ok: false; response: JSONRPCResponse }
  | { ok: true; id: number | string; params: z.output<S> };

function parseFsRequestParams<S extends z.ZodType>(
  request: JSONRPCRequest,
  schema: S,
  methodLabel: string,
): ParseFsParamsResult<S> {
  if (request.id === undefined || request.id === null) {
    return { ok: false, response: invalidFsRequest(request, methodLabel) };
  }

  const parsed = schema.safeParse(request.params);
  if (!parsed.success) {
    return {
      ok: false,
      response: createJSONRPCErrorResponse(request.id, -32_600, `Invalid ${methodLabel} request`),
    };
  }

  return { ok: true, id: request.id, params: parsed.data };
}

function toWireFileStat(stat: TauFileStat): WireFileStat {
  return {
    type: stat.type === 'dir' ? fileType.directory : fileType.file,
    size: stat.size,
    mtime: stat.mtimeMs,
    ctime: stat.mtimeMs,
  };
}

/**
 * Register `fs/*` JSON-RPC handlers on a {@link JSONRPCServer} instance.
 * Tier 0: `SharedPool` copy for `fs/content` when the buffer is supplied.
 *
 * @public
 */
export function serveLanguageFileSystemRequests(
  server: JSONRPCServer,
  options: ServeLanguageFileSystemOptions,
): LanguageFsBridgeDisposable {
  const pool = options.filePoolBuffer ? new SharedPool(options.filePoolBuffer) : undefined;

  server.addMethodAdvanced(fsContentRequest.method, async (request) => {
    const parsed = parseFsRequestParams(request, fsContentParamsSchema, 'fs/content');
    if (!parsed.ok) {
      return parsed.response;
    }

    try {
      const relative = monacoFileUriToWorkspaceRelative(parsed.params.uri);
      const absolute = options.paths.toAbsolutePath(relative);
      if (pool) {
        const cached = pool.resolveCopy(absolute);
        if (cached) {
          return { jsonrpc: '2.0', id: parsed.id, result: encodeFsContentWire(cached) };
        }
      }

      const bytes = await options.fileManager.readFile(relative);
      return { jsonrpc: '2.0', id: parsed.id, result: encodeFsContentWire(bytes) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createJSONRPCErrorResponse(parsed.id, -32_603, message);
    }
  });

  server.addMethodAdvanced(fsStatRequest.method, async (request) => {
    const parsed = parseFsRequestParams(request, fsStatParamsSchema, 'fs/stat');
    if (!parsed.ok) {
      return parsed.response;
    }

    try {
      const relative = monacoFileUriToWorkspaceRelative(parsed.params.uri);
      const stat = await options.treeService.stat(relative);
      return { jsonrpc: '2.0', id: parsed.id, result: toWireFileStat(stat) };
    } catch (error) {
      if (getErrno(error) === 'ENOENT') {
        return createJSONRPCErrorResponse(parsed.id, lspFsErrorCode.fileNotFound, 'ENOENT');
      }

      const message = error instanceof Error ? error.message : String(error);
      return createJSONRPCErrorResponse(parsed.id, -32_603, message);
    }
  });

  server.addMethodAdvanced(fsReadDirectoryRequest.method, async (request) => {
    const parsed = parseFsRequestParams(request, fsReadDirectoryParamsSchema, 'fs/readDir');
    if (!parsed.ok) {
      return parsed.response;
    }

    try {
      const relative = monacoFileUriToWorkspaceRelative(parsed.params.uri);
      const entries = await options.treeService.listDirectory(relative);
      const tuples: Array<[string, FileType]> = entries.map((entry) => [
        entry.name,
        entry.isFolder ? fileType.directory : fileType.file,
      ]);
      return { jsonrpc: '2.0', id: parsed.id, result: tuples };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createJSONRPCErrorResponse(parsed.id, -32_603, message);
    }
  });

  server.addMethodAdvanced(fsFindFilesRequest.method, async (request) => {
    const parsed = parseFsRequestParams(request, fsFindFilesParamsSchema, 'fs/findFiles');
    if (!parsed.ok) {
      return parsed.response;
    }

    try {
      const hits = options.proxy.searchFiles(options.paths.root, parsed.params.pattern, {
        maxResults: parsed.params.max,
        includeDirectories: false,
      });
      const relativePaths = hits.map((hit) => hit.path);
      return { jsonrpc: '2.0', id: parsed.id, result: relativePaths };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createJSONRPCErrorResponse(parsed.id, -32_603, message);
    }
  });

  return {
    dispose(): void {
      server.removeMethod(fsContentRequest.method);
      server.removeMethod(fsStatRequest.method);
      server.removeMethod(fsReadDirectoryRequest.method);
      server.removeMethod(fsFindFilesRequest.method);
    },
  };
}
