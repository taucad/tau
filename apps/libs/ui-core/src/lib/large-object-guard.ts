/**
 * The agent's tools while a project's large objects are still downloading ("open the UI, model waits").
 *
 * A file whose object has not landed holds its Git LFS pointer on disk. Its pointer is never the file's content, so a
 * tool never reads it as text, never writes over it, and never hands the model to a kernel that would read it: each is
 * answered with a retryable "still downloading" error instead.
 */
import type {
  RpcFileSystem,
  RpcGeoSpecClient,
  RpcGraphicsClient,
  RpcImageClient,
  RpcRuntimeClient,
} from '@taucad/chat/rpc';
import { rpcClientErrorCode } from '@taucad/chat';
import { getErrno } from '@taucad/utils/error';
import { resolveRootedPath } from '@taucad/utils/path';
import { FileNotFoundError } from '@taucad/fs-client/file-content-errors';
import type { LargeObjectsFacet } from '@taucad/revisions';

/* A pointer is at most this many bytes (`@taucad/revisions` lfs.ts), and starts with its spec line. */
const maximumPointerBytes = 1024;
/* Its spec line, its sha256 line and the shortest size line: a smaller file is never one, and is never read to check. */
const minimumPointerBytes = 126;
const pointerPrefix = 'version https://git-lfs.github.com/spec/v1\noid sha256:';
const encoder = new TextEncoder();
const prefixBytes = encoder.encode(pointerPrefix);

/**
 * Whether these bytes are a large-object placeholder: a pointer, which never reaches a checkout as content.
 *
 * @param bytes - A file's bytes.
 * @returns `true` for a pointer.
 */
export const isLargeObjectPlaceholder = (bytes: Uint8Array<ArrayBuffer>): boolean =>
  bytes.byteLength <= maximumPointerBytes &&
  bytes.byteLength > prefixBytes.byteLength &&
  prefixBytes.every((byte, index) => bytes[index] === byte);

const isPlaceholderText = (text: string): boolean =>
  text.length <= maximumPointerBytes && text.startsWith(pointerPrefix);

/**
 * The refusal a tool gets for a file still downloading: retryable, and named as a timeout so the model waits and asks
 * again rather than treating the file as missing or broken.
 *
 * @param path - The file.
 * @returns The error to throw.
 */
export const largeObjectDownloadingError = (path: string): Error =>
  Object.assign(
    new Error(`${path} is still downloading from the project's remote. Try again in a moment; it is not empty.`),
    { code: rpcClientErrorCode.operationTimeout, retryable: true },
  );

/**
 * The code a `pendingPaths` rejects with when its host predates the call: the guard checks the file's bytes instead.
 */
export const pendingPathsUnsupportedCode = 'PENDING_PATHS_UNSUPPORTED';

/* Unknown: the file may be a placeholder, so the write waits rather than replace its pointer. */
const undecidedError = (path: string, cause: unknown): Error =>
  Object.assign(new Error(`Could not tell whether ${path} is still downloading. Try again in a moment.`, { cause }), {
    code: rpcClientErrorCode.operationTimeout,
    retryable: true,
  });

/* Only nothing at the path lets a write through unchecked: any other failure leaves it unknown. */
const isAbsent = (error: unknown): boolean => {
  const code = getErrno(error);
  return (
    code === 'ENOENT' ||
    code === 'ENOTDIR' ||
    error instanceof FileNotFoundError ||
    (error instanceof Error && error.name === 'NotFoundError')
  );
};

/**
 * A filesystem whose reads and writes refuse a placeholder.
 *
 * Reads check what they return; writes, edits and appends check the bytes they would replace, so a placeholder is never
 * read as text or overwritten by an edit made against its pointer. Deleting one is allowed: it is the person's file.
 *
 * @param fileSystem - The filesystem the tools use.
 * @returns The same filesystem, guarded.
 */
