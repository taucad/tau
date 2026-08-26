import type { ComponentType } from 'react';
import type { ChatEditorViewerProps } from '#routes/w.$workspace.$project/chat-editor-viewer.types.js';
import { ChatEditorCodeViewer } from '#routes/w.$workspace.$project/chat-editor-code-viewer.js';
import { ChatEditorMarkdownViewer } from '#routes/w.$workspace.$project/chat-editor-markdown-viewer.js';
import { ChatEditorPlanViewer } from '#routes/w.$workspace.$project/chat-editor-plan-viewer.js';

type ChatEditorViewerOptions = {
  readonly planModeEnabled: boolean;
};

type ChatEditorViewerEntry = {
  readonly match: (file: { name: string; path: string }, options: ChatEditorViewerOptions) => boolean;
  readonly component: ComponentType<ChatEditorViewerProps>;
};

const registry: readonly ChatEditorViewerEntry[] = [
  {
    match: (file, options) => options.planModeEnabled && file.path.endsWith('.plan.md'),
    component: ChatEditorPlanViewer,
  },
  {
    match: (file) => file.name.endsWith('.md'),
    component: ChatEditorMarkdownViewer,
  },
];

export function resolveViewer(
  file: { name: string; path: string },
  options: ChatEditorViewerOptions,
): ComponentType<ChatEditorViewerProps> {
  const entry = registry.find((viewer) => viewer.match(file, options));
  return entry?.component ?? ChatEditorCodeViewer;
}
