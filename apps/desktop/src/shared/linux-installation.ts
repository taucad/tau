/** Package-manager layout shared by producers, the running app and installed qualification. */
export const linuxInstallation = (
  channel: 'production' | 'staging',
  appImage = false,
): {
  name: string;
  scheme: string;
  root: string;
  launcher: string;
  /**
   * Tau-owned bubblewrap the shell sandbox runs (`bwrapPath`). The selector package's `postinst`
   * installs it, at this stable path outside every immutable generation, and it is the one
   * path the `bwrapProfile` AppArmor profile attaches to. A portable AppImage has no such file.
   */
  bwrap: string;
  /** AppArmor profile name, and its `/etc/apparmor.d` file name, granting `userns` to `bwrap` only. */
  bwrapProfile: string;
  executable: 'Tau' | 'Tau.AppImage';
  runtimeKind: 'linux-deb-runtime' | 'linux-appimage-deb-runtime';
  selectorKind: 'linux-deb-selector' | 'linux-appimage-deb-selector';
} => {
  const scheme = channel === 'staging' ? 'tau-staging' : 'tau';
  const name = `${scheme}${appImage ? '-appimage' : ''}`;
  return {
    name,
    scheme,
    root: `/opt/${name}`,
    launcher: `/usr/bin/${name}`,
    bwrap: `/opt/${name}/sandbox/bwrap`,
    bwrapProfile: `${name}-bwrap`,
    executable: appImage ? 'Tau.AppImage' : 'Tau',
    runtimeKind: appImage ? 'linux-appimage-deb-runtime' : 'linux-deb-runtime',
    selectorKind: appImage ? 'linux-appimage-deb-selector' : 'linux-deb-selector',
  } as const;
};

/** Debian package roles admitted to the authenticated repository inventory. */
export const linuxDebKinds = [
  'linux-deb-runtime',
  'linux-deb-selector',
  'linux-appimage-deb-runtime',
  'linux-appimage-deb-selector',
] as const;
