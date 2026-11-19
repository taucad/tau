import type { RevisionTag } from '#revision-port.js';

/**
 * What `createPublication` is asked to record: the body of `POST /v1/publications`.
 * @public
 */
export type PublishPublicationActorInput = Readonly<{
  projectId: string;
  /** The version's tag, `v<number>`: what follows `refs/tags/` (B6). */
  tag: string;
  revisionId: string;
}> &
  Pick<PublishDraft, 'projectName' | 'entryPath' | 'description' | 'visibility' | 'defaultVisibility'>;

/**
 * What `createPublication` answers: the version's row, the project's cloud
 * link, and who can open that link now. @public
 */
export type PublishPublicationActorOutput = Readonly<{
  publicationId: string;
  url: string;
  visibility: PublishVisibility;
}>;

/** What the Share pane and `tau publish` collect before anything is written. @public */
export type PublishDraft = Readonly<{
  /**
   * The version's name, free text. A version on the revision being published
   * with this name (or {@link PublishDraft.version}) is published as it is,
   * renamed when the name differs; otherwise a new version is made.
   */
  tag: string;
  /**
   * The host made {@link PublishDraft.tag} up (`Shared Nov 19`), nobody chose
   * it. When the revision being published already is a version, that version
   * is published under its own name: no second version on one entry, and no
   * rename (revisions policy rule 14).
   */
  isAutoNamed?: boolean;
  /** The number of the version to publish again, when the person picked one. */
  version?: number;
  /** Why this version has a name (the annotated tag's message). */
  note?: string;
  /** The project's own name; the cloud link shows it as its title. */
  projectName: string;
  /** The project's own description; the cloud link shows it under the title. */
  description?: string;
  /** The file a viewer opens with. Must be in the named version's tree. */
  entryPath: string;
  /**
   * Who can open the project's cloud link. Absent keeps the link's setting;
   * a project's first publish is then private.
   */
  visibility?: PublishVisibility;
  /**
   * Who can open the link when this publish makes it, and {@link PublishDraft.visibility} is absent. A link that
   * exists by the time the publish lands keeps its own setting, so a default never changes a link made elsewhere.
   */
  defaultVisibility?: PublishVisibility;
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

/** Who can open the project's cloud link, in the API's own words. @public */
export type PublishVisibility = 'private' | 'public';
