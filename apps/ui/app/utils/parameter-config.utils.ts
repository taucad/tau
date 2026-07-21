import { fileParameterEntrySchema } from '@taucad/types';
import type { FileParameterEntry } from '@taucad/types';

const defaultParameterGroupName = 'default';

/**
 * Parse a JSON string into a validated FileParameterEntry.
 * Throws on invalid JSON or schema-invalid content.
 */
export const parseParameterEntry = (json: string): FileParameterEntry =>
  fileParameterEntrySchema.parse(JSON.parse(json));

/**
 * Create a default entry with a single empty default group.
 */
export const createDefaultEntry = (): FileParameterEntry => createParameterEntry({});

/** Create the canonical default parameter group populated with values. */
export const createParameterEntry = (values: Record<string, unknown>): FileParameterEntry =>
  fileParameterEntrySchema.parse({
    activeGroup: defaultParameterGroupName,
    groups: {
      [defaultParameterGroupName]: { values },
    },
  });

/**
 * Return a new entry with updated values for a specific group.
 * Creates the group if it doesn't exist.
 */
export const updateGroupValues = (
  entry: FileParameterEntry,
  options: { groupName: string; values: Record<string, unknown> },
): FileParameterEntry => {
  const { groupName, values } = options;
  return fileParameterEntrySchema.parse({
    ...entry,
    groups: {
      ...entry.groups,
      [groupName]: { values },
    },
  });
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
  const updatedOrder = entry.order?.filter((name) => name !== groupName);
  return fileParameterEntrySchema.parse({
    ...entry,
    ...(updatedOrder ? { order: updatedOrder } : {}),
    groups: remainingGroups,
  });
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

  return fileParameterEntrySchema.parse({
    ...entry,
    activeGroup: entry.activeGroup === oldName ? newName : entry.activeGroup,
    ...(updatedOrder ? { order: updatedOrder } : {}),
    groups: {
      ...remainingGroups,
      [newName]: groupToRename!,
    },
  });
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
 * Serialize a FileParameterEntry to a formatted JSON string.
 *
 * Throws before writing schema-invalid or JSON-unsafe content.
 */
export const serializeParameterEntry = (entry: FileParameterEntry): string =>
  JSON.stringify(fileParameterEntrySchema.parse(entry), null, 2);
