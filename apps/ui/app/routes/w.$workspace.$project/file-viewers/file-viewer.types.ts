import type { ReactNode } from 'react';
import type { editor } from 'monaco-editor';
import type { FileContentResult } from '@taucad/fs-client/file-content-service';

export type FileViewerProbe = {
  readonly paneId: string;
  readonly path: string;
  readonly name: string;
  readonly content:
    | { readonly kind: 'text'; readonly bytes: Uint8Array<ArrayBuffer> }
    | {
        readonly kind: 'binary';
        readonly size: number;
        readonly head: Uint8Array<ArrayBuffer>;
        readonly revision: number;
      };
  readonly options: { readonly planModeEnabled: boolean; readonly readOnly: boolean };
};

export type FileViewerPaneContent = {
  readonly actions?: ReactNode;
  readonly body: ReactNode;
};

export type FileViewerRenderRequest = {
  readonly paneId: string;
  readonly path: string;
  readonly name: string;
  readonly readOnly: boolean;
  readonly viewId?: string;
  readonly resource: {
    readonly outcome: Extract<FileContentResult, { kind: 'text' | 'binary' }>;
    readonly readAll: () => Promise<Uint8Array<ArrayBuffer>>;
  };
  readonly textEditor:
    | {
        readonly language: string;
        readonly onChange: (value: string | undefined) => void;
        readonly onValidate: (markers: editor.IMarkerData[]) => void;
      }
    | undefined;
  readonly binaryFallback: { readonly onForceOpen: () => void } | undefined;
  readonly renderPane: (content: FileViewerPaneContent) => ReactNode;
};

export type FileViewerView = {
  readonly id: string;
  readonly label: string;
};

export type FileViewerPresentation = {
  readonly defaultViewId: string;
  readonly views: readonly FileViewerView[];
};

export type ResolvedFileViewer = {
  readonly id: string;
  readonly requestsFiles: boolean;
  readonly presentation?: FileViewerPresentation;
  readonly render: (request: FileViewerRenderRequest) => ReactNode;
};

export type FileViewerContentKind = FileViewerProbe['content']['kind'];

export type RoutableViewerDefinition = {
  readonly id: string;
  readonly fallbackFor?: FileViewerContentKind;
  readonly requestsFiles?: boolean;
  readonly presentation?: FileViewerPresentation;
  readonly resolve: (probe: FileViewerProbe) => ResolvedFileViewer | undefined;
};

export type ViewerDefinition<Match> = RoutableViewerDefinition & {
  readonly match: (probe: FileViewerProbe) => Match | undefined;
  readonly render: (request: FileViewerRenderRequest, match: Match) => ReactNode;
};