export const guardLargeObjectFiles = <FileSystem extends RpcFileSystem>(fileSystem: FileSystem): FileSystem => {
  const refuseIfPlaceholder = async (path: string): Promise<void> => {
    /* The index says so without a read: a read of a pending entry would fetch its object (D9). */
    if (fileSystem.pendingPaths !== undefined) {
      let pending: readonly string[] | undefined;
      try {
        pending = await fileSystem.pendingPaths([path]);
      } catch (error) {
        /* A host that predates the call is checked by the file's bytes below; its reads refuse with PENDING. */
        if (getErrno(error) !== pendingPathsUnsupportedCode) {
          throw undecidedError(path, error);
        }
      }
      if (pending !== undefined) {
        if (pending.length > 0) {
          throw largeObjectDownloadingError(path);
        }
        return;
      }
    }
    let current: Uint8Array<ArrayBuffer>;
    try {
      const metadata = await fileSystem.stat(path);
      if (metadata.isDirectory || metadata.size < minimumPointerBytes || metadata.size > maximumPointerBytes) {
        return;
      }
      current = await fileSystem.readBinaryFile(path);
    } catch (error) {
      /* Absent: the write creates it. A pending read is the placeholder's; any other failure leaves it unknown. */
      if (isAbsent(error)) {
        return;
      }
      throw getErrno(error) === 'PENDING' ? largeObjectDownloadingError(path) : undecidedError(path, error);
    }
    if (isLargeObjectPlaceholder(current)) {
      throw largeObjectDownloadingError(path);
    }
  };
  return {
    ...fileSystem,
    readFile: async (path) => {
      const text = await fileSystem.readFile(path);
      if (isPlaceholderText(text)) {
        throw largeObjectDownloadingError(path);
      }
      return text;
    },
    readBinaryFile: async (path) => {
      const bytes = await fileSystem.readBinaryFile(path);
      if (isLargeObjectPlaceholder(bytes)) {
        throw largeObjectDownloadingError(path);
      }
      return bytes;
    },
    writeFile: async (path, content) => {
      await refuseIfPlaceholder(path);
      return fileSystem.writeFile(path, content);
    },
    writeBinaryFile: async (path, data) => {
      await refuseIfPlaceholder(path);
      return fileSystem.writeBinaryFile(path, data);
    },
    writeFileChecked: async (input) => {
      await refuseIfPlaceholder(input.path);
      return fileSystem.writeFileChecked(input);
    },
    appendFile: async (path, content) => {
      await refuseIfPlaceholder(path);
      return fileSystem.appendFile(path, content);
    },
    editFile: async (input) => {
      await refuseIfPlaceholder(input.targetFile);
      return fileSystem.editFile(input);
    },
  };
};

type KernelClients = Readonly<{
  kernelClient?: RpcRuntimeClient | undefined;
  graphics?: RpcGraphicsClient | undefined;
  images?: RpcImageClient | undefined;
  geospec?: RpcGeoSpecClient | undefined;
}>;

/*
 * A caller's path as the facet names it, checkout-relative: an agent's `targetFile` may carry a leading `/` or `./`,
 * repaired as the project-path tool inputs are. A path that cannot be made rooted stays as it was, and matches nothing.
 */
const checkoutPathOf = (path: string): string => {
  try {
    return resolveRootedPath(path.startsWith('/') && !path.startsWith('//') ? path.slice(1) : path);
  } catch {
    return path;
  }
};

/** What a kernel run reads before anything else: named paths, or the whole workspace. */
export type KernelClosure = readonly string[] | 'workspace';

/**
 * The closure of a kernel run over one entry (T6): `tau.json` and the entry, whichever kernel runs it. Any other
 * pending path the kernel opens is read through to its object and waits for it (D9), and a kernel that mirrors the
 * whole workspace lists a pending path at its object's size (`@taucad/filesystem` pending stats), so a mirror needs
 * no wider closure.
 *
 * @param entryPath - The entry the kernel runs; empty while the project names none.
 * @returns The closure.
 */
