import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import type { FileParameterEntry } from '@taucad/types';
import {
  parseParameterEntry,
  createDefaultEntry,
  createParameterEntry,
  updateGroupValues,
  createGroup,
  deleteGroup,
  renameGroup,
  switchActiveGroup,
  serializeParameterEntry,
} from '#utils/parameter-config.utils.js';

const createTestEntry = (): FileParameterEntry => ({
  activeGroup: 'default',
  groups: {
    default: { values: { width: 10, height: 20 } },
    small: { values: { width: 5, height: 10 } },
  },
});

describe('parameter-config.utils', () => {
  describe('parseParameterEntry', () => {
    it('should parse valid JSON with activeGroup and groups', () => {
      const json = JSON.stringify(createTestEntry());
      const result = parseParameterEntry(json);
      expect(result.activeGroup).toBe('default');
      expect(result.groups['default']?.values).toEqual({ width: 10, height: 20 });
    });

    it('should throw on invalid JSON', () => {
      expect(() => parseParameterEntry('{')).toThrow(SyntaxError);
    });

    it('should throw a schema error for structurally invalid JSON', () => {
      expect(() => parseParameterEntry('{"activeGroup":"default","groups":null}')).toThrow(ZodError);
    });
  });

  describe('createDefaultEntry', () => {
    it('should create entry with a single default group', () => {
      const entry = createDefaultEntry();
      expect(entry.activeGroup).toBe('default');
      expect(Object.keys(entry.groups)).toEqual(['default']);
      expect(entry.groups['default']?.values).toEqual({});
    });
  });

  describe('createParameterEntry', () => {
    it('should create a default group containing nested JSON values', () => {
      const values = { width: 10, options: { enabled: true, sizes: [1, 2, null] } };

      expect(createParameterEntry(values)).toEqual({
        activeGroup: 'default',
        groups: { default: { values } },
      });
    });

    it('should reject JSON-unsafe values before returning an entry', () => {
      expect(() => createParameterEntry({ width: undefined })).toThrow(ZodError);
    });
  });

  describe('updateGroupValues', () => {
    it('should update existing group values immutably', () => {
      const original = createTestEntry();
      const updated = updateGroupValues(original, {
        groupName: 'default',
        values: { width: 99 },
      });

      expect(updated.groups['default']?.values).toEqual({ width: 99 });
      expect(original.groups['default']?.values).toEqual({
        width: 10,
        height: 20,
      });
    });

    it('should create group if it does not exist', () => {
      const original = createTestEntry();
      const updated = updateGroupValues(original, {
        groupName: 'large',
        values: { size: 5 },
      });

      expect(updated.groups['large']?.values).toEqual({ size: 5 });
      expect(original.groups['large']).toBeUndefined();
    });

    it('should not mutate the original entry', () => {
      const original = createTestEntry();
      const updated = updateGroupValues(original, {
        groupName: 'default',
        values: { width: 99 },
      });

      expect(updated).not.toBe(original);
      expect(updated.groups).not.toBe(original.groups);
    });

    it('should reject JSON-unsafe values before returning an update', () => {
      expect(() =>
        updateGroupValues(createTestEntry(), { groupName: 'default', values: { width: Number.NaN } }),
      ).toThrow(ZodError);
    });
  });

  describe('createGroup', () => {
    it('should create a new group with provided values', () => {
      const entry = createTestEntry();
      const updated = createGroup(entry, {
        groupName: 'large',
        values: { width: 100, height: 200 },
      });

      expect(updated.groups['large']?.values).toEqual({
        width: 100,
        height: 200,
      });
    });

    it('should create a new group with empty values by default', () => {
      const entry = createTestEntry();
      const updated = createGroup(entry, { groupName: 'empty' });

      expect(updated.groups['empty']?.values).toEqual({});
    });

    it('should throw if group already exists', () => {
      const entry = createTestEntry();
      expect(() => createGroup(entry, { groupName: 'default' })).toThrow('already exists');
    });
  });

  describe('deleteGroup', () => {
    it('should delete a non-active group', () => {
      const entry = createTestEntry();
      const updated = deleteGroup(entry, 'small');

      expect(updated.groups['small']).toBeUndefined();
      expect(updated.groups['default']).toBeDefined();
    });

    it('should remove a deleted group from the persisted order', () => {
      const entry: FileParameterEntry = {
        ...createTestEntry(),
        order: ['default', 'small'],
      };

      expect(deleteGroup(entry, 'small').order).toEqual(['default']);
    });

    it('should throw when deleting the active group', () => {
      const entry = createTestEntry();
      expect(() => deleteGroup(entry, 'default')).toThrow('Cannot delete the active');
    });

    it('should throw when group does not exist', () => {
      const entry = createTestEntry();
      expect(() => deleteGroup(entry, 'nonexistent')).toThrow('does not exist');
    });

    it('should not mutate the original entry', () => {
      const original = createTestEntry();
      deleteGroup(original, 'small');
      expect(original.groups['small']).toBeDefined();
    });
  });

  describe('renameGroup', () => {
    it('should rename a group and preserve its values', () => {
      const entry = createTestEntry();
      const updated = renameGroup(entry, { oldName: 'small', newName: 'medium' });

      expect(updated.groups['medium']?.values).toEqual({ width: 5, height: 10 });
      expect(updated.groups['small']).toBeUndefined();
      expect(updated.groups['default']).toBeDefined();
    });

    it('should update activeGroup when renaming the active group', () => {
      const entry = createTestEntry();
      const updated = renameGroup(entry, { oldName: 'default', newName: 'primary' });

      expect(updated.activeGroup).toBe('primary');
      expect(updated.groups['primary']?.values).toEqual({ width: 10, height: 20 });
      expect(updated.groups['default']).toBeUndefined();
    });

    it('should not update activeGroup when renaming a non-active group', () => {
      const entry = createTestEntry();
      const updated = renameGroup(entry, { oldName: 'small', newName: 'medium' });

      expect(updated.activeGroup).toBe('default');
    });

    it('should update order array when present', () => {
      const entry: FileParameterEntry = {
        activeGroup: 'default',
        order: ['default', 'small', 'large'],
        groups: {
          default: { values: {} },
          small: { values: {} },
          large: { values: {} },
        },
      };
      const updated = renameGroup(entry, { oldName: 'small', newName: 'medium' });

      expect(updated.order).toEqual(['default', 'medium', 'large']);
    });

    it('should throw when old name does not exist', () => {
      const entry = createTestEntry();
      expect(() => renameGroup(entry, { oldName: 'nonexistent', newName: 'new' })).toThrow('does not exist');
    });

    it('should throw when new name already exists', () => {
      const entry = createTestEntry();
      expect(() => renameGroup(entry, { oldName: 'small', newName: 'default' })).toThrow('already exists');
    });

    it('should reject an empty replacement group name', () => {
      expect(() => renameGroup(createTestEntry(), { oldName: 'small', newName: '' })).toThrow(ZodError);
    });

    it('should not mutate the original entry', () => {
      const original = createTestEntry();
      renameGroup(original, { oldName: 'small', newName: 'medium' });

      expect(original.groups['small']).toBeDefined();
      expect(original.groups['medium']).toBeUndefined();
    });
  });

  describe('switchActiveGroup', () => {
    it('should switch the active group', () => {
      const entry = createTestEntry();
      const updated = switchActiveGroup(entry, 'small');

      expect(updated.activeGroup).toBe('small');
    });

    it('should throw when target group does not exist', () => {
      const entry = createTestEntry();
      expect(() => switchActiveGroup(entry, 'nonexistent')).toThrow('does not exist');
    });

    it('should not mutate the original entry', () => {
      const original = createTestEntry();
      switchActiveGroup(original, 'small');
      expect(original.activeGroup).toBe('default');
    });
  });

  describe('serializeParameterEntry', () => {
    it('should produce valid JSON that round-trips through parse', () => {
      const entry = createTestEntry();
      const json = serializeParameterEntry(entry);
      const parsed = parseParameterEntry(json);

      expect(parsed).toEqual(entry);
    });

    it('should produce formatted JSON with indentation', () => {
      const entry = createDefaultEntry();
      const json = serializeParameterEntry(entry);

      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });

    it('should reject JSON-unsafe values before serializing', () => {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- intentionally invalid persisted entry for the error path
      const invalidEntry = {
        activeGroup: 'default',
        groups: { default: { values: { width: undefined } } },
      } as unknown as FileParameterEntry;

      expect(() => serializeParameterEntry(invalidEntry)).toThrow(ZodError);
    });

    it('should preserve values after update and serialize round-trip', () => {
      const entry = createTestEntry();
      const updated = updateGroupValues(entry, { groupName: 'default', values: {} });
      const json = serializeParameterEntry(updated);
      const parsed = parseParameterEntry(json);

      expect(parsed.groups['default']?.values).toEqual({});
      expect(parsed.groups['small']?.values).toEqual({ width: 5, height: 10 });
    });
  });
});
