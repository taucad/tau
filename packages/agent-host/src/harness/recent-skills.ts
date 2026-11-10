/**
 * Recently activated skills, folded from the chat's own event log (server agent plane regression review R2).
 *
 * The server agent plane wrote every `use_skill` activation to a store and re-injected the last eight after compaction,
 * so the model kept the instructions it had loaded. The Pi host kept the injection (`createTurnContextSnapshot`) but no
 * host supplied a store. The event log already holds every activation's result, and compaction only replaces envelopes,
 * never the appended rows, so it is the store.
 *
 * @module
 */
import type { RecentSkill, RecentSkillsPort } from '#harness/cad-middleware.js';
import type { AgentLogEvent, JsonObject, JsonValue } from '#log/event-types.js';

/** Activations kept, newest first; the server agent plane's bound. */
export const maxRecentSkills = 8;

const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
  value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);

const useSkillToolName = 'use_skill';

const objectOf = (content: JsonValue): Readonly<Record<string, JsonValue>> | undefined => {
  let value: JsonValue = content;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as JsonValue;
    } catch {
      return undefined;
    }
  }
  return isJsonObject(value) ? value : undefined;
};

const stringAt = (record: Readonly<Record<string, JsonValue>>, key: string): string | undefined => {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * The skills a chat activated, newest first, one per name.
 *
 * @param events - The chat's event log rows.
 * @returns At most {@link maxRecentSkills} skills with the instructions each activation returned.
 */
export const foldRecentSkills = (events: readonly AgentLogEvent[]): RecentSkill[] => {
  const byName = new Map<string, RecentSkill>();
  for (const event of events) {
    if (event.type !== 'message.appended') {
      continue;
    }
    const { message } = event;
    if (message.role !== 'tool-output' || message.toolName !== useSkillToolName || message.isError) {
      continue;
    }
    const output = objectOf(message.content);
    const skillName = output === undefined ? undefined : stringAt(output, 'skillName');
    const resourceUri = output === undefined ? undefined : stringAt(output, 'resourceUri');
    if (output === undefined || skillName === undefined || resourceUri === undefined) {
      continue;
    }
    const skillPath = stringAt(output, 'skillPath');
    const source = stringAt(output, 'source');
    const fingerprint = stringAt(output, 'fingerprint');
    const content = stringAt(output, 'content');
    /* Re-inserting moves a repeated activation to the newest position. */
    byName.delete(skillName);
    byName.set(skillName, {
      skillName,
      resourceUri,
      ...(skillPath === undefined ? {} : { skillPath }),
      ...(source === undefined ? {} : { source }),
      ...(fingerprint === undefined ? {} : { fingerprint }),
      ...(content === undefined ? {} : { content }),
    });
  }
  return [...byName.values()].toReversed().slice(0, maxRecentSkills);
};

/**
 * A {@link RecentSkillsPort} over one session's event log: the default when the host supplies none.
 *
 * @param events - Reads the session's event log rows.
 * @returns The port.
 */
export const createEventLogRecentSkills = (events: () => Promise<readonly AgentLogEvent[]>): RecentSkillsPort => ({
  load: async () => foldRecentSkills(await events()),
});
