import { join, win32 } from 'node:path';

/**
 * Where the baseline read-deny set is computed for.
 *
 * @public
 */
export type ShellBaselineOptions = Readonly<{
  platform: NodeJS.Platform;
  /** The person's home or profile root. */
  home: string;
  /** The host's environment, for `XDG_RUNTIME_DIR`, `APPDATA` and `LOCALAPPDATA`. */
  environment: Readonly<Record<string, string | undefined>>;
}>;

/** Credential stores and shell or editor startup files, relative to the home root (D20). */
const homeEntries: readonly string[] = [
  '.ssh',
  '.aws',
  '.azure',
  '.gnupg',
  '.kube',
  '.docker',
  '.netrc',
  '.npmrc',
  '.yarnrc',
  '.pypirc',
  '.git-credentials',
  '.gitconfig',
  '.config/gh',
  '.config/gcloud',
  '.config/git',
  '.bashrc',
  '.bash_profile',
  '.bash_login',
  '.bash_logout',
  '.bash_history',
  '.profile',
  '.zshrc',
  '.zshenv',
  '.zprofile',
  '.zlogin',
  '.config/fish',
  '.inputrc',
  '.vimrc',
  '.config/nvim',
  '.emacs',
  '.emacs.d',
];

/** The Zsh startup files, relative to `ZDOTDIR`, in the order Zsh reads them. */
const zshStartupNames: readonly string[] = ['.zshenv', '.zprofile', '.zshrc', '.zlogin'];

/**
 * The person's own Zsh startup files: the only baseline entries a launch may reopen, read-only, and only for the
 * human macOS Terminal's system Zsh (operator ruling 2026-11-01T18:57Z).
 *
 * @public
 * @param home - The person's home root.
 * @returns Absolute paths, in the order Zsh reads them.
 */
export const zshStartupFiles = (home: string): readonly string[] => zshStartupNames.map((name) => join(home, name));

/**
 * The provider-owned floor of the D20 never-grantable set and the D26 runtime-socket directories, as absolute paths
 * for one platform. A launch's `denied` list always carries these; the host adds Tau app data and every other admitted
 * project root, which only it knows. Paths that do not exist on this device are still listed, so a name created
 * after launch is denied too where the provider can express it.
 *
 * Windows named pipes (`\\.\pipe\*`) are not filesystem paths; the Windows provider fences them itself.
 *
 * @public
 * @param options - Platform, home root and host environment.
 * @returns Absolute native paths, without duplicates.
 */
export const shellBaselineDenied = (options: ShellBaselineOptions): readonly string[] => {
  const { platform, home, environment } = options;
  if (platform === 'win32') {
    const roaming = environment['APPDATA'] ?? win32.join(home, 'AppData', 'Roaming');
    const local = environment['LOCALAPPDATA'] ?? win32.join(home, 'AppData', 'Local');
    return [
      ...new Set([
        ...homeEntries.map((entry) => win32.join(home, ...entry.split('/'))),
        win32.join(home, 'Documents', 'PowerShell'),
        win32.join(home, 'Documents', 'WindowsPowerShell'),
        win32.join(roaming, 'Microsoft', 'Credentials'),
        win32.join(roaming, 'Microsoft', 'Protect'),
        win32.join(roaming, 'Microsoft', 'Crypto'),
        win32.join(roaming, 'Microsoft', 'SystemCertificates'),
        win32.join(roaming, 'Microsoft', 'Windows', 'PowerShell'),
        win32.join(local, 'Microsoft', 'Credentials'),
        win32.join(local, 'Microsoft', 'Vault'),
        win32.join(local, 'Microsoft', 'PowerShell'),
        win32.join(local, 'Microsoft', 'WindowsApps'),
      ]),
    ];
  }
  const sockets =
    platform === 'darwin'
      ? [
          '/var/run',
          '/private/var/run',
          '/private/var/tmp',
          '/Library/Keychains',
          join(home, 'Library', 'Keychains'),
          join(home, 'Library', 'Application Support', 'com.apple.TCC'),
          join(home, 'Library', 'Cookies'),
        ]
      : [
          '/run',
          '/var/run',
          '/run/user',
          '/run/dbus',
          '/run/systemd',
          '/run/snapd.socket',
          '/run/docker.sock',
          '/var/run/docker.sock',
          '/var/lib/docker',
          '/run/containerd',
          ...(environment['XDG_RUNTIME_DIR'] === undefined ? [] : [environment['XDG_RUNTIME_DIR']]),
          join(home, '.local', 'share', 'keyrings'),
        ];
  return [...new Set([...homeEntries.map((entry) => join(home, entry)), ...sockets])];
};
