import { currentFileParameterEntrySchema, fileParameterRecordProfile } from '@taucad/types';
import type { CurrentFileParameterEntry, FileParameterEntry } from '@taucad/types';

const defaultParameterGroupName = 'default';

/** Create an empty current parameter record for a new local project. */
export const createDefaultEntry = (): CurrentFileParameterEntry => createParameterEntry({});

/** Create the current default-group record populated with native values. */
export const createParameterEntry = (values: Record<string, unknown>): CurrentFileParameterEntry =>
  currentFileParameterEntrySchema.parse({
    recordVersion: 1,
    profile: fileParameterRecordProfile,
    activeGroup: defaultParameterGroupName,
    groups: {
      [defaultParameterGroupName]: { values },
    },
  });

/** Serialize a validated current record for local project creation. */
export const serializeParameterEntry = (entry: FileParameterEntry): string =>
  `${JSON.stringify(currentFileParameterEntrySchema.parse(entry), undefined, 2)}\n`;
