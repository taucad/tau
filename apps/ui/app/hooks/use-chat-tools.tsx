import { useCallback } from 'react';
import { useActorRef } from '@xstate/react';
import { createActor, waitFor } from 'xstate';
import type { FileEditInput, MyUIMessage } from '@taucad/chat';
import type { ChatOnToolCallCallback } from 'ai';
import { toolName } from '@taucad/chat/constants';
import { fileEditMachine } from '#machines/file-edit.machine.js';
import { screenshotRequestMachine } from '#machines/screenshot-request.machine.js';
import { decodeTextFile, encodeTextFile } from '#utils/filesystem.utils.js';
import { useBuild } from '#hooks/use-build.js';
import { useFileManager } from '#hooks/use-file-manager.js';

type UseChatToolsReturn = {
  readonly onToolCall: ChatOnToolCallCallback<MyUIMessage>;
};

export function useChatTools(): UseChatToolsReturn {
  const { graphicsRef: graphicsActor, getMainFilename } = useBuild();
  const fileManager = useFileManager();
  const fileEditRef = useActorRef(fileEditMachine);

  const onToolCall: ChatOnToolCallCallback<MyUIMessage> = useCallback(
    async ({ toolCall }) => {
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

        if (fileEditSnapshot.matches('error')) {
          throw new Error(`File edit failed: ${fileEditSnapshot.context.error ?? 'Unknown error'}`);
        }

        const { result } = fileEditSnapshot.context;
        if (!result?.editedContent) {
          throw new Error('No content received from file edit service');
        }

        // Write the edited content to the file
        fileManager.writeFile(resolvedPath, encodeTextFile(result.editedContent));
      }

      if (toolCall.toolName === toolName.imageAnalysis) {
        await new Promise<void>((resolve, reject) => {
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
            onSuccess(_dataUrls) {
              screenshotActor.stop();
              resolve();
            },
            onError(error) {
              screenshotActor.stop();
              reject(new Error(`Screenshot capture failed: ${error}`));
            },
          });
        });
      }
    },
    [fileEditRef, fileManager, getMainFilename, graphicsActor],
  );

  return {
    onToolCall,
  };
}
