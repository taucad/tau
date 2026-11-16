// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { zshStartupFiles } from '#shell/shell-baseline.js';
import { zshStartupWrappers } from '#shell/shell-zsh-startup.js';

const folder = '/var/folders/xy/T/tau-shell-zsh-abc';
const home = '/Users/person';

describe('zshStartupWrappers', () => {
  it('should write one wrapper per Zsh startup file, in the order Zsh reads them', () => {
    const wrappers = zshStartupWrappers({ folder, home, toolchainBins: [] });

    expect(Object.keys(wrappers)).toStrictEqual(zshStartupFiles(home).map((path) => basename(path)));
  });

  it("should read each of the person's files only if it exists, then hand ZDOTDIR back for the next one", () => {
    const wrappers = zshStartupWrappers({ folder, home, toolchainBins: [] });

    expect(wrappers['.zshenv']).toContain(`__tau_zdotdir='/Users/person'\nZDOTDIR=$__tau_zdotdir\n`);
    for (const name of ['.zshenv', '.zprofile', '.zshrc', '.zlogin']) {
      expect(wrappers[name]).toContain(
        `if [[ -r "$ZDOTDIR/${name}" ]]; then builtin source "$ZDOTDIR/${name}"; fi\n__tau_zdotdir=$ZDOTDIR\n`,
      );
    }
    expect(wrappers['.zshenv']).toContain(
      `if [[ -o login || -o interactive ]]; then\n  ZDOTDIR='${folder}'\nelse\n  unset __tau_zdotdir\nfi\n`,
    );
    expect(wrappers['.zprofile']).toMatch(new RegExp(String.raw`\nZDOTDIR='${folder}'\n$`, 'u'));
    expect(wrappers['.zshrc']).toContain(`if [[ -o login ]]; then\n  ZDOTDIR='${folder}'\n`);
    /* The last file leaves ZDOTDIR at the person's home. */
    expect(wrappers['.zlogin']).not.toContain(`ZDOTDIR='${folder}'`);
    expect(wrappers['.zlogin']).toMatch(/\nunset __tau_zdotdir\n$/u);
  });

  it("should put the toolchain back at the front of path after the person's .zshrc and .zlogin only", () => {
    const wrappers = zshStartupWrappers({ folder, home, toolchainBins: ['/opt/tau/git/bin', '/opt/tau/lfs'] });
    // oxlint-disable-next-line no-template-curly-in-string -- Zsh text.
    const front = "  local -a bins=('/opt/tau/git/bin' '/opt/tau/lfs')\n  path=($bins ${path:|bins})\n";

    for (const name of ['.zshrc', '.zlogin']) {
      const text = wrappers[name]!;
      expect(text).toContain(front);
      expect(text.indexOf(front)).toBeGreaterThan(text.indexOf('builtin source'));
    }
    expect(wrappers['.zshenv']).not.toContain('path=');
    expect(wrappers['.zprofile']).not.toContain('path=');
    expect(zshStartupWrappers({ folder, home, toolchainBins: [] })['.zshrc']).not.toContain('path=');
  });

  it('should quote the folder and home, and leave out a toolchain folder unsafe on path', () => {
    const wrappers = zshStartupWrappers({
      folder: "/tmp/tau's zsh",
      home: "/Users/o'brien $HOME",
      toolchainBins: ['/opt/tool chain/bin', "/opt/it's", '/opt/a:b', '/opt/$(id)', 'relative/bin', '/opt/new\nline'],
    });

    expect(wrappers['.zshenv']).toContain(String.raw`__tau_zdotdir='/Users/o'\''brien $HOME'`);
    expect(wrappers['.zprofile']).toContain(String.raw`ZDOTDIR='/tmp/tau'\''s zsh'`);
    expect(wrappers['.zshrc']).toContain("  local -a bins=('/opt/tool chain/bin')\n");
  });

  it('should send the history macOS names after the wrapper folder to the person', () => {
    const wrappers = zshStartupWrappers({ folder, home, toolchainBins: [] });

    expect(wrappers['.zshrc']).toContain(
      `if [[ $HISTFILE == '${folder}/.zsh_history' ]]; then HISTFILE=$__tau_zdotdir/.zsh_history; fi\nZDOTDIR=$__tau_zdotdir\n`,
    );
  });
});

/*
 * The wrappers under a real login interactive Zsh, where one is installed. The person's .zprofile stands in for
 * macOS's path_helper, moving the system folders first, and their .zshrc sets options that would break a careless
 * wrapper. Their .zlogin is absent.
 */
describe.runIf(existsSync('/bin/zsh'))('zshStartupWrappers under Zsh', () => {
  let base: string | undefined;
  afterEach(() => {
    if (base !== undefined) {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("should read the person's files and leave the toolchain first, without duplicates", () => {
    base = mkdtempSync(join(tmpdir(), 'tau-zsh-startup-'));
    const wrapperFolder = join(base, 'wrappers');
    const person = join(base, "person's home");
    const toolchain = join(base, 'tool chain', 'bin');
    for (const directory of [wrapperFolder, person, toolchain]) {
      mkdirSync(directory, { recursive: true });
    }
    for (const [name, text] of Object.entries(
      zshStartupWrappers({ folder: wrapperFolder, home: person, toolchainBins: [toolchain] }),
    )) {
      writeFileSync(join(wrapperFolder, name), text);
    }
    writeFileSync(join(person, '.zshenv'), 'print -r -- read-zshenv\n');
    writeFileSync(
      join(person, '.zprofile'),
      'path=(/usr/bin /bin $path); typeset -U path; print -r -- read-zprofile\n',
    );
    writeFileSync(join(person, '.zshrc'), 'path=(/brew/bin $path); setopt KSH_ARRAYS SH_WORD_SPLIT\n');

    const output = execFileSync(
      '/bin/zsh',
      [
        '-l',
        '-i',
        '-c',
        // oxlint-disable-next-line no-template-curly-in-string -- Zsh text.
        'print -r -- "ZDOTDIR=$ZDOTDIR"; print -r -- "PATH=$PATH"; print -r -- "${__tau_zdotdir-unset}"',
      ],
      {
        encoding: 'utf8',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
        env: { HOME: base, PATH: `${toolchain}:/usr/bin:/bin`, ZDOTDIR: wrapperFolder, TERM: 'dumb' },
      },
    );
    const lines = output.split('\n');
    const path = lines
      .find((line) => line.startsWith('PATH='))!
      .slice('PATH='.length)
      .split(':');

    expect(lines).toStrictEqual(expect.arrayContaining(['read-zshenv', 'read-zprofile', `ZDOTDIR=${person}`, 'unset']));
    expect(path.slice(0, 2)).toStrictEqual([toolchain, '/brew/bin']);
    expect(path.filter((entry) => entry === toolchain)).toHaveLength(1);
    expect(path).toStrictEqual(expect.arrayContaining(['/usr/bin', '/bin']));
  });
});
