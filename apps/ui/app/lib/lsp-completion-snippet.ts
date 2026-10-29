/** Translate LSP snippet escapes and short tabstops for CodeMirror's snippet parser. */
export function lspSnippetToCodeMirror(insertText: string): string {
  return insertText.replaceAll(
    /\\([$\\])|\$(\d+)/g,
    // oxlint-disable-next-line max-params -- String.replaceAll callback supplies capture groups and match offset.
    (match, escaped: string | undefined, tabstop: string | undefined, offset: number) => {
      if (escaped) {
        // CodeMirror escapes braces, but not dollars. Escape the following brace if needed.
        const next = insertText[offset + match.length];
        if (escaped === '$' && next === '{') {
          return '$\\';
        }
        if (escaped === '\\' && (next === '{' || next === '}')) {
          return match;
        }
        return escaped;
      }
      return `\${${tabstop}}`;
    },
  );
}
