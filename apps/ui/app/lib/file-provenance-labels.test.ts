import { describe, expect, it } from 'vitest';
import type { FileProvenance } from '@taucad/types';
import { fileProvenanceLabel } from '#lib/file-provenance-labels.js';

const provenance = (overrides: Partial<FileProvenance> = {}): FileProvenance => ({
  source: 'project',
  versioned: true,
  agentAccess: 'read-write',
  ...overrides,
});

describe('fileProvenanceLabel', () => {
  it('leaves a versioned project file undecorated', () => {
    expect(fileProvenanceLabel(provenance(), 'main.scad')).toEqual({
      description: '',
      dimmed: false,
      readOnly: false,
    });
  });

  it('badges a system skill bundle without a redundant lock', () => {
    const label = fileProvenanceLabel(
      provenance({ source: 'system-skills', versioned: false, agentAccess: 'read-only' }),
      '.agents/skills/cad-openscad',
    );
    expect(label).toEqual({
      badge: 'system',
      description: 'system skill · read-only',
      dimmed: false,
      readOnly: true,
    });
  });

  it('locks dependencies without a badge', () => {
    expect(
      fileProvenanceLabel(
        provenance({ source: 'dependencies', versioned: false, agentAccess: 'read-only' }),
        'node_modules',
      ),
    ).toEqual({ glyph: 'lock', description: 'Dependencies · read-only', dimmed: true, readOnly: true });
  });

  it('names the bundle a project override replaces', () => {
    expect(
      fileProvenanceLabel(provenance({ overrides: 'skill:my-fixtures@2.0.0#deadbeef' }), '.agents/skills/my-fixtures'),
    ).toEqual({ description: 'Overrides system skill my-fixtures', dimmed: false, readOnly: false });
  });

  it('separates records from cache without either becoming read-only to the user', () => {
    const records = fileProvenanceLabel(provenance({ versioned: false, agentAccess: 'read-only' }), '.tau/chats');
    const cache = fileProvenanceLabel(provenance({ versioned: false }), '.tau/cache');

    expect(records).toEqual({ description: 'Tau records · not saved in revisions', dimmed: true, readOnly: false });
    expect(cache).toEqual({ description: 'Cache · not saved in revisions', dimmed: true, readOnly: false });
  });

  /* Review R6 of a1: three registry rows are unversioned *authored* paths, and a
   * generated tsconfig is neither a record nor a cache. */
  it('does not call a generated file a record', () => {
    expect(fileProvenanceLabel(provenance({ versioned: false }), '.tau/tsconfig.generated.json')).toEqual({
      description: 'Not saved in revisions',
      dimmed: true,
      readOnly: false,
    });
  });

  it('says nothing about a row no view stamped', () => {
    expect(fileProvenanceLabel(undefined, 'main.scad')).toEqual({ description: '', dimmed: false, readOnly: false });
  });

  it('uses no git vocabulary in any description', () => {
    const descriptions = [
      fileProvenanceLabel(provenance({ source: 'system-skills', versioned: false }), '.agents/skills/a'),
      fileProvenanceLabel(provenance({ source: 'dependencies', versioned: false }), 'node_modules'),
      fileProvenanceLabel(provenance({ overrides: 'skill:a@1#b' }), '.agents/skills/a'),
      fileProvenanceLabel(provenance({ versioned: false }), '.tau/chats'),
      fileProvenanceLabel(provenance({ versioned: false }), '.tau/cache'),
    ].map((label) => label.description);

    for (const description of descriptions) {
      expect(description).not.toMatch(/\b(checkout|worktree|lease|backend|ref|HEAD)\b/iu);
    }
  });
});
