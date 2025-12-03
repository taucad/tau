import { useCallback } from 'react';
import { useActorRef } from '@xstate/react';
import type { useChat } from '@ai-sdk/react';
import { createActor, waitFor } from 'xstate';
import type { FileEditInput, FileEditOutput, ImageAnalysisOutput, MyUIMessage } from '@taucad/chat';
import type { ChatOnToolCallCallback } from 'ai';
import { toolName } from '@taucad/chat/constants';
import { fileEditMachine } from '#machines/file-edit.machine.js';
import { screenshotRequestMachine } from '#machines/screenshot-request.machine.js';
import { decodeTextFile, encodeTextFile } from '#utils/filesystem.utils.js';
import { useBuild } from '#hooks/use-build.js';
import { useFileManager } from '#hooks/use-file-manager.js';

// Type for addToolOutput function from useChat
type AddToolOutputFn = ReturnType<typeof useChat<MyUIMessage>>['addToolOutput'];

// Dependencies passed to createOnToolCall for extensibility
export type OnToolCallDependencies = {
  addToolOutput: AddToolOutputFn;
};

// Factory function type that creates the onToolCall callback
export type CreateOnToolCallFn = (dependencies: OnToolCallDependencies) => ChatOnToolCallCallback<MyUIMessage>;

type UseChatToolsReturn = {
  readonly createOnToolCall: CreateOnToolCallFn;
};

export function useChatTools(): UseChatToolsReturn {
  const { graphicsRef: graphicsActor, cadRef: cadActor, getMainFilename } = useBuild();
  const fileManager = useFileManager();
  const fileEditRef = useActorRef(fileEditMachine);

  const createOnToolCall: CreateOnToolCallFn = useCallback(
    ({ addToolOutput }) => {
      return async ({ toolCall }) => {
        if (toolCall.toolName === toolName.fileEdit) {
          const toolCallInput = toolCall.input as FileEditInput;

          // Get current code from build machine
          const mainFilePath = await getMainFilename();
          // Const resolvedPath = toolCallArgs.targetFile; TODO: use this when the chat server has knowledge of the filesystem.
          const resolvedPath = mainFilePath;
          const currentCode = await fileManager.readFile(resolvedPath);

          fileEditRef.start();
          fileEditRef.send({
            type: 'applyEdit',
            request: {
              targetFile: resolvedPath,
              originalContent: decodeTextFile(currentCode),
              codeEdit: toolCallInput.codeEdit,
            },
          });

          // Wait for file edit to complete
          const fileEditSnapshot = await waitFor(
            fileEditRef,
            (state) => state.matches('success') || state.matches('error'),
          );

          const { result } = fileEditSnapshot.context;

          if (!result) {
            throw new Error('No result received from file edit service');
          }

          await fileManager.writeFile(resolvedPath, encodeTextFile(result.editedContent));

          // Wait for CAD processing to complete
          const cadSnapshot = await waitFor(cadActor, (state) => state.value === 'ready' || state.value === 'error');

          const output: FileEditOutput = {
            codeErrors: cadSnapshot.context.codeErrors,
            kernelError: cadSnapshot.context.kernelError,
          };

          // Important: Don't await addToolOutput to avoid deadlocks
          void addToolOutput({ tool: toolName.fileEdit, toolCallId: toolCall.toolCallId, output });
        }

        if (toolCall.toolName === toolName.imageAnalysis) {
          await new Promise<void>((resolve) => {
            // Create screenshot request machine instance
            const screenshotActor = createActor(screenshotRequestMachine, {
              input: { graphicsRef: graphicsActor },
            }).start();

            // Request screenshot capture - backend will handle the Vision API call
            screenshotActor.send({
              type: 'requestScreenshot',
              options: {
                output: {
                  format: 'image/webp',
                  quality: 0.5, // Lower quality for smaller filesize -> less LLM inference token usage.
                },
                aspectRatio: 16 / 9,
                maxResolution: 1200,
                zoomLevel: 1.4,
              },
              onSuccess(dataUrls) {
                screenshotActor.stop();
                const screenshot = dataUrls[0];
                if (!screenshot) {
                  throw new Error('No screenshot data received');
                }

                const output: ImageAnalysisOutput = {
                  analysis: 'Screenshot captured and analyzed',
                  screenshot,
                };
                // Important: Don't await addToolOutput to avoid deadlocks
                void addToolOutput({ tool: toolName.imageAnalysis, toolCallId: toolCall.toolCallId, output });
                resolve();
              },
              onError(errorMessage) {
                screenshotActor.stop();
                const output: ImageAnalysisOutput = {
                  analysis: `Screenshot capture failed: ${errorMessage}`,
                  screenshot: 'failed',
                };
                void addToolOutput({ tool: toolName.imageAnalysis, toolCallId: toolCall.toolCallId, output });
                resolve();
              },
            });
          });
        }
      };
    },
    [cadActor, fileEditRef, fileManager, getMainFilename, graphicsActor],
  );

  return {
    createOnToolCall,
  };
}
