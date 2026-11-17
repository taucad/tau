import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import type { ChatEditorViewerProps } from '#routes/w.$workspace.$project/chat-editor-viewer.types.js';
import { ChatEditorBinaryWarning } from '@taucad/project-workspace/components/chat-editor-binary-warning';
import { decodeTextFile } from '@taucad/ui-core/utils/filesystem.utils';
import { createViewer } from '#routes/w.$workspace.$project/file-viewers/create-viewer.js';
import { createViewerRouter } from '#routes/w.$workspace.$project/file-viewers/create-viewer-router.js';
import type { FileViewerRenderRequest } from '#routes/w.$workspace.$project/file-viewers/file-viewer.types.js';
import { sniffNativeImageFormat } from '@taucad/project-workspace/utils/native-image-format';
import { NativeImageViewer } from '#routes/w.$workspace.$project/file-viewers/native-image-viewer.js';
import { printerFileKind } from '#components/printer/printer-file-kind.js';
import { EditorPanePlaceholder } from '@taucad/editor-ui/components/code/editor-pane-placeholder';

/*
 * The viewers' bodies load when a file first opens in one (progressive loading PL5): the code viewer brings
 * CodeMirror, the Markdown preview its renderer, the printer viewer react-three. The router, its probes and the
 * pane's frame stay on the project route's interactive tier; a body draws inside the frame when it arrives.
 */
const ChatEditorCodeViewer = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/chat-editor-code-viewer.js');
  return { default: module.ChatEditorCodeViewer };
});
const ChatEditorMarkdownViewer = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/chat-editor-markdown-viewer.js');
  return { default: module.ChatEditorMarkdownViewer };
});
const PrinterViewer = lazy(async () => {
  const module = await import('#components/printer/printer-viewer.js');
  return { default: module.PrinterViewer };
});

const textViewerProperties = (request: FileViewerRenderRequest): ChatEditorViewerProps => {
  if (request.resource.outcome.kind !== 'text' || request.textEditor === undefined) {
    throw new Error(`Viewer '${request.name}' requires text content`);
  }
  return {
    paneId: request.paneId,
    filePath: request.path,
    content: decodeTextFile(request.resource.outcome.content),
    language: request.textEditor.language,
    onApply: request.textEditor.onApply,
    onHistory: request.textEditor.onHistory,
    readOnly: request.readOnly,
  };
};

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
      body: (
        <Suspense fallback={null}>
          <ChatEditorMarkdownViewer {...textViewerProperties(request)} viewId={request.viewId} />
        </Suspense>
      ),
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

const printerViewer = createViewer({
  id: 'printer',
  match: (probe) =>
    printerFileKind(probe.name, probe.content.kind === 'text' ? probe.content.bytes : probe.content.head),
  render: (request, kind) => (
    <Suspense fallback={null}>
      <PrinterViewer
        name={request.name}
        kind={kind}
        revision={request.resource.outcome.kind === 'binary' ? request.resource.outcome.revision : 0}
        readAll={request.resource.readAll}
        renderPane={request.renderPane}
      />
    </Suspense>
  ),
});

const codeViewer = createViewer({
  id: 'code',
  requestsFiles: true,
  fallbackFor: 'text',
  match: (probe) => (probe.content.kind === 'text' ? true : undefined),
  render: (request): ReactNode => {
    const properties = textViewerProperties(request);
    /* The editor's own placeholder, with the file's text in the editor's metrics, until the viewer's chunk is in. */
    return request.renderPane({
      body: (
        <Suspense fallback={<EditorPanePlaceholder label='Loading editor' text={properties.content} />}>
          <ChatEditorCodeViewer {...properties} />
        </Suspense>
      ),
    });
  },
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
  markdownViewer,
  nativeImageViewer,
  printerViewer,
  codeViewer,
  binaryViewer,
]);
