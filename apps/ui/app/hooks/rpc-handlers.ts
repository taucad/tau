/**
 * RPC Handlers Browser Adapter
 *
 * Thin adapter that bridges browser-specific dependencies (fileManager, XState actors,
 * WebGL) to the transport-agnostic RPC handler interfaces in @taucad/chat/rpc.
 *
 * The core handler logic lives in libs/chat/src/rpc/handlers/. This module only
 * adapts browser-specific deps into the abstract RpcDependencies interface.
 */
import { createActor, waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type {
  RpcCall,
  GetKernelResultRpcResult,
  CaptureObservationsRpcResult,
  CaptureScreenshotRpcResult,
  FetchGeometryRpcResult,
  Observation,
  ViewSide,
} from '@taucad/chat';
import { createRpcDispatcher } from '@taucad/chat/rpc';
import type { RpcDependencies, RpcFileSystem, RpcKernelClient, RpcGraphicsClient } from '@taucad/chat/rpc';
import type { FileEntry } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { screenshotRequestMachine, orthographicViews } from '#machines/screenshot-request.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { buildMachine } from '#machines/build.machine.js';
import { decodeTextFile, encodeTextFile } from '#utils/filesystem.utils.js';

/** Source of file write operations */
type FileWriteSource = 'editor' | 'user' | 'machine';

/**
 * Dependencies required for RPC execution.
 */
export type RpcHandlerDependencies = {
  fileManager: {
    readFile: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
    writeFile: (path: string, data: Uint8Array<ArrayBuffer>, options: { source: FileWriteSource }) => Promise<void>;
    deleteFile: (path: string, options: { source: FileWriteSource }) => Promise<void>;
  };
  graphicsRef: ActorRefFrom<typeof graphicsMachine> | undefined;
  buildRef: ActorRefFrom<typeof buildMachine>;
  fileTree: Map<string, FileEntry>;
  screenshotQuality: number;
};

/**
 * RPC call input structure with toolCallId.
 */
export type RpcCallInput = RpcCall & {
  toolCallId: string;
};

function createBrowserRpcFileSystem(
  fileManager: RpcHandlerDependencies['fileManager'],
  fileTree: Map<string, FileEntry>,
): RpcFileSystem {
  return {
    async readFile(path: string): Promise<string> {
      const data = await fileManager.readFile(path);
      return decodeTextFile(data);
    },
    async writeFile(path: string, content: string): Promise<void> {
      await fileManager.writeFile(path, encodeTextFile(content), { source: 'machine' });
    },
    async writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
      await fileManager.writeFile(path, new Uint8Array(data.buffer) as Uint8Array<ArrayBuffer>, { source: 'machine' });
    },
    async deleteFile(path: string): Promise<void> {
      await fileManager.deleteFile(path, { source: 'machine' });
    },
    async readdir(path: string): Promise<Array<{ name: string; type: 'file' | 'directory'; size: number }>> {
      const entries: Array<{ name: string; type: 'file' | 'directory'; size: number }> = [];

      for (const [entryPath, entry] of fileTree.entries()) {
        const parentPath = entryPath.includes('/') ? entryPath.slice(0, entryPath.lastIndexOf('/')) : '';
        if (parentPath === path) {
          entries.push({
            name: entry.name,
            type: entry.type === 'dir' ? 'directory' : 'file',
            size: entry.size,
          });
        }
      }

      return entries;
    },
    async exists(path: string): Promise<boolean> {
      return fileTree.has(path);
    },
  };
}

