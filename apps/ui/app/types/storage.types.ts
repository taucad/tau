import type { EditorState, EditorStateInput } from '@taucad/ui-core/types/editor.types';
import type { ProjectLibraryState } from '@taucad/files-ui/types/project-library.types';
import type { AppUiPreferences } from '@taucad/files-ui/types/project-library-io.types';

/**
 * Persistent storage contract for project-local library state and editor state.
 *
 * Chats are *not* here: a chat is files in its project (`ChatStorage` in `@taucad/files-ui/types/chat-storage.types`).
 *
 * Implementors MUST honour the atomic read-modify-write rules captured in
 * `docs/policy/storage-policy.md`: a mutation performs `get → merge → put`
 * inside a single transaction (or equivalent isolation primitive), and
 * concurrent callers for the same id must not lose writes.
 */
export type StorageProvider = {
  // ---------------------------------------------------------------------------
  // Application UI preference operations
  // ---------------------------------------------------------------------------
  getAppUiPreferences(): Promise<AppUiPreferences>;
  setProjectDisclosure(projectId: string, expanded: boolean | undefined): Promise<AppUiPreferences | undefined>;

  // ---------------------------------------------------------------------------
  // Project-library operations
  // ---------------------------------------------------------------------------
  createProjectLibraryState(state: ProjectLibraryState): Promise<ProjectLibraryState>;
  createProjectLibraryStates(states: readonly ProjectLibraryState[]): Promise<ProjectLibraryState[]>;
  getProjectLibraryState(projectId: string): Promise<ProjectLibraryState | undefined>;
  getProjectLibraryStates(projectIds?: readonly string[]): Promise<ProjectLibraryState[]>;
  touchProjectActivity(projectId: string, activityAt?: number): Promise<ProjectLibraryState | undefined>;
  setGeoSpecCandidateConsent(projectId: string, enabled: boolean): Promise<ProjectLibraryState | undefined>;
  trashProject(projectId: string, deletedAt?: number): Promise<ProjectLibraryState | undefined>;
  restoreProject(projectId: string): Promise<ProjectLibraryState | undefined>;
  deleteProjectLibraryState(projectId: string): Promise<void>;

  // ---------------------------------------------------------------------------
  // Editor state operations
  // ---------------------------------------------------------------------------
  getEditorState(projectId: string): Promise<EditorState | undefined>;
  updateEditorState(editorState: EditorStateInput): Promise<EditorState>;
  deleteEditorState(projectId: string): Promise<void>;
};