export const kernelClosure = (entryPath: string): readonly string[] => {
  const path = checkoutPathOf(entryPath);
  return path === '' ? ['tau.json'] : ['tau.json', path];
};

/**
 * Whether a closure still holds a pending large object.
 *
 * @param closure - See {@link kernelClosure}.
 * @param pendingPaths - The facet's pending paths.
 * @returns `true` while a path the run reads holds its pointer.
 */
export const closureHasPending = (closure: KernelClosure, pendingPaths: readonly string[]): boolean =>
  closure === 'workspace' ? pendingPaths.length > 0 : closure.some((path) => pendingPaths.includes(path));

/* The facet a run over this closure waits on: a failed fill always, so its reason and retry reach the caller. */
const blockingFacet = (facet: LargeObjectsFacet | undefined, closure: KernelClosure): LargeObjectsFacet | undefined =>
  facet !== undefined && (facet.phase === 'failed' || closureHasPending(closure, facet.paths)) ? facet : undefined;

/**
 * The retryable answer a kernel call gets while any of the checkout's large objects is still to land.
 *
 * @param facet - The checkout's large-object facet.
 * @returns The failure result.
 */
export const largeObjectsPendingResult = (
  facet: LargeObjectsFacet,
): Readonly<{ success: false; errorCode: 'OPERATION_TIMEOUT'; message: string; retryable: true }> => ({
  success: false,
  errorCode: rpcClientErrorCode.operationTimeout,
  message:
    facet.phase === 'failed'
      ? `The model's large files did not finish downloading (${String(facet.objects)} of ${String(facet.totalObjects)}): ${facet.error ?? 'the transfer failed'}. They are retried from the viewer; try again after.`
      : `The model's large files are still downloading (${String(facet.objects)} of ${String(facet.totalObjects)} files). Try again in a moment.`,
  retryable: true,
});

/**
 * Kernel clients that run once the large objects of their closure have landed ({@link kernelClosure}), as the viewer
 * does: an export or capture over an entry, by that entry; GeoSpec, which may run any file, over the whole workspace.
 *
 * @param clients - The evaluate, export, capture and GeoSpec clients.
 * @param largeObjects - The checkout's current large-object facet; `undefined` once everything is local.
 * @returns The same clients, gated.
 */
export const guardLargeObjectKernel = <Clients extends KernelClients>(
  clients: Clients,
  largeObjects: () => LargeObjectsFacet | undefined,
): Clients => {
  /* The answer a run over this closure gets now, or `undefined` when it may run. */
  const refusal = (closure: KernelClosure): ReturnType<typeof largeObjectsPendingResult> | undefined => {
    const blocking = blockingFacet(largeObjects(), closure);
    return blocking === undefined ? undefined : largeObjectsPendingResult(blocking);
  };
  const { kernelClient, graphics, images, geospec } = clients;
  return {
    ...clients,
    ...(kernelClient === undefined
      ? {}
      : {
          kernelClient: {
            ...kernelClient,
            evaluateModel: async (input, context) => {
              return refusal(kernelClosure(input.targetFile)) ?? kernelClient.evaluateModel(input, context);
            },
          } satisfies RpcRuntimeClient,
        }),
    ...(graphics === undefined
      ? {}
      : {
          graphics: {
            ...graphics,
            exportModel: async (...parameters) => {
              return refusal(kernelClosure(parameters[0].targetFile)) ?? graphics.exportModel(...parameters);
            },
          } satisfies RpcGraphicsClient,
        }),
    ...(images === undefined
      ? {}
      : {
          images: {
            ...images,
            captureImages: async (input, context) => {
              return refusal(kernelClosure(input.targetFile)) ?? images.captureImages(input, context);
            },
          } satisfies RpcImageClient,
        }),
    ...(geospec === undefined
      ? {}
      : {
          geospec: {
            ...geospec,
            runTests: async (input, context) => {
              return refusal('workspace') ?? geospec.runTests(input, context);
            },
          } satisfies RpcGeoSpecClient,
        }),
  };
};
