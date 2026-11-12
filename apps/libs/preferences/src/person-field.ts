import { goalIds, languageIds } from '#person-profile.js';
import type { GoalId, LanguageId, PersonProfile } from '#person-profile.js';

/**
 * What the agent is told about a person: the goals other than "Just exploring", and the languages. It has the shape
 * of the agent config's `person` field, whose closed enums the chat contract owns; the app checks the two agree.
 *
 * @public
 */
export type PersonField = {
  makes: Array<Exclude<GoalId, 'exploring'>>;
  reads: LanguageId[];
};

/**
 * Build the agent's `person` field from the stored profile. "Just exploring" says nothing the agent can use and is
 * left out, and the tool answer is never sent. Each list follows setup's order, so the same answers always give the
 * same field. With nothing left to say there is no field.
 *
 * @param profile - The `person-profile` section.
 * @returns The field, or `undefined` when both lists are empty.
 * @public
 */
export const personFieldFromProfile = (profile: PersonProfile): PersonField | undefined => {
  const makes = goalIds.filter(
    (goal): goal is Exclude<GoalId, 'exploring'> => goal !== 'exploring' && profile.goals.includes(goal),
  );
  const reads = languageIds.filter((language) => profile.languages.includes(language));
  return makes.length === 0 && reads.length === 0 ? undefined : { makes, reads };
};
