/**
 * The one catalog that turns composed-view provenance into copy.
 *
 * Provenance crosses the worker boundary as data only (`source`, `versioned`,
 * `agentAccess`, `identity`, `overrides`); every presentation string a user can
 * read about where an entry's bytes come from is written here and nowhere else.
 *
 * Two rules the wire deliberately does not carry, both from ruling P10:
 *
 * - **The user's access is `source !== 'project'`.** `agentAccess` is the
 *   *agent's* access, and the host UI edits records the agent may only read, so
 *   no user gate ever reads it.
 * - **Dimming is `versioned === false`.** A row whose bytes never enter a
 *   revision is quieter than the design, whatever serves it — with one
 *   exception the canvas draws: a system skill bundle keeps the full foreground,
 *   because its badge already says what it is (a1 review R7).
 *
 * @module
 */

import { classify } from '@taucad/filesystem/path-registry';
import type { FileProvenance } from '@taucad/types';

/** How one row presents its provenance. @public */
export type FileProvenanceLabel = Readonly<{
  /** Leading status glyph, reserved for read-only sources without a badge. */
  glyph?: 'lock';
  /** Trailing badge text, set on the root of a non-project subtree only. */
  badge?: 'system';
  /** Accessible description and hover line; empty when the row is an ordinary project file. */
  description: string;
  /** Whether the name renders muted because the bytes are not saved in revisions. */
  dimmed: boolean;
  /** Whether this UI refuses every user mutation of these bytes. */
  readOnly: boolean;
}>;

const plain: FileProvenanceLabel = Object.freeze({ description: '', dimmed: false, readOnly: false });

/**
 * Why an entry the project owns is not saved in revisions.
 *
 * `versioned: false` alone cannot tell a record from a cache from a generated
 * `tsconfig`, so the storage class answers — the same registry table the view
 * derives `versioned` from, never a prefix test here (a1 review R6).
 */
const unversionedDescription = (path: string): string => {
  switch (classify(path).class) {
    case 'cache': {
      return 'Cache · not saved in revisions';
    }
    case 'records': {
      return 'Tau records · not saved in revisions';
    }
    default: {
      return 'Not saved in revisions';
    }
  }
};

/** The slug inside `skill:<slug>@<version>#<fingerprint>`, the shape `createSkillBundleOverlay` mints. */
const slugOfIdentity = (identity: string): string => identity.replace(/^skill:/u, '').split('@')[0] ?? identity;

/**
 * Describe one entry from its provenance.
 *
 * @param provenance - What the composed view says about the entry, absent for a row no view stamped.
 * @param path - The project-relative path, used only to pick between the two
 *   "not saved in revisions" wordings — `versioned: false` alone cannot tell a
 *   cache from a record, and the storage class is the path registry's answer
 *   (the same table the view derives `versioned` from), never a prefix test here.
 * @returns The row's glyph, badge, description, dimming and user access.
 * @public
 *
 * @example <caption>A system skill bundle</caption>
 * ```typescript
 * import { fileProvenanceLabel } from '#lib/file-provenance-labels.js';
 *
 * export const example = fileProvenanceLabel(
 *   { source: 'system-skills', versioned: false, agentAccess: 'read-only' },
 *   '.agents/skills/cad-openscad',
 * ).description; // 'system skill · read-only'
 * ```
 */
export const fileProvenanceLabel = (provenance: FileProvenance | undefined, path: string): FileProvenanceLabel => {
  if (provenance === undefined) {
    return plain;
  }

  switch (provenance.source) {
    case 'system-skills': {
      return {
        badge: 'system',
        description: 'system skill · read-only',
        /* The one row the dimming rule does not reach: the badge carries it. */
        dimmed: false,
        readOnly: true,
      };
    }
    case 'dependencies': {
      return {
        glyph: 'lock',
        description: 'Dependencies · read-only',
        dimmed: !provenance.versioned,
        readOnly: true,
      };
    }
    case 'project': {
      if (provenance.overrides !== undefined) {
        return {
          description: `Overrides system skill ${slugOfIdentity(provenance.overrides)}`,
          dimmed: false,
          readOnly: false,
        };
      }
      if (provenance.versioned) {
        return plain;
      }
      return { description: unversionedDescription(path), dimmed: true, readOnly: false };
    }
  }
};
