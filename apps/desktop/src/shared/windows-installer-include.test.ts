import { describe, expect, it } from 'vitest';

import { windowsInstallerInclude } from '#shared/windows-installer-include.js';

/** An NSIS symbol reference, spelled without JavaScript's template syntax. */
const symbol = (name: string): string => ['$', '{', name, '}'].join('');

describe('windowsInstallerInclude', () => {
  const include = windowsInstallerInclude({
    protocolKey: String.raw`Software\Classes\tau-staging`,
    name: 'Tau Staging',
  });
  const macro = (name: string): string => {
    const start = include.indexOf(`!macro ${name}\n`);
    expect(start).toBeGreaterThanOrEqual(0);
    return include.slice(start, include.indexOf('!macroend', start) + '!macroend'.length);
  };

  it('should register and remove only its own protocol handler, unchanged from the shipped include', () => {
    expect(macro('customInstall')).toBe(
      String.raw`!macro customInstall
  WriteRegStr HKCU "Software\Classes\tau-staging" "" "URL:Tau Staging"
  WriteRegStr HKCU "Software\Classes\tau-staging" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\tau-staging\shell\open\command" "" '"$INSTDIR\Tau.exe" "%1"'
!macroend`,
    );
    expect(macro('customUnInstall')).toContain(
      String.raw`  Push $0
  ReadRegStr $0 HKCU "Software\Classes\tau-staging\shell\open\command" ""
  StrCmp $0 '"$INSTDIR\Tau.exe" "%1"' 0 +2
  DeleteRegKey HKCU "Software\Classes\tau-staging"
  Pop $0`,
    );
  });

  it('should revoke the Windows sandbox, elevated, on a real uninstall where setup ran, and never on an update', () => {
    expect(macro('customUnInstall')).toContain(
      [
        `  ${symbol('ifNot')} ${symbol('isUpdated')}`,
        '    Push $1',
        '    ReadEnvStr $1 ProgramData',
        '    StrCmp $1 "" tau_sandbox_revoked',
        String.raw`    IfFileExists "$1\Tau\Sandbox\install.json" 0 tau_sandbox_revoked`,
        String.raw`    IfFileExists "$INSTDIR\resources\windows-sandbox\win32-x64\tau-windows-sandbox.exe" 0 tau_sandbox_revoked`,
        String.raw`    ExecShellWait "runas" "$INSTDIR\resources\windows-sandbox\win32-x64\tau-windows-sandbox.exe" "revoke" SW_HIDE`,
        '    ClearErrors',
        '    tau_sandbox_revoked:',
        '    Pop $1',
        `  ${symbol('endIf')}`,
      ].join('\n'),
    );
  });

  it('should never elevate from the installer: setup belongs to the first use', () => {
    expect(macro('customInstall')).not.toMatch(/runas|setup|tau-windows-sandbox/u);
  });
});
