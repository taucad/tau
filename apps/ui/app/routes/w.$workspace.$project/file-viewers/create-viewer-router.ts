import type {
  FileViewerContentKind,
  FileViewerProbe,
  ResolvedFileViewer,
  RoutableViewerDefinition,
} from '#routes/w.$workspace.$project/file-viewers/file-viewer.types.js';

export type FileViewerRouter = {
  readonly resolve: (probe: FileViewerProbe) => ResolvedFileViewer;
};

/** Compose immutable viewer definitions with one mandatory fallback per content kind. */
export const createViewerRouter = (definitions: readonly RoutableViewerDefinition[]): FileViewerRouter => {
  const ids = new Set<string>();
  const fallbacks = new Map<FileViewerContentKind, RoutableViewerDefinition>();
  for (const definition of definitions) {
    if (ids.has(definition.id)) {
      throw new Error(`Duplicate file viewer id '${definition.id}'`);
    }
    ids.add(definition.id);
    if (definition.presentation) {
      const viewIds = new Set<string>();
      for (const view of definition.presentation.views) {
        if (!view.label.trim()) {
          throw new Error(`File viewer '${definition.id}' has an empty view label`);
        }
        if (viewIds.has(view.id)) {
          throw new Error(`File viewer '${definition.id}' has duplicate view id '${view.id}'`);
        }
        viewIds.add(view.id);
      }
      if (!viewIds.has(definition.presentation.defaultViewId)) {
        throw new Error(`File viewer '${definition.id}' default view is not registered`);
      }
    }
    if (definition.fallbackFor !== undefined) {
      if (fallbacks.has(definition.fallbackFor)) {
        throw new Error(`Multiple ${definition.fallbackFor} fallbacks registered`);
      }
      fallbacks.set(definition.fallbackFor, definition);
    }
  }
  for (const kind of ['text', 'binary'] as const) {
    if (!fallbacks.has(kind)) {
      throw new Error(`Missing ${kind} fallback`);
    }
  }

  return {
    resolve: (probe) => {
      for (const definition of definitions) {
        if (definition.fallbackFor === undefined) {
          const resolved = definition.resolve(probe);
          if (resolved !== undefined) {
            return resolved;
          }
        }
      }
      const resolved = fallbacks.get(probe.content.kind)?.resolve(probe);
      if (resolved === undefined) {
        throw new Error(`The ${probe.content.kind} fallback did not match its content kind`);
      }
      return resolved;
    },
  };
};
