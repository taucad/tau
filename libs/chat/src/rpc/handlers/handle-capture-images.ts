import { workbenchPaths, workbenchRecords } from '@taucad/workbench';

import type { CaptureImagesRpcInput, CaptureImagesRpcResult } from '#schemas/rpc.schema.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import type {
  CaptureImagesClientInput,
  RpcFileSystem,
  RpcImageClient,
  RpcInvocationContext,
} from '#rpc/rpc-dependencies.js';

type Refusal = Extract<CaptureImagesRpcResult, { success: false }>;

const refuse = (errorCode: Refusal['errorCode'], message: string): Refusal => ({ success: false, errorCode, message });

/* `.tau/workbench/views`: the folder every view record lives in. */
const viewsFolder = workbenchPaths.view('v').slice(0, -'/v.json'.length);

/** The view ids saved in the project, for a refusal to name. */
const savedViews = async (fileSystem: RpcFileSystem): Promise<string> => {
  try {
    if (!(await fileSystem.exists(viewsFolder))) {
      return 'none';
    }
    const entries = await fileSystem.readdir(viewsFolder);
    const ids = entries
      .map(({ name }) => name)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length));
    return ids.length === 0 ? 'none' : ids.sort().join(', ');
  } catch {
    return 'unknown';
  }
};

/**
 * Resolve `workbenchView` against `.tau/workbench/views/<id>.json`: its entry, kernel view and their saved choices
 * become the capture's target, and its camera, field of view, cuts and display travel to the image client.
 *
 * @param input - The screenshot input.
 * @param fileSystem - The project's live root, where the workbench records live.
 * @returns The client input, or a refusal naming the saved views.
 */
const resolveWorkbenchView = async (
  input: CaptureImagesRpcInput,
  fileSystem: RpcFileSystem | undefined,
): Promise<CaptureImagesClientInput | Refusal> => {
  const { workbenchView: id, ...rest } = input;
  if (id === undefined) {
    if (rest.targetFile === undefined) {
      return refuse(rpcClientErrorCode.validationError, 'Give targetFile, or workbenchView to capture a saved view.');
    }
    return { ...rest, targetFile: rest.targetFile };
  }
  if (fileSystem === undefined) {
    return refuse(rpcClientErrorCode.unknown, 'This host cannot read workbench views.');
  }
  const path = workbenchPaths.view(id);
  if (!(await fileSystem.exists(path))) {
    return refuse(
      rpcClientErrorCode.fileNotFound,
      `No workbench view ${id} is saved (${path}). Saved views: ${await savedViews(fileSystem)}. Write one with arrange_workbench, or pass targetFile.`,
    );
  }
  const read = workbenchRecords.view.read(await fileSystem.readBinaryFile(path));
  if (read.status !== 'current') {
    return refuse(
      rpcClientErrorCode.invalidRecord,
      read.code === 'NEWER_RECORD'
        ? `Workbench view ${id} was written by a newer Tau; update tau to capture it.`
        : `Workbench view ${id} (${path}) is not valid: ${read.message}`,
    );
  }
  const { record } = read;
  if (record.entryPath === null) {
    return refuse(
      rpcClientErrorCode.validationError,
      `Workbench view ${id} shows no file yet. Give it an entryPath with arrange_workbench, or pass targetFile without workbenchView.`,
    );
  }
  if (rest.targetFile !== undefined && rest.targetFile !== record.entryPath) {
    return refuse(
      rpcClientErrorCode.validationError,
      `Workbench view ${id} shows ${record.entryPath}, not ${rest.targetFile}. Omit targetFile to capture the view.`,
    );
  }
  const kernelView =
    record.selectedKernelView === undefined
      ? undefined
      : record.kernelViews?.find((state) => state.id === record.selectedKernelView);
  return {
    ...rest,
    targetFile: record.entryPath,
    ...(record.selectedKernelView === undefined ? {} : { view: record.selectedKernelView }),
    ...(kernelView?.options === undefined ? {} : { options: kernelView.options }),
    ...(kernelView?.authoredInstance === undefined ? {} : { instance: kernelView.authoredInstance }),
    workbenchView: {
      id,
      camera: kernelView?.camera ?? record.camera,
      fieldOfView: record.fieldOfView,
      upDirection: record.upDirection,
      display: record.display,
      section: record.section,
    },
  };
};

/**
 * Dispatch deterministic image capture without requiring a mounted viewport.
 *
 * @param input - The screenshot input.
 * @param deps - The image client, and the project file system a `workbenchView` is read from.
 * @param context - The invocation's signal and progress.
 * @returns The capture, or a typed refusal.
 * @public
 */
export async function handleCaptureImages(
  input: CaptureImagesRpcInput,
  deps: Readonly<{ images: RpcImageClient | undefined; fileSystem?: RpcFileSystem | undefined }>,
  context?: RpcInvocationContext,
): Promise<CaptureImagesRpcResult> {
  const { images, fileSystem } = deps;
  context?.signal?.throwIfAborted();
  if (!images) {
    return {
      success: false,
      errorCode: rpcClientErrorCode.unknown,
      message: 'Headless image capture is unavailable',
    };
  }
  const resolved = await resolveWorkbenchView(input, fileSystem);
  context?.signal?.throwIfAborted();
  if ('success' in resolved) {
    return resolved;
  }
  const result = await images.captureImages(resolved, context);
  context?.signal?.throwIfAborted();
  return result;
}
