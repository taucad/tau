import type { EngineeringDiscipline } from '#types/cad.types.js';

export type File = {
  content: Uint8Array<ArrayBuffer>;
  // Could add metadata in the future
  lastModified?: number;
  size?: number;
};

// Individual asset structure for a specific category
export type Asset = {
  main: string; // Points to the main entry file
  parameters: Record<string, unknown>;
  // Could add additional metadata
  version?: string;
  dependencies?: string[];
};

/**
 * Persisted slice of the chat-restore `revisionMachine`, stored on the project
 * record via the project machine's single-writer `updateRevisionState` event so
 * the full-document write always carries a fresh copy. Other tabs converge on
 * their next project load (there is no live cross-tab project-document sync). See
 * docs/research/chat-restore-time-travel.md and
 * docs/research/revision-state-atomic-persistence.md.
 */
export type PersistedRevisionState = {
  /**
   * The head Revision the live FS reflects, by stable user-message id. `''` is
   * the tip sentinel — "follow the newest Revision". Keyed on the message id
   * (never a `createdAt`/anchor timestamp) so re-derivation across persist/reload
   * cannot strand the head; see docs/research/revision-anchor-identity-collapse.md.
   */
  headTurnId: string;
  /** User-message ids of abandoned turns (non-destructive fork; R9). */
  supersededTurnIds: string[];
  /** Live FS diverged from the head via a non-'machine' design write (H6). */
  dirty: boolean;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  author: {
    name: string;
    avatar: string;
  };
  tags: string[];
  thumbnail: string;
  createdAt: number;
  updatedAt: number;
  forkedFrom?: string;
  deletedAt?: number;
  // Status: 'draft' | 'review' | 'published' | 'completed' | 'archived';
  assets: Partial<Record<EngineeringDiscipline, Asset>>;
  /** Chat-restore time-travel state (R16). Absent on legacy/never-restored projects. */
  revisionState?: PersistedRevisionState;
};
