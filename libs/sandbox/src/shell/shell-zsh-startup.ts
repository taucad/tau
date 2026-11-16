/**
 * The human macOS Terminal's Zsh startup wrappers, after VS Code's shell integration. The Terminal runs `/bin/zsh -l
 * -i`, and as a login shell `/etc/zprofile` runs `path_helper`, which moves the system folders ahead of every inherited
 * `PATH` entry: Apple's `/usr/bin/git` (an xcrun shim that cannot write its cache in the sandbox) then wins over the
 * host's toolchain. The provider points `ZDOTDIR` at a folder of its own holding these wrappers: each reads the
 * person's matching file from their home, read-only as before, and hands `ZDOTDIR` back so Zsh finds the next
 * wrapper. After the person's `.zshrc` and `.zlogin` the toolchain folders go back to the front of `path`. The last
 * file leaves `ZDOTDIR` at the person's home, so a nested Zsh reads their files directly.
 */
/** A Zsh word that stands for exactly `value`. */
const quote = (value: string): string => `'${value.replaceAll("'", String.raw`'\''`)}'`;

/** A toolchain folder safe to put on `path`: absolute, and no `:`, quote, glob, newline or control character. */
const plainFolder = /^\/[\w ./@+,=~%-]*$/u;

/** The shell parameter that carries the person's `ZDOTDIR` from one wrapper to the next. */
const personParameter = '__tau_zdotdir';

/** @internal */
export type ZshStartupWrapperOptions = Readonly<{
  /** The folder the wrappers are written to, which `ZDOTDIR` names while Zsh starts. */
  folder: string;
  /** The person's home, which holds their own startup files. */
  home: string;
  /** The host's toolchain `bin` folders, in order. A folder with an unsafe character is left out. */
  toolchainBins: readonly string[];
}>;

/**
 * The text of each Zsh startup wrapper.
 *
 * @internal
 * @param options - The wrapper folder, the person's home and the toolchain folders.
 * @returns Each startup file's name, relative to `ZDOTDIR`, with its text, in the order Zsh reads them.
 */
export const zshStartupWrappers = (options: ZshStartupWrapperOptions): Readonly<Record<string, string>> => {
  const folder = quote(options.folder);
  const bins = [...new Set(options.toolchainBins.filter((bin) => plainFolder.test(bin)))];
  /* Anonymous function: the person's options (KSH_ARRAYS, SH_WORD_SPLIT) do not apply, and `bins` stays local. */
  const toolchainFirst =
    bins.length === 0
      ? []
      : [
          '() {',
          '  builtin emulate -L zsh',
          `  local -a bins=(${bins.map((bin) => quote(bin)).join(' ')})`,
          // oxlint-disable-next-line no-template-curly-in-string -- Zsh text: path without bins, then bins first.
          '  path=($bins ${path:|bins})',
          '}',
        ];
  /** Hand `ZDOTDIR` back to the wrappers when Zsh reads another startup file after this one (always, or on a test). */
  const handBack = (next: 'always' | 'never' | Readonly<{ test: string }>): string[] => {
    if (next === 'always') {
      return [`ZDOTDIR=${folder}`];
    }
    return next === 'never'
      ? [`unset ${personParameter}`]
      : [`if ${next.test}; then`, `  ZDOTDIR=${folder}`, 'else', `  unset ${personParameter}`, 'fi'];
  };
  const wrapper = (name: string, lines: Readonly<{ before?: string[]; after: string[] }>): string =>
    [
      `# Written by Tau for one Terminal session: reads the person's own ${name}.`,
      ...(lines.before ?? []),
      `ZDOTDIR=$${personParameter}`,
      `if [[ -r "$ZDOTDIR/${name}" ]]; then builtin source "$ZDOTDIR/${name}"; fi`,
      /* The person's file may move ZDOTDIR; Zsh would then read the next file from there. */
      `${personParameter}=$ZDOTDIR`,
      ...lines.after,
      '',
    ].join('\n');
  return {
    '.zshenv': wrapper('.zshenv', {
      before: [`${personParameter}=${quote(options.home)}`],
      after: handBack({ test: '[[ -o login || -o interactive ]]' }),
    }),
    '.zprofile': wrapper('.zprofile', { after: handBack('always') }),
    '.zshrc': wrapper('.zshrc', {
      /* On macOS /etc/zshrc names the history after ZDOTDIR, which is still this folder when it runs. */
      before: [
        `if [[ $HISTFILE == ${quote(`${options.folder}/.zsh_history`)} ]]; then HISTFILE=$${personParameter}/.zsh_history; fi`,
      ],
      after: [...toolchainFirst, ...handBack({ test: '[[ -o login ]]' })],
    }),
    '.zlogin': wrapper('.zlogin', { after: [...toolchainFirst, ...handBack('never')] }),
  };
};
