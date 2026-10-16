import { useCallback } from 'react';
import { useSelector } from '@xstate/react';
import type { Rendering } from '@taucad/runtime';
import { ViewerControls } from '@taucad/viewer/cad/viewer-controls';
import { useProject } from '#hooks/use-project.js';
import { CaptureViewControl } from '#components/geometry/cad/capture-view-control.js';
import { useCad, useCadSelector } from '#hooks/use-cad.js';
import { selectCadOperationTimeout } from '#machines/cad.machine.js';
import { defaultOperationTimeout } from '#constants/editor.constants.js';

type ChatViewerControlsProps = Readonly<{
  /** Capture writes to the active chat draft and is unavailable in read-only shared sessions. */
  shouldEnableCapture?: boolean;
  captureRendering?: () => Promise<Rendering>;
  /** The pane's kernel settings, shown in Viewer settings. */
  kernelSettings?: React.ReactNode;
  /** The view and instance menus and the build status segment, at the start of the controls line. */
  leading?: React.ReactNode;
  /** A row directly above the controls line, below any running tool's row: the open issues list. */
  aboveControls?: React.ReactNode;
}>;

/**
 * The project viewer's bar: `@taucad/viewer`'s {@link ViewerControls} with the app's capture and the CAD actor's render
 * timeout.
 */
export function ChatViewerControls({
  shouldEnableCapture = true,
  captureRendering,
  kernelSettings,
  leading,
  aboveControls,
}: ChatViewerControlsProps): React.JSX.Element {
  const cadRef = useCad();
  const operationTimeoutValue = useCadSelector(selectCadOperationTimeout, defaultOperationTimeout);
  const setOperationTimeout = useCallback(
    (operationTimeout: number) => {
      cadRef?.send({ type: 'setOperationTimeout', operationTimeout });
    },
    [cadRef],
  );
  return (
    <ViewerControls
      capture={shouldEnableCapture ? <AvailableCaptureViewControl captureRendering={captureRendering} /> : undefined}
      kernelSettings={kernelSettings}
      operationTimeout={{
        value: operationTimeoutValue,
        defaultValue: defaultOperationTimeout,
        onChange: setOperationTimeout,
      }}
      leading={leading}
      aboveControls={aboveControls}
    />
  );
}

function AvailableCaptureViewControl({
  captureRendering,
}: {
  readonly captureRendering?: () => Promise<Rendering>;
}): React.JSX.Element | undefined {
  const { editorRef } = useProject();
  const chatId = useSelector(editorRef, (snapshot) => snapshot.context.focusedChatId);
  return chatId === undefined ? undefined : <CaptureViewControl captureRendering={captureRendering} />;
}
