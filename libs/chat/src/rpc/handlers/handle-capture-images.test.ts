import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { rpcName } from '#constants/rpc.constants.js';
import { rpcSchemasRegistry } from '#schemas/rpc.schema.js';
import type { CaptureImagesRpcResult } from '#schemas/rpc.schema.js';
import { handleCaptureImages } from '#rpc/handlers/handle-capture-images.js';
import type { RpcDirectoryEntry, RpcFileSystem, RpcImageClient } from '#rpc/rpc-dependencies.js';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';

const { inputSchema } = rpcSchemasRegistry[rpcName.captureImages];

describe('handleCaptureImages', () => {
  it('should accept the exact task-specific input and optional edge request', () => {
    expect(inputSchema.safeParse({ mode: 'single', targetFile: 'main.ts' }).success).toBe(true);
    expect(inputSchema.safeParse({ mode: 'multi_angle', targetFile: 'main.ts', includeEdges: false }).success).toBe(
      true,
    );
    expect(inputSchema.safeParse({ mode: 'single', targetFile: 'main.ts', width: 800 }).success).toBe(false);
  });

  it('should delegate the complete request to the headless image client', async () => {
    const images = mock<RpcImageClient>();
    images.captureImages.mockResolvedValue({
      success: true,
      images: [{ view: 'isometric', dataUrl: 'data:image/webp;base64,AQ==' }],
    });
    const input: Parameters<typeof handleCaptureImages>[0] = {
      mode: 'single',
      targetFile: 'lib/pen.ts',
      includeEdges: false,
    };

    await expect(handleCaptureImages(input, { images })).resolves.toEqual({
      success: true,
      images: [{ view: 'isometric', dataUrl: 'data:image/webp;base64,AQ==' }],
    });
    expect(images.captureImages).toHaveBeenCalledWith(input, undefined);
  });

  it('should propagate a typed client failure without changing it', async () => {
    const images = mock<RpcImageClient>();
    const failure: CaptureImagesRpcResult = {
      success: false,
      errorCode: 'OPERATION_TIMEOUT',
      message: 'Image render timed out',
    };
    images.captureImages.mockResolvedValue(failure);

    await expect(handleCaptureImages({ mode: 'single', targetFile: 'main.ts' }, { images })).resolves.toEqual(failure);
  });

  it('should fail cleanly when no image client is available', async () => {
    await expect(
      handleCaptureImages({ mode: 'single', targetFile: 'main.ts' }, { images: undefined }),
    ).resolves.toMatchObject({
      success: false,
      message: 'Headless image capture is unavailable',
    });
  });

  it('should pass the exact local invocation context separately from the parsed request', async () => {
    const controller = new AbortController();
    const context = { signal: controller.signal };
    const images = mock<RpcImageClient>();
    images.captureImages.mockResolvedValue({ success: true, images: [] });
    const input = { mode: 'single', targetFile: 'main.ts' } as const;

    await handleCaptureImages(input, { images }, context);

    expect(images.captureImages).toHaveBeenCalledExactlyOnceWith(input, context);
    expect(input).not.toHaveProperty('signal');
  });

  describe('workbenchView', () => {
    const projectOf = (files: Readonly<Record<string, string>>) => {
      const fs = mock<RpcFileSystem>();
      fs.exists.mockImplementation(
        async (path) => path in files || Object.keys(files).some((file) => file.startsWith(`${path}/`)),
      );
      fs.readBinaryFile.mockImplementation(async (path) => new TextEncoder().encode(files[path]));
      fs.readdir.mockImplementation(async (path) =>
        Object.keys(files)
          .filter((file) => file.startsWith(`${path}/`))
          .map(
            (file): RpcDirectoryEntry => ({
              name: file.slice(path.length + 1),
              type: 'file',
              size: 1,
              contentKind: 'text',
              lineCount: 1,
            }),
          ),
      );
      return fs;
    };
    const frontCut = workbenchRecords.view.serialize({
      version: 1,
      entryPath: 'main.ts',
      camera: { kind: 'preset', preset: 'front' },
      fieldOfView: 0,
      section: { active: true, cuts: [{ kind: 'plane', plane: 'xz', offset: 0.006, isFlipped: false }] },
      selectedKernelView: 'model',
      kernelViews: [{ id: 'model', options: { detail: 2 }, camera: { kind: 'look', direction: [1, -1, 0] } }],
    });

    it("should capture the view's file, kernel view, options and kernel-view camera", async () => {
      const images = mock<RpcImageClient>();
      images.captureImages.mockResolvedValue({ success: true, images: [] });

      await handleCaptureImages(
        { mode: 'single', workbenchView: 'front-cut', includeEdges: false },
        { images, fileSystem: projectOf({ [workbenchPaths.view('front-cut')]: frontCut }) },
      );

      expect(images.captureImages).toHaveBeenCalledExactlyOnceWith(
        {
          mode: 'single',
          includeEdges: false,
          targetFile: 'main.ts',
          view: 'model',
          options: { detail: 2 },
          workbenchView: {
            id: 'front-cut',
            camera: { kind: 'look', direction: [1, -1, 0] },
            fieldOfView: 0,
            upDirection: 'z',
            display: {
              surfaces: true,
              lines: true,
              gizmo: true,
              grid: true,
              axes: true,
              matcap: false,
              postProcessing: false,
            },
            section: { active: true, cuts: [{ kind: 'plane', plane: 'xz', offset: 0.006, isFlipped: false }] },
          },
        },
        undefined,
      );
    });

    it('should refuse a missing view naming the saved ones, an invalid record, and another targetFile', async () => {
      const images = mock<RpcImageClient>();
      const project = projectOf({
        [workbenchPaths.view('front-cut')]: frontCut,
        [workbenchPaths.view('broken')]: '{"version":1}',
      });

      await expect(
        handleCaptureImages({ mode: 'single', workbenchView: 'side' }, { images, fileSystem: project }),
      ).resolves.toStrictEqual({
        success: false,
        errorCode: 'FILE_NOT_FOUND',
        message:
          'No workbench view side is saved (.tau/workbench/views/side.json). Saved views: broken, front-cut. Write one with arrange_workbench, or pass targetFile.',
      });
      await expect(
        handleCaptureImages({ mode: 'single', workbenchView: 'broken' }, { images, fileSystem: project }),
      ).resolves.toMatchObject({ success: false, errorCode: 'INVALID_RECORD' });
      await expect(
        handleCaptureImages(
          { mode: 'single', workbenchView: 'front-cut', targetFile: 'other.ts' },
          { images, fileSystem: project },
        ),
      ).resolves.toMatchObject({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'Workbench view front-cut shows main.ts, not other.ts. Omit targetFile to capture the view.',
      });
      expect(images.captureImages).not.toHaveBeenCalled();
    });
  });
});