function createBrowserKernelClient(buildRef: ActorRefFrom<typeof buildMachine>): RpcKernelClient {
  return {
    async getKernelResult(targetFile: string): Promise<GetKernelResultRpcResult> {
      try {
        const buildSnapshot = buildRef.getSnapshot();
        const { compilationUnits } = buildSnapshot.context;
        let cadUnit = compilationUnits.get(targetFile);

        if (!cadUnit) {
          buildRef.send({ type: 'createCompilationUnit', entryFile: targetFile });
          const refreshed = buildRef.getSnapshot();
          cadUnit = refreshed.context.compilationUnits.get(targetFile);
        }

        if (!cadUnit) {
          return { success: false, errorCode: 'UNKNOWN', message: 'Failed to create compilation unit' };
        }

        const cadSnapshot = await waitFor(cadUnit, (state) => state.value === 'ready' || state.value === 'error');

        const kernelIssues = cadSnapshot.context.kernelIssues.get(targetFile);
        const hasErrors = kernelIssues?.some((issue) => issue.severity === 'error') ?? false;
        const status = cadSnapshot.value === 'error' || hasErrors ? 'error' : 'ready';

        return {
          success: true,
          status,
          kernelIssues: kernelIssues ?? [],
        };
      } catch (error) {
        return {
          success: false,
          errorCode: 'UNKNOWN',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  };
}

function createBrowserGraphicsClient(
  graphicsRef: ActorRefFrom<typeof graphicsMachine>,
  buildRef: ActorRefFrom<typeof buildMachine>,
  screenshotQuality: number,
): RpcGraphicsClient {
  return {
    async fetchGeometry(): Promise<FetchGeometryRpcResult> {
      try {
        const buildSnapshot = buildRef.getSnapshot();
        const { compilationUnits, mainEntryFile } = buildSnapshot.context;
        const mainUnit = compilationUnits.get(mainEntryFile);

        if (!mainUnit) {
          return { success: false, errorCode: 'UNKNOWN', message: 'No compilation unit found for main entry file' };
        }

        const cadSnapshot = mainUnit.getSnapshot();
        const geometry = cadSnapshot.context.geometries.find((g) => g.format === 'gltf');

        if (!geometry || geometry.format !== 'gltf') {
          return { success: false, errorCode: 'UNKNOWN', message: 'No GLTF geometry available' };
        }

        return { success: true, glb: geometry.content };
      } catch (error) {
        return {
          success: false,
          errorCode: 'UNKNOWN',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    async captureScreenshot(): Promise<CaptureScreenshotRpcResult> {
      try {
        const src = await new Promise<string>((resolve, reject) => {
          const screenshotActor = createActor(screenshotRequestMachine, {
            input: { graphicsRef },
          }).start();

          screenshotActor.send({
            type: 'requestScreenshot',
            options: {
              output: {
                format: 'image/webp',
                quality: screenshotQuality,
                isPreview: true,
              },
              cameraAngles: [orthographicViews[0]!],
              aspectRatio: 1,
              maxResolution: 800,
              zoomLevel: 1.2,
            },
            onSuccess(dataUrls) {
              screenshotActor.stop();
              const capturedScreenshot = dataUrls[0];
              if (!capturedScreenshot) {
                reject(new Error('No screenshot data received'));
                return;
              }

              resolve(capturedScreenshot);
            },
            onError(errorMessage) {
              screenshotActor.stop();
              reject(new Error(errorMessage));
            },
          });
        });

        return {
          success: true,
          images: [{ view: 'current', dataUrl: src }],
        };
      } catch (error) {
        return {
          success: false,
          errorCode: error instanceof Error ? 'IO_ERROR' : 'UNKNOWN',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    async captureObservations(): Promise<CaptureObservationsRpcResult> {
      try {
        const viewSides: ViewSide[] = ['front', 'back', 'right', 'left', 'top', 'bottom'];
        const viewAngles = orthographicViews.slice(0, 6);

        const observations: Observation[] = [];

        for (const [index, side] of viewSides.entries()) {
          const cameraAngle = viewAngles[index];
          if (!cameraAngle) {
            return {
              success: false,
              errorCode: 'UNKNOWN',
              message: `Missing camera angle for ${side} view`,
            };
          }

          // eslint-disable-next-line no-await-in-loop -- Sequential operation required
          const src = await new Promise<string>((resolve, reject) => {
            const screenshotActor = createActor(screenshotRequestMachine, {
              input: { graphicsRef },
            }).start();

            screenshotActor.send({
              type: 'requestScreenshot',
              options: {
                output: {
                  format: 'image/webp',
                  quality: screenshotQuality,
                  isPreview: true,
                },
                cameraAngles: [cameraAngle],
                aspectRatio: 1,
                maxResolution: 800,
                zoomLevel: 1.2,
              },
              onSuccess(dataUrls) {
                screenshotActor.stop();
                const capturedScreenshot = dataUrls[0];
                if (!capturedScreenshot) {
                  reject(new Error(`No screenshot data received for ${side} view`));
                  return;
                }

                resolve(capturedScreenshot);
              },
              onError(errorMessage) {
                console.error(`[CaptureObservations] ${side} view capture failed:`, errorMessage);
                screenshotActor.stop();
                reject(new Error(errorMessage));
              },
            });
          });

          const observation: Observation = {
            id: generatePrefixedId(idPrefix.observation),
            side,
            src,
          };

          observations.push(observation);
        }

        return { success: true, observations };
      } catch (error) {
        return {
          success: false,
          errorCode: error instanceof Error ? 'IO_ERROR' : 'UNKNOWN',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  };
}

/**
 * Return type for createRpcHandlers
 */
export type RpcHandlers = {
  executeRpcCall: (rpcCall: RpcCallInput) => Promise<unknown>;
};

/**
 * Creates RPC handlers with the given browser dependencies.
 * Adapts browser-specific deps to abstract RpcDependencies, then delegates
 * to createRpcDispatcher from @taucad/chat/rpc.
 */
export function createRpcHandlers(deps: RpcHandlerDependencies): RpcHandlers {
  const { fileManager, graphicsRef, buildRef, fileTree, screenshotQuality } = deps;

  const rpcDeps: RpcDependencies = {
    fileSystem: createBrowserRpcFileSystem(fileManager, fileTree),
    kernelClient: createBrowserKernelClient(buildRef),
    graphics: graphicsRef ? createBrowserGraphicsClient(graphicsRef, buildRef, screenshotQuality) : undefined,
  };

  const dispatcher = createRpcDispatcher(rpcDeps);

  return {
    async executeRpcCall(rpcCall: RpcCallInput): Promise<unknown> {
      return dispatcher.dispatch(rpcCall);
    },
  };
}
