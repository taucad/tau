import { fileParameterEntrySchema } from '@taucad/types';
import type { FileParameterEntry } from '@taucad/types';
import { serializeParameterRecord } from '@taucad/parameters';

const defaultParameterGroupName = 'default';

/** Create an empty current parameter record for a new local project. */
export const createDefaultEntry = (): FileParameterEntry => createParameterEntry({});

/** Create the current default-group record populated with native values. */
export const createParameterEntry = (values: Record<string, unknown>): FileParameterEntry =>
  fileParameterEntrySchema.parse({
    activeGroup: defaultParameterGroupName,
    groups: { [defaultParameterGroupName]: { values } },
  });

/** Serialize a validated current record in the authority's canonical byte form. */
export const serializeParameterEntry = (entry: FileParameterEntry): string =>
  new TextDecoder().decode(serializeParameterRecord(entry));
