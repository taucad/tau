import type { RevisionTag } from '#revision-port.js';

/** What `createPublication` is asked to record. @public */
export type PublishPublicationActorInput = Readonly<{
  projectId: string;
  tag: string;
  revisionId: string;
}> &
  PublishDraft;

/** What `createPublication` answers: the row, and the link to copy. @public */
export type PublishPublicationActorOutput = Readonly<{ publicationId: string; url: string }>;

/** What the dialog and `tau publish` collect before anything is written. @public */
export type PublishDraft = Readonly<{
  /** The named version. Existing name re-points it; a new one creates it. */
  tag: string;
  /** Why this version has a name (the annotated tag's message). */
  note?: string;
  /** The project's own name, which the publication's project mirror records. */
  projectName: string;
  /** The file a viewer opens with. Must be in the named version's tree. */
  entryPath: string;
  visibility: PublishVisibility;
  title: string;
  description?: string;
  /** Private publications only. */
  sharedEmails?: readonly string[];
  notifyRecipients?: boolean;
}>;

/** Where a publication is, for the dialog and the projection. @public */
export type PublishFacet = Readonly<{
  phase: 'idle' | 'choosingVersion' | 'working' | 'success' | 'error';
  /** Names this project already has, newest first as the port answers. */
  tags: readonly RevisionTag[];
  publicationId: string | undefined;
  shareUrl: string | undefined;
  error: string | undefined;
}>;

/** Who may see a publication, in the API's own words. @public */
export type PublishVisibility = 'private' | 'public';
