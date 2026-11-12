/**
 * The one rule for the title a person reads for a History entry (C37, M6, Q9).
 *
 * The engine titles a turn's cuts itself: a base cut "Autosave" (A5) and a
 * result by the person's request, "Agent change" without one. What it still
 * generates for a save or an autosave is `Saved changes (<trigger>)`, which
 * names the trigger, not the change, so it never reaches the page.
 *
 * A leaf module: History's cards (`use-revisions`) and the agent's `history`
 * tool card (`revision-vocabulary`) both read it, and neither imports the other.
 */

const savedTitle = 'Saved changes (save)';
const savedPrefix = 'Saved changes (';

/**
 * The title of one entry from the summary the engine recorded for it.
 *
 * @param summary - The entry's summary: the edited title, else the generated one.
 * @returns "Saved changes" for an explicit save, "Autosave" for any other generated save, else the summary itself.
 * @public
 */
export const entryTitleOf = (summary: string): string => {
  if (summary === savedTitle) {
    return 'Saved changes';
  }
  return summary.startsWith(savedPrefix) && summary.endsWith(')') ? 'Autosave' : summary;
};
