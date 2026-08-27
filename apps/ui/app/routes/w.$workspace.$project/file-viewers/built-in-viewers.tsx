import type { ReactNode } from 'react';
import type { ChatEditorViewerProps } from '#routes/w.$workspace.$project/chat-editor-viewer.types.js';
import { ChatEditorCodeViewer } from '#routes/w.$workspace.$project/chat-editor-code-viewer.js';
import { ChatEditorMarkdownViewer } from '#routes/w.$workspace.$project/chat-editor-markdown-viewer.js';
import { ChatEditorPlanViewer } from '#routes/w.$workspace.$project/chat-editor-plan-viewer.js';
import { ChatEditorBinaryWarning } from '#routes/w.$workspace.$project/chat-editor-binary-warning.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';
import { createViewer } from '#routes/w.$workspace.$project/file-viewers/create-viewer.js';
import { createViewerRouter } from '#routes/w.$workspace.$project/file-viewers/create-viewer-router.js';
import type { FileViewerRenderRequest } from '#routes/w.$workspace.$project/file-viewers/file-viewer.types.js';
import { sniffNativeImageFormat } from '#routes/w.$workspace.$project/file-viewers/native-image-format.js';
import { NativeImageViewer } from '#routes/w.$workspace.$project/file-viewers/native-image-viewer.js';

const textViewerProperties = (request: FileViewerRenderRequest): ChatEditorViewerProps => {
  if (request.resource.outcome.kind !== 'text' || request.textEditor === undefined) {
    throw new Error(`Viewer '${request.name}' requires text content`);
  }
  return {
    paneId: request.paneId,
    filePath: request.path,
    content: decodeTextFile(request.resource.outcome.content),
    language: request.textEditor.language,
    onChange: request.textEditor.onChange,
    onValidate: request.textEditor.onValidate,
    readOnly: request.readOnly,
  };
};

const planViewer = createViewer({
  id: 'plan',
  requestsFiles: true,
  match: (probe) =>
    probe.content.kind === 'text' && probe.options.planModeEnabled && probe.path.endsWith('.plan.md')
      ? true
      : undefined,
  render: (request): ReactNode =>
    request.renderPane({ body: <ChatEditorPlanViewer {...textViewerProperties(request)} /> }),
});

const markdownViewer = createViewer({
  id: 'markdown',
  requestsFiles: true,
  presentation: {
    defaultViewId: 'preview',
    views: [
      { id: 'preview', label: 'Preview' },
      { id: 'source', label: 'Source' },
    ],
  },
  match: (probe) => (probe.content.kind === 'text' && probe.name.toLowerCase().endsWith('.md') ? true : undefined),
  render: (request): ReactNode =>
    request.renderPane({
      body: <ChatEditorMarkdownViewer {...textViewerProperties(request)} viewId={request.viewId} />,
    }),
});

const nativeImageViewer = createViewer({
  id: 'native-image',
  match: (probe) =>
    sniffNativeImageFormat(probe.content.kind === 'text' ? probe.content.bytes : probe.content.head, {
      allowSvg: probe.content.kind === 'text',
    }),
  render: (request, format) => (
    <NativeImageViewer
      name={request.name}
      format={format}
      revision={request.resource.outcome.kind === 'binary' ? request.resource.outcome.revision : 0}
      readAll={request.resource.readAll}
      renderPane={request.renderPane}
    />
  ),
});

const codeViewer = createViewer({
  id: 'code',
  requestsFiles: true,
  fallbackFor: 'text',
  match: (probe) => (probe.content.kind === 'text' ? true : undefined),
  render: (request): ReactNode =>
    request.renderPane({ body: <ChatEditorCodeViewer {...textViewerProperties(request)} /> }),
});

const binaryViewer = createViewer({
  id: 'binary-warning',
  fallbackFor: 'binary',
  match: (probe) => (probe.content.kind === 'binary' ? true : undefined),
  render: (request): ReactNode => {
    if (request.binaryFallback === undefined) {
      throw new Error(`Viewer '${request.name}' requires a binary fallback action`);
    }
    return request.renderPane({ body: <ChatEditorBinaryWarning onForceOpen={request.binaryFallback.onForceOpen} /> });
  },
});

export const fileViewerRouter = createViewerRouter([
  planViewer,
  markdownViewer,
  nativeImageViewer,
  codeViewer,
  binaryViewer,
]);
