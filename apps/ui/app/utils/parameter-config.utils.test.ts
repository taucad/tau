import { describe, it, expect } from 'vitest';
import type { FileParameterEntry } from '@taucad/types';
import {
  parseParameterEntry,
  createDefaultEntry,
  getActiveGroupValues,
  updateGroupValues,
  createGroup,
  deleteGroup,
  renameGroup,
  switchActiveGroup,
  serializeParameterEntry,
  validateParameterEntry,
  parameterEntryPath,
  parametersDirectory,
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
      expect(() => parseParameterEntry('{')).toThrow();
    });

    it('should throw on missing activeGroup', () => {
      expect(() => parseParameterEntry('{"groups":{}}')).toThrow('Invalid parameter entry');
    });

    it('should throw on missing groups', () => {
      expect(() => parseParameterEntry('{"activeGroup":"default"}')).toThrow('Invalid parameter entry');
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

  describe('getActiveGroupValues', () => {
    it('should return values of the active group', () => {
      const entry = createTestEntry();
      expect(getActiveGroupValues(entry)).toEqual({
        width: 10,
        height: 20,
      });
    });

    it('should return empty object for undefined entry', () => {
      expect(getActiveGroupValues(undefined)).toEqual({});
    });

    it('should return empty object when active group is missing', () => {
      const entry: FileParameterEntry = {
        activeGroup: 'nonexistent',
        groups: {},
      };
      expect(getActiveGroupValues(entry)).toEqual({});
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

  describe('validateParameterEntry', () => {
    it('should pass for a valid entry', () => {
      expect(() => {
        validateParameterEntry(createTestEntry());
      }).not.toThrow();
    });

    it('should throw on undefined', () => {
      expect(() => {
        validateParameterEntry(undefined);
      }).toThrow('expected a non-null object');
    });

    it('should throw on null', () => {
      expect(() => {
        validateParameterEntry(null);
      }).toThrow('expected a non-null object');
    });

    it('should throw on non-object', () => {
      expect(() => {
        validateParameterEntry('string');
      }).toThrow('expected a non-null object');
    });

    it('should throw on missing activeGroup', () => {
      expect(() => {
        validateParameterEntry({ groups: {} });
      }).toThrow('missing or invalid activeGroup');
    });

    it('should throw on missing groups', () => {
      expect(() => {
        validateParameterEntry({ activeGroup: 'default' });
      }).toThrow('missing or invalid groups object');
    });

    it('should throw on null groups', () => {
      expect(() => {
        validateParameterEntry({ activeGroup: 'default', groups: null });
      }).toThrow('missing or invalid groups object');
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

    it('should throw on undefined input', () => {
      expect(() => serializeParameterEntry(undefined as unknown as FileParameterEntry)).toThrow(
        'expected a non-null object',
      );
    });

    it('should throw on null input', () => {
      expect(() => serializeParameterEntry(null as unknown as FileParameterEntry)).toThrow(
        'expected a non-null object',
      );
    });

    it('should throw on entry missing activeGroup', () => {
      expect(() => serializeParameterEntry({ groups: {} } as unknown as FileParameterEntry)).toThrow(
        'missing or invalid activeGroup',
      );
    });

    it('should throw on entry missing groups', () => {
      expect(() => serializeParameterEntry({ activeGroup: 'default' } as unknown as FileParameterEntry)).toThrow(
        'missing or invalid groups object',
      );
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

  describe('parameterEntryPath', () => {
    it('should return the per-geometry-unit parameter file path', () => {
      expect(parameterEntryPath('main.ts')).toBe(`${parametersDirectory}/main.ts.json`);
    });

    it('should handle nested entry paths', () => {
      expect(parameterEntryPath('src/box.ts')).toBe(`${parametersDirectory}/src/box.ts.json`);
    });
  });
});
