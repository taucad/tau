import type { FileParameterEntry } from '@taucad/types';
import {
  parameterEntryPath as runtimeParameterEntryPath,
  parametersDirectory as runtimeParametersDirectory,
} from '@taucad/runtime/middleware/parameter-file-resolver';

/** Canonical parameter-file path resolver shared with runtime middleware. */
export const parameterEntryPath = (entryPath: string): string => runtimeParameterEntryPath(entryPath);

/** Canonical project-relative parameter-file directory. */
const sharedParametersDirectory = runtimeParametersDirectory;
export const parametersDirectory = sharedParametersDirectory;

const defaultParameterGroupName = 'default';

/**
 * Canonical project-relative directory where per-geometry-unit parameter files are stored.
 * All parameter file paths in the UI app must derive from this constant so that
 * the middleware, watchers, and persistence layers stay in sync.
 */

/**
 * Parse a JSON string into a validated FileParameterEntry.
 * Throws on invalid JSON or missing required fields.
 */
export const parseParameterEntry = (json: string): FileParameterEntry => {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null || !('activeGroup' in parsed) || !('groups' in parsed)) {
    throw new Error('Invalid parameter entry: missing activeGroup or groups');
  }
  return parsed as FileParameterEntry;
};

/**
 * Create a default entry with a single empty default group.
 */
export const createDefaultEntry = (): FileParameterEntry => ({
  activeGroup: defaultParameterGroupName,
  groups: {
    [defaultParameterGroupName]: { values: {} },
  },
});

/** Create the canonical default parameter group populated with values. */
export const createParameterEntry = (values: Record<string, unknown>): FileParameterEntry => ({
  activeGroup: defaultParameterGroupName,
  groups: {
    [defaultParameterGroupName]: { values },
  },
});

/**
 * Get the active parameter group values for an entry.
 * Returns an empty object if the entry is undefined or the active group is missing.
 */
export const getActiveGroupValues = (entry: FileParameterEntry | undefined): Record<string, unknown> => {
  if (!entry) {
    return {};
  }
  return entry.groups[entry.activeGroup]?.values ?? {};
};

/**
 * Return a new entry with updated values for a specific group.
 * Creates the group if it doesn't exist.
 */
export const updateGroupValues = (
  entry: FileParameterEntry,
  options: { groupName: string; values: Record<string, unknown> },
): FileParameterEntry => {
  const { groupName, values } = options;
  return {
    ...entry,
    groups: {
      ...entry.groups,
      [groupName]: { values },
    },
  };
};

/**
 * Create a new parameter group in an entry.
 * Throws if the group already exists.
 */
export const createGroup = (
  entry: FileParameterEntry,
  options: { groupName: string; values?: Record<string, unknown> },
): FileParameterEntry => {
  const { groupName, values = {} } = options;
  if (entry.groups[groupName]) {
    throw new Error(`Parameter group "${groupName}" already exists`);
  }
  return updateGroupValues(entry, { groupName, values });
};

/**
 * Delete a parameter group from an entry.
 * Throws if deleting the active group or if the group doesn't exist.
 */
export const deleteGroup = (entry: FileParameterEntry, groupName: string): FileParameterEntry => {
  if (!entry.groups[groupName]) {
    throw new Error(`Parameter group "${groupName}" does not exist`);
  }
  if (entry.activeGroup === groupName) {
    throw new Error(`Cannot delete the active parameter group "${groupName}"`);
  }

  const { [groupName]: _, ...remainingGroups } = entry.groups;
  return {
    ...entry,
    groups: remainingGroups,
  };
};

/**
 * Rename a parameter group in an entry.
 * Throws if the old name doesn't exist or the new name already exists.
 * Updates `activeGroup` and `order` when they reference the old name.
 */
export const renameGroup = (
  entry: FileParameterEntry,
  options: { oldName: string; newName: string },
): FileParameterEntry => {
  const { oldName, newName } = options;
  if (!entry.groups[oldName]) {
    throw new Error(`Parameter group "${oldName}" does not exist`);
  }
  if (entry.groups[newName]) {
    throw new Error(`Parameter group "${newName}" already exists`);
  }

  const { [oldName]: groupToRename, ...remainingGroups } = entry.groups;
  const updatedOrder = entry.order?.map((name) => (name === oldName ? newName : name));

  return {
    ...entry,
    activeGroup: entry.activeGroup === oldName ? newName : entry.activeGroup,
    ...(updatedOrder ? { order: updatedOrder } : {}),
    groups: {
      ...remainingGroups,
      [newName]: groupToRename!,
    },
  };
};

/**
 * Switch the active parameter group for an entry.
 * Throws if the target group doesn't exist.
 */
export const switchActiveGroup = (entry: FileParameterEntry, groupName: string): FileParameterEntry => {
  if (!entry.groups[groupName]) {
    throw new Error(`Parameter group "${groupName}" does not exist`);
  }
  return {
    ...entry,
    activeGroup: groupName,
  };
};

/**
 * Validate that a value is a structurally sound FileParameterEntry.
 * Throws with a descriptive message on any structural issue.
 */
export function validateParameterEntry(entry: unknown): asserts entry is FileParameterEntry {
  if (typeof entry !== 'object' || entry === null) {
    throw new Error('Invalid parameter entry: expected a non-null object');
  }
  if (!('activeGroup' in entry) || typeof (entry as { activeGroup: unknown }).activeGroup !== 'string') {
    throw new Error('Invalid parameter entry: missing or invalid activeGroup');
  }
  if (
    !('groups' in entry) ||
    typeof (entry as { groups: unknown }).groups !== 'object' ||
    (entry as { groups: unknown }).groups === null
  ) {
    throw new Error('Invalid parameter entry: missing or invalid groups object');
  }
}

/**
 * Serialize a FileParameterEntry to a formatted JSON string.
 *
 * Validates the entry structure before serializing and round-trip
 * parses the output to guarantee the written content is recoverable.
 * Throws if validation or round-trip parsing fails.
 */
export const serializeParameterEntry = (entry: FileParameterEntry): string => {
  validateParameterEntry(entry);
  const json = JSON.stringify(entry, null, 2);
  parseParameterEntry(json);
  return json;
};
