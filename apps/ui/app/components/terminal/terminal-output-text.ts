/**
 * Terminal output as plain text for assistive technology (blueprint A15, I9): the Terminal pane's live region and
 * screen mirror only ever take text through `textContent`, never HTML, and drop every control sequence first, so
 * output can describe a trusted action but never perform one.
 */

/* ESC sequences (CSI, OSC, DCS/SOS/PM/APC, two-byte) and C0 controls other than line feed. */
const controlSequences =
  // oxlint-disable-next-line no-control-regex -- Stripping terminal control sequences is the point of this pattern.
  /\u001B(?:\[[0-?]*[ -/]*[@-~]|][^\u0007\u001B]*(?:\u0007|\u001B\\)?|[PX^_][^\u001B]*(?:\u001B\\)?|[@-Z\\-_])|[\u0000-\u0009\u000B-\u001F\u007F]/g;

/**
 * The visible lines of a run of terminal output: control sequences removed, trailing blanks trimmed, empty lines
 * dropped, and only the last `maxLines` kept.
 *
 * @param output - Raw output as the shell wrote it.
 * @param maxLines - How many of the last lines to keep.
 * @returns The lines, oldest first.
 */
export const outputLines = (output: string, maxLines: number): string[] =>
  output
    .replaceAll(controlSequences, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(-maxLines);

/**
 * Whether a link the person activated in terminal output may be handed to Tau's navigation policy: only an
 * `http(s)` URL, and only on Ctrl/Cmd+click, so output alone never opens anything and no `file:`, `javascript:` or
 * custom-scheme link is ever followed.
 *
 * @param uri - The link target the renderer found (a plain URL or an OSC 8 hyperlink).
 * @param event - The click that activated it.
 * @returns Whether to open it.
 */
export const isOpenableTerminalLink = (uri: string, event: Pick<MouseEvent, 'ctrlKey' | 'metaKey'>): boolean => {
  if (!event.ctrlKey && !event.metaKey) {
    return false;
  }
  try {
    const { protocol } = new URL(uri);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Split output into slices of at most `size` UTF-16 code units without cutting a surrogate pair, so each renderer
 * parse is bounded and typed input is never queued behind a whole backlog.
 *
 * @param data - One output frame.
 * @param size - The largest slice.
 * @returns The slices in order; one empty-string frame yields no slices.
 */
export const outputSlices = (data: string, size: number): string[] => {
  const slices: string[] = [];
  let start = 0;
  while (start < data.length) {
    let end = Math.min(data.length, start + size);
    // oxlint-disable-next-line unicorn/prefer-code-point -- The UTF-16 unit is what tells a split surrogate pair.
    const last = data.charCodeAt(end - 1);
    if (end < data.length && last >= 0xd8_00 && last <= 0xdb_ff) {
      end -= 1;
    }
    slices.push(data.slice(start, end));
    start = end;
  }
  return slices;
};
