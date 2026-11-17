/** The longest project name `tau.json` accepts (`projectManifestSchema`'s `name`, in UTF-16 code units). */
export const maxProjectNameLength = 200;

/**
 * Fit a name to what `tau.json` accepts: one line, runs of whitespace as one space, at most
 * `maxLength` code units, cut between code points and trimmed. A name past the limit fails the
 * manifest's validation, and with it the commit of the project's directory.
 *
 * @param name - Any name.
 * @param maxLength - The room the name has, when something is appended to it after.
 * @returns The name as a manifest holds it; empty when it held only whitespace.
 */
export const fitProjectName = (name: string, maxLength = maxProjectNameLength): string => {
  let fitted = '';
  for (const codePoint of name.replaceAll(/\s+/gu, ' ').trim()) {
    if (fitted.length + codePoint.length > maxLength) {
      break;
    }
    fitted += codePoint;
  }
  return fitted.trimEnd();
};

/**
 * The project name a naming model's reply gives. The profile asks for a short title alone, but a
 * model can answer the prompt instead: asked for "one short line" per image, it returned one title
 * per line, past the manifest's limit. The first non-empty line is the title; quotes and Markdown
 * emphasis around it are dropped.
 *
 * @param reply - The model's text.
 * @returns The name, fitted to the manifest; empty when the reply held none.
 */
export const projectNameFromReply = (reply: string): string => {
  const firstLine = reply.split(/\r?\n/u).find((line) => line.trim() !== '') ?? '';
  const unwrapped = firstLine.trim().replaceAll(/^[\s"'`*#_]+|[\s"'`*_]+$/gu, '');
  return fitProjectName(unwrapped);
};
