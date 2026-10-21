const artifact = (kind: string, name: string) => ({ kind, name, sha256: 'a'.repeat(64), size: 123 });
const createProjection = () => ({
  schemaVersion: 1,
  tag: 'desktop@0.2.0',
  channel: 'production',
  version: '0.2.0',
  sourceCommit: 'b'.repeat(40),
  promoted: true,
  routes: [
    {
      route: 'macos-zip',
      target: 'darwin-arm64',
      qualification: { ci: true, vm: true, trust: 'release' },
      artifacts: [artifact('macos-dmg', 'Tau-macos-arm64.dmg'), artifact('macos-zip', 'Tau-macos-arm64.zip')],
    },
    {
      route: 'macos-zip',
      target: 'darwin-x64',
      qualification: { ci: true, vm: true, trust: 'release' },
      artifacts: [artifact('macos-dmg', 'Tau-macos-x64.dmg'), artifact('macos-zip', 'Tau-macos-x64.zip')],
    },
    {
      route: 'windows-nsis',
      target: 'win32-x64',
      qualification: { ci: true, vm: true, trust: 'release' },
      artifacts: [artifact('windows-nsis', 'Tau-win32-x64.exe'), artifact('windows-zip', 'Tau-win32-x64.zip')],
    },
    {
      route: 'linux-apt',
      target: 'linux-x64',
      qualification: { ci: true, vm: true, trust: 'release' },
      artifacts: [
        artifact('linux-deb-selector', 'tau_0.2.0_amd64.deb'),
        artifact('linux-deb-runtime', 'tau-runtime-0.2.0_0.2.0_amd64.deb'),
        artifact('linux-tar', 'Tau-linux-x64.tar.gz'),
      ],
    },
    {
      route: 'linux-appimage',
      target: 'linux-x64',
      qualification: { ci: true, vm: true, trust: 'release' },
      artifacts: [artifact('linux-appimage', 'Tau-linux-x64.AppImage'), artifact('linux-tar', 'Tau-linux-x64.tar.gz')],
    },
  ],
});

export const projection = (): ReturnType<typeof createProjection> => createProjection();
