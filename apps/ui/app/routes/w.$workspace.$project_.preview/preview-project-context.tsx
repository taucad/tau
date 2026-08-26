import { createContext, useContext } from 'react';

/** Project metadata shared by portable manifests and built-in examples. */
export type PreviewProjectMetadata = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly assets: { readonly main: { readonly entryPath: string; readonly thumbnail?: string } };
  readonly author?: { readonly name: string; readonly avatar: string };
};

/**
 * Context for project metadata in the preview route.
 * Populated from the static project object (for sample projects) or loaded from storage (for dynamic projects).
 *
 * Extracted to a separate file to avoid module identity issues with React Router's
 * route module loading system, which can cause `createContext()` objects defined in
 * route files to differ between the framework's module instance and regular imports.
 */
export type PreviewProjectContextValue = {
  project: PreviewProjectMetadata | undefined;
  isStaticProject: boolean;
  staticProjectFiles: Record<string, { content: Uint8Array<ArrayBuffer> }> | undefined;
  updateName: (name: string) => void;
  updateDescription: (description: string) => void;
};

export const PreviewProjectContext = createContext<PreviewProjectContextValue | undefined>(undefined);

export function usePreviewProject(): PreviewProjectContextValue {
  const context = useContext(PreviewProjectContext);
  if (!context) {
    throw new Error('usePreviewProject must be used within a PreviewProjectProvider');
  }

  return context;
}
