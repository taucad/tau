import { describe, expect, it } from 'vitest';
import { parsePublicationRecord } from '#routes/v.$id/parsed-publication.js';

describe('parsePublicationRecord', () => {
  const baseRecord = {
    id: 'pub_1',
    title: 'Sample',
    entryFile: 'main.ts',
    visibility: 'public',
    forkCount: 3,
    viewCount: 1234,
    createdAt: '2025-01-01T00:00:00.000Z',
    ownerSnapshot: { id: 'user_1', name: 'Ada Lovelace', image: 'https://cdn.example/ada.png' },
  };

  it('should round-trip ownerSnapshot, forkCount, viewCount, createdAt, entryFile, visibility', () => {
    const parsed = parsePublicationRecord(baseRecord);
    expect(parsed).toEqual({
      id: 'pub_1',
      title: 'Sample',
      description: undefined,
      visibility: 'public',
      viewerRole: 'public',
      entryFile: 'main.ts',
      ownerSnapshot: { id: 'user_1', name: 'Ada Lovelace', image: 'https://cdn.example/ada.png' },
      forkCount: 3,
      viewCount: 1234,
      createdAt: '2025-01-01T00:00:00.000Z',
    });
  });

  it('should return null ownerSnapshot when the field is missing', () => {
    const { ownerSnapshot: _omit, ...withoutSnapshot } = baseRecord;
    const parsed = parsePublicationRecord(withoutSnapshot);
    expect(parsed?.ownerSnapshot).toBeNull();
  });

  it('should return null ownerSnapshot when the field is explicitly null', () => {
    const parsed = parsePublicationRecord({ ...baseRecord, ownerSnapshot: null });
    expect(parsed?.ownerSnapshot).toBeNull();
  });

  it('should return null ownerSnapshot when the shape is malformed', () => {
    const parsed = parsePublicationRecord({ ...baseRecord, ownerSnapshot: { id: 1, name: null } });
    expect(parsed?.ownerSnapshot).toBeNull();
  });

  it('should return undefined when required fields are missing', () => {
    expect(parsePublicationRecord({ ...baseRecord, id: 1 })).toBeUndefined();
    expect(parsePublicationRecord({ ...baseRecord, createdAt: 42 })).toBeUndefined();
    expect(parsePublicationRecord({ ...baseRecord, visibility: 'secret' })).toBeUndefined();
  });

  it('should default missing fork/view counts to 0', () => {
    const { forkCount: _f, viewCount: _v, ...trimmed } = baseRecord;
    const parsed = parsePublicationRecord(trimmed);
    expect(parsed?.forkCount).toBe(0);
    expect(parsed?.viewCount).toBe(0);
  });

  it('should parse viewerRole from the route response', () => {
    const parsed = parsePublicationRecord(baseRecord, 'owner');
    expect(parsed?.viewerRole).toBe('owner');
  });
});
