/**
 * Tau's own control metadata, fenced off from every agent-facing write.
 *
 * One wrapper, at the one provider both launchers hand to
 * {@link createProviderRpcFileSystem}: the Node host roots a `NodeFsProvider`
 * at its workspace and the browser worker relays one over the filesystem
 * bridge, and a fence at either construction site alone leaves the other open
 * (3-review S2 / 4-review S5).
 *
 * @module
 */

/**
 * The mutating half of a filesystem provider, spelled structurally so no
 * `@taucad/filesystem` type reaches a consumer's published surface (the dts
 * bundler cannot resolve that barrel's types — R-W2b(host) §4.1).
 */
type MutatingProvider = {
  writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void>;
  appendFile?(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  unlink(path: string): Promise<void>;
  rmdir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
};

/**
 * Directories no agent may write through any host surface.
 *
 * `.tau/chats/**`, `.tau/workspaces/**`, `.tau/revisions/**`, `.jj/**` and
 * `.git/**` are Tau's control metadata (filesystem-authority policy Rule 16):
 * the durable transcript, the revision authority's records and every revision
 * store an engine keeps on a host. An agent that wrote them would be editing
 * the account of its own turn, which VI11 gives the host and nobody else.
 * Reads stay open — an agent that wants to read back its own transcript may.
 *
 * @public
 */
export const maskedDirectories: readonly string[] = Object.freeze([
  '.tau/chats',
  '.tau/workspaces',
  '.tau/revisions',
  '.jj',
  '.git',
]);

/** One refusal code for every masked write, on the ACP `fs/*` handlers and on Tau's own tools alike. @public */
export const maskedPathCode = 'WORKSPACE_MASKED_PATH';

/**
 * Whether a workspace-relative POSIX path lies under a masked directory.
 *
 * @param path - Path relative to the workspace root; a leading `/` is tolerated.
 * @returns `true` when the path is a masked directory or anything beneath one.
 * @public
 */
export const isMaskedPath = (path: string): boolean => {
  const relative = path.replace(/^\/+/u, '');
  return maskedDirectories.some((directory) => relative === directory || relative.startsWith(`${directory}/`));
};

/*
 * A provider speaks POSIX: its callers (the RPC filesystem, the harness tools)
 * classify a thrown error by errno, so a masked write is a permission denial
 * there, and `WORKSPACE_MASKED_PATH` rides along as the reason. The ACP `fs/*`
 * handlers name the code directly (see `packages/host/src/acp/session.ts`).
 */
const refuse = (path: string): never => {
  throw Object.assign(new Error(`This agent may read but not write ${path}; Tau records that itself.`), {
    code: 'EPERM',
    reason: maskedPathCode,
  });
};

const guard = (path: string): string => (isMaskedPath(path) ? refuse(path) : path);

/**
 * The same provider with every mutation under a masked directory refused.
 *
 * Reads, `stat`, `readdir` and `exists` pass straight through. One wrapper at
 * the root beats a check in every tool: the MCP endpoint, the Tau harness's
 * file tools and the RPC filesystem all share this one provider (R-W3 §5.3).
 *
 * `appendFile` is guarded where the provider has one — `.tau/chats/events.jsonl`
 * is an append-only file, and it is the most attractive target for the single
 * mutation a fence forgets (3-review S5). It is inherited rather than wrapped
 * when absent, so a provider that never implements it keeps saying so.
 *
 * The wrapper delegates through `Object.create`, so it fits any provider whose
 * state is reachable from the prototype chain; a provider holding `#private`
 * fields would throw on the first inherited call and must be masked at its own
 * construction instead.
 *
 * @param provider - A provider rooted at the workspace.
 * @returns A provider that refuses masked writes with {@link maskedPathCode}.
 * @public
 */
export const maskWorkspaceWrites = <T extends MutatingProvider>(provider: T): T =>
  Object.assign(Object.create(provider) as T, {
    writeFile: async (path: string, data: Uint8Array<ArrayBuffer> | string) => provider.writeFile(guard(path), data),
    mkdir: async (path: string, options?: { recursive?: boolean }) => provider.mkdir(guard(path), options),
    unlink: async (path: string) => provider.unlink(guard(path)),
    rmdir: async (path: string) => provider.rmdir(guard(path)),
    rename: async (from: string, to: string) => provider.rename(guard(from), guard(to)),
    ...(provider.appendFile
      ? {
          appendFile: async (path: string, data: Uint8Array<ArrayBuffer> | string) =>
            provider.appendFile?.(guard(path), data),
        }
      : {}),
  });
