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
    let current: Uint8Array<ArrayBuffer>;
    try {
      const metadata = await fileSystem.stat(path);
      if (metadata.isDirectory || metadata.size < minimumPointerBytes || metadata.size > maximumPointerBytes) {
        return;
      }
      current = await fileSystem.readBinaryFile(path);
    } catch {
      /* Absent or unreadable: the write itself answers. */
      return;
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
 * Kernel clients that run only once every large object of the checkout has landed: the kernel reads the model's files
 * itself, so a placeholder would be read as its pointer.
 *
 * @param clients - The evaluate, export, capture and GeoSpec clients.
 * @param largeObjects - The checkout's current large-object facet; `undefined` once everything is local.
 * @returns The same clients, gated.
 */
export const guardLargeObjectKernel = <Clients extends KernelClients>(
  clients: Clients,
  largeObjects: () => LargeObjectsFacet | undefined,
): Clients => {
  const { kernelClient, graphics, images, geospec } = clients;
  return {
    ...clients,
    ...(kernelClient === undefined
      ? {}
      : {
          kernelClient: {
            ...kernelClient,
            evaluateModel: async (input, context) => {
              const facet = largeObjects();
              return facet === undefined
                ? kernelClient.evaluateModel(input, context)
                : largeObjectsPendingResult(facet);
            },
          } satisfies RpcRuntimeClient,
        }),
    ...(graphics === undefined
      ? {}
      : {
          graphics: {
            ...graphics,
            exportModel: async (...parameters) => {
              const facet = largeObjects();
              return facet === undefined ? graphics.exportModel(...parameters) : largeObjectsPendingResult(facet);
            },
          } satisfies RpcGraphicsClient,
        }),
    ...(images === undefined
      ? {}
      : {
          images: {
            ...images,
            captureImages: async (input, context) => {
              const facet = largeObjects();
              return facet === undefined ? images.captureImages(input, context) : largeObjectsPendingResult(facet);
            },
          } satisfies RpcImageClient,
        }),
    ...(geospec === undefined
      ? {}
      : {
          geospec: {
            ...geospec,
            runTests: async (input, context) => {
              const facet = largeObjects();
              return facet === undefined ? geospec.runTests(input, context) : largeObjectsPendingResult(facet);
            },
          } satisfies RpcGeoSpecClient,
        }),
  };
};
